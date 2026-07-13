import { Router } from "express";
import { z } from "zod";
import { getAiService } from "../openai";
import { tools, toolByName } from "../openai/tools";
import { createPendingAction, consumePendingAction } from "../openai/pendingActions";
import { asyncHandler } from "../lib/asyncHandler";
import { prisma } from "../lib/prisma";

export const assistantRouter = Router();

const chatSchema = z.object({
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
});

function previewFor(toolName: string, args: Record<string, unknown>): string {
  if (toolName === "sendWhatsAppMessage") {
    return `WhatsApp-Nachricht an Unterhaltung ${args.conversationId} senden:\n\n"${args.text}"`;
  }
  return `${toolName}(${JSON.stringify(args)})`;
}

// "Broszeit-Assistent": reads/drafts freely, but every tool call with a real
// side effect comes back as a pendingAction instead of executing - the
// frontend must call /confirm-action before anything actually happens.
assistantRouter.post(
  "/chat",
  asyncHandler(async (req, res) => {
    const { history } = chatSchema.parse(req.body);
    const result = await getAiService().chat(history, tools);

    const pendingActions = [];
    const executedResults: Record<string, unknown> = {};

    for (const call of result.toolCalls) {
      const tool = toolByName.get(call.name);
      if (!tool) continue;
      if (tool.requiresConfirmation) {
        const pending = createPendingAction(call.name, call.arguments, previewFor(call.name, call.arguments));
        pendingActions.push({ id: pending.id, toolName: pending.toolName, preview: pending.preview });
      } else {
        executedResults[call.name] = await tool.execute(call.arguments);
      }
    }

    await prisma.aiUsageLog.create({
      data: {
        feature: "assistant_chat",
        targetType: "assistant",
        userId: req.user?.id,
        model: result.model,
        dataSentSummary: `${history.length} Chat-Nachrichten`,
      },
    });

    res.json({ reply: result.reply, toolResults: executedResults, pendingActions });
  })
);

assistantRouter.post(
  "/confirm-action/:actionId",
  asyncHandler(async (req, res) => {
    const pending = consumePendingAction(req.params.actionId);
    if (!pending) return res.status(404).json({ error: "Aktion nicht gefunden oder abgelaufen" });

    const tool = toolByName.get(pending.toolName);
    if (!tool) return res.status(400).json({ error: "Unbekanntes Werkzeug" });

    const result = await tool.execute(pending.args);
    await prisma.aiUsageLog.create({
      data: {
        feature: `assistant_tool:${pending.toolName}`,
        targetType: "assistant_action",
        targetId: pending.id,
        userId: req.user?.id,
        model: getAiService().model,
        dataSentSummary: pending.preview,
      },
    });
    res.json({ result });
  })
);

assistantRouter.post(
  "/confirm-action/:actionId/reject",
  asyncHandler(async (req, res) => {
    const pending = consumePendingAction(req.params.actionId);
    res.json({ discarded: Boolean(pending) });
  })
);
