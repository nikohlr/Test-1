import { prisma } from "../lib/prisma";
import { enqueueJob } from "../lib/queue";

// Every outbound send goes through the queue (never a direct fire-and-forget
// call) so transient WhatsApp/network errors get retried with backoff
// instead of silently failing.
export async function sendOutboundMessage(
  conversationId: string,
  text: string,
  opts: { isAiGenerated?: boolean; approvedByUserId?: string; messageType?: "TEXT" | "QUOTE_PDF" | "INVOICE_PDF" | "TEMPLATE"; mediaUrl?: string } = {}
) {
  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { id: conversationId } });
  if (!conversation.phoneNumber) throw new Error("Unterhaltung hat keine Telefonnummer hinterlegt");

  const message = await prisma.message.create({
    data: {
      conversationId,
      direction: "OUTBOUND",
      recipient: conversation.phoneNumber,
      messageType: opts.messageType ?? "TEXT",
      text,
      mediaUrl: opts.mediaUrl,
      deliveryStatus: "PENDING",
      isAiGenerated: opts.isAiGenerated ?? false,
      aiApprovedByUser: Boolean(opts.approvedByUserId),
    },
  });

  await enqueueJob("whatsapp.send", { messageId: message.id });
  await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: new Date() } });
  return message;
}

// Internal notes are stored as messages (so they sit inline in the timeline)
// but flagged isInternalNote so no send path can ever pick them up.
export async function createInternalNote(conversationId: string, text: string, createdByUserId: string) {
  return prisma.message.create({
    data: {
      conversationId,
      direction: "OUTBOUND",
      messageType: "INTERNAL_NOTE",
      isInternalNote: true,
      text,
      createdByUserId,
      deliveryStatus: "SENT",
      sentAt: new Date(),
    },
  });
}
