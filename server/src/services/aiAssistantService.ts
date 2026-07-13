import { prisma } from "../lib/prisma";
import { getAiService } from "../openai";
import { logger } from "../lib/logger";

export class AiProcessingNotAllowedError extends Error {
  constructor() {
    super("KI-Verarbeitung ist für diesen Kunden deaktiviert (Einwilligung fehlt oder wurde widerrufen).");
  }
}

async function assertAiProcessingAllowed(customerId: string | null | undefined) {
  if (!customerId) return; // no customer linked yet (e.g. brand-new lead) - allowed
  const consent = await prisma.communicationConsent.findUnique({ where: { customerId } });
  if (consent && (!consent.aiProcessingAllowed || consent.revokedAt)) {
    throw new AiProcessingNotAllowedError();
  }
}

async function logAiUsage(feature: string, targetType: string, targetId: string, dataSentSummary: string, userId?: string) {
  await prisma.aiUsageLog.create({
    data: { feature, targetType, targetId, dataSentSummary, model: getAiService().model, userId },
  });
}

export async function generateReplySuggestionsForConversation(conversationId: string, userId?: string) {
  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { customer: true },
  });
  await assertAiProcessingAllowed(conversation.customerId);

  // Minimal data transfer: only the last N non-internal messages, no full
  // customer record, no bank/payment data.
  const recentMessages = await prisma.message.findMany({
    where: { conversationId, isInternalNote: false },
    orderBy: { createdAt: "desc" },
    take: 15,
  });
  recentMessages.reverse();

  const variants = await getAiService().generateReplySuggestions({
    conversationId,
    recentMessages: recentMessages.map((m) => ({ direction: m.direction, text: m.text ?? "", createdAt: m.createdAt })),
    customerName: [conversation.customer?.firstName, conversation.customer?.lastName].filter(Boolean).join(" ") || undefined,
  });

  const created = await Promise.all(
    variants.map((v) =>
      prisma.aiSuggestion.create({
        data: {
          conversationId,
          suggestionType: v.type,
          generatedText: v.text,
          model: getAiService().model,
          status: "PENDING",
        },
      })
    )
  );

  await logAiUsage("reply_suggestion", "conversation", conversationId, `${recentMessages.length} letzte Nachrichten`, userId);
  return created;
}

export async function refineSuggestion(suggestionId: string, instruction: string, userId?: string) {
  const suggestion = await prisma.aiSuggestion.findUniqueOrThrow({ where: { id: suggestionId } });
  const base = suggestion.editedText ?? suggestion.generatedText;
  const refined = await getAiService().refineText(base, instruction);
  const updated = await prisma.aiSuggestion.update({ where: { id: suggestionId }, data: { editedText: refined, status: "EDITED" } });
  await logAiUsage("reply_refine", "ai_suggestion", suggestionId, instruction, userId);
  return updated;
}

export async function extractCustomerDraftFromConversation(conversationId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId }, include: { customer: true } });
  if (!conversation) return;
  try {
    await assertAiProcessingAllowed(conversation.customerId);
  } catch {
    return; // consent withdrawn - silently skip automatic extraction
  }

  const messages = await prisma.message.findMany({
    where: { conversationId, isInternalNote: false, direction: "INBOUND" },
    orderBy: { createdAt: "asc" },
  });
  const conversationText = messages.map((m) => m.text).filter(Boolean).join("\n");
  if (!conversationText.trim()) return;

  const extracted = await getAiService().extractCustomerData(conversationText);
  await prisma.customerDraft.create({
    data: {
      customerId: conversation.customerId,
      conversationId,
      extractedData: extracted as any,
      confidence: extracted.confidence as any,
      status: "PENDING",
    },
  });
  await logAiUsage("customer_data_extraction", "conversation", conversationId, "Eingehende Kundennachrichten (Text)");
  logger.info({ conversationId }, "customer draft extracted, awaiting user review");
}

export async function summarizeConversationText(conversationId: string, userId?: string) {
  await assertAiProcessingAllowed((await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } })).customerId);
  const messages = await prisma.message.findMany({ where: { conversationId, isInternalNote: false }, orderBy: { createdAt: "asc" } });
  const summary = await getAiService().summarizeConversation(messages);
  await logAiUsage("summarize_conversation", "conversation", conversationId, `${messages.length} Nachrichten`, userId);
  return summary;
}
