import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { createInternalNote, sendOutboundMessage } from "../services/messageService";
import { generateReplySuggestionsForConversation, refineSuggestion, summarizeConversationText } from "../services/aiAssistantService";

export const conversationsRouter = Router();

const FILTERS: Record<string, any> = {
  unread: { unreadCount: { gt: 0 } },
  new_leads: { customer: { status: "LEAD" } },
  quote_pending: { customer: { quotes: { some: { status: "SENT" } } } },
  appointment: { customer: { appointments: { some: { status: "PROPOSED" } } } },
  job_planned: { customer: { appointments: { some: { status: "CONFIRMED" } } } },
  invoice_open: { customer: { invoices: { some: { status: { in: ["SENT", "OVERDUE"] } } } } },
  callback_required: { customer: { tasks: { some: { type: "CALLBACK", status: "OPEN" } } } },
  archived: { status: "ARCHIVED" },
};

conversationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const filter = String(req.query.filter ?? "");
    const where = filter && FILTERS[filter] ? FILTERS[filter] : filter === "archived" ? FILTERS.archived : { status: { not: "ARCHIVED" } };

    const conversations = await prisma.conversation.findMany({
      where,
      include: {
        customer: { include: { tasks: { where: { status: "OPEN" }, take: 1 }, inquiries: { take: 1, orderBy: { createdAt: "desc" } } } },
        assignedUser: true,
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { lastMessageAt: "desc" },
    });

    res.json(
      conversations.map((c) => ({
        id: c.id,
        customer: c.customer,
        channel: c.channel,
        phoneNumber: c.phoneNumber,
        status: c.status,
        assignedUser: c.assignedUser,
        unreadCount: c.unreadCount,
        urgency: c.urgency,
        lastMessage: c.messages[0] ?? null,
        lastMessageAt: c.lastMessageAt,
        openTask: c.customer?.tasks?.[0] ?? null,
        latestInquiry: c.customer?.inquiries?.[0] ?? null,
      }))
    );
  })
);

conversationsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { customer: true, assignedUser: true },
    });
    if (!conversation) return res.status(404).json({ error: "Unterhaltung nicht gefunden" });
    res.json(conversation);
  })
);

conversationsRouter.get(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.id },
      include: { media: true, voiceTranscript: true, aiSuggestions: true },
      orderBy: { createdAt: "asc" },
    });
    res.json(messages);
  })
);

conversationsRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.update({ where: { id: req.params.id }, data: { unreadCount: 0 } });
    res.json(conversation);
  })
);

const patchSchema = z.object({
  assignedUserId: z.string().nullable().optional(),
  status: z.enum(["OPEN", "PENDING", "ARCHIVED"]).optional(),
  urgency: z.number().int().min(0).max(2).optional(),
});

conversationsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = patchSchema.parse(req.body);
    const conversation = await prisma.conversation.update({ where: { id: req.params.id }, data });
    res.json(conversation);
  })
);

// --- Sending ----------------------------------------------------------------
// The user must always click "Senden" explicitly - this endpoint is that
// click. AI-generated drafts pass through the same endpoint, they're just
// pre-filled text the user already reviewed in the UI.
const sendSchema = z.object({ text: z.string().min(1), aiSuggestionId: z.string().optional() });

conversationsRouter.post(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const { text, aiSuggestionId } = sendSchema.parse(req.body);
    const message = await sendOutboundMessage(req.params.id, text, {
      isAiGenerated: Boolean(aiSuggestionId),
      approvedByUserId: req.user?.id,
    });
    if (aiSuggestionId) {
      await prisma.aiSuggestion.update({
        where: { id: aiSuggestionId },
        data: { status: "SENT", approvedByUserId: req.user?.id, messageId: message.id },
      });
    }
    res.status(201).json(message);
  })
);

conversationsRouter.post(
  "/:id/notes",
  asyncHandler(async (req, res) => {
    const text = z.string().min(1).parse(req.body.text);
    const note = await createInternalNote(req.params.id, text, req.user?.id ?? "system");
    res.status(201).json(note);
  })
);

// --- AI suggestions ----------------------------------------------------------

conversationsRouter.post(
  "/:id/ai-suggestions",
  asyncHandler(async (req, res) => {
    const suggestions = await generateReplySuggestionsForConversation(req.params.id, req.user?.id);
    res.status(201).json(suggestions);
  })
);

conversationsRouter.post(
  "/ai-suggestions/:suggestionId/refine",
  asyncHandler(async (req, res) => {
    const instruction = z.string().min(1).parse(req.body.instruction);
    const updated = await refineSuggestion(req.params.suggestionId, instruction, req.user?.id);
    res.json(updated);
  })
);

conversationsRouter.post(
  "/:id/summarize",
  asyncHandler(async (req, res) => {
    const summary = await summarizeConversationText(req.params.id, req.user?.id);
    res.json({ summary });
  })
);
