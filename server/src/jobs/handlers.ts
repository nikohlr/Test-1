import { registerJobHandler } from "../lib/queue";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { getWhatsAppProvider } from "../whatsapp";
import { processWhatsAppWebhookEvent } from "../whatsapp/webhookProcessor";
import { extractCustomerDraftFromConversation } from "../services/aiAssistantService";
import type { OutboundWhatsAppMessage } from "../whatsapp/types";
import type { Message } from "@prisma/client";

function buildOutboundPayload(message: Message): OutboundWhatsAppMessage {
  const to = message.recipient!;
  switch (message.messageType) {
    case "IMAGE":
      return { kind: "image", to, mediaUrl: message.mediaUrl!, caption: message.text ?? undefined };
    case "DOCUMENT":
    case "QUOTE_PDF":
    case "INVOICE_PDF":
      return { kind: "document", to, mediaUrl: message.mediaUrl!, filename: message.text ? `${message.text}.pdf` : "Dokument.pdf" };
    default:
      return { kind: "text", to, text: message.text ?? "" };
  }
}

export function registerAllJobHandlers() {
  registerJobHandler("whatsapp.processWebhookEvent", async (payload) => {
    await processWhatsAppWebhookEvent(payload.webhookEventId);
  });

  registerJobHandler("whatsapp.send", async (payload) => {
    const { messageId } = payload as { messageId: string };
    const message = await prisma.message.findUniqueOrThrow({ where: { id: messageId } });
    const provider = getWhatsAppProvider();

    const result = await provider.sendMessage(buildOutboundPayload(message));
    if (result.status === "sent") {
      await prisma.message.update({
        where: { id: messageId },
        data: { externalMessageId: result.externalMessageId || undefined, deliveryStatus: "SENT", sentAt: new Date() },
      });
    } else {
      // Throwing lets the queue's retry/backoff kick in for transient errors;
      // after maxAttempts the job (and message) end up FAILED for the UI to surface.
      await prisma.message.update({
        where: { id: messageId },
        data: { deliveryStatus: "FAILED", failedAt: new Date(), errorMessage: result.errorMessage },
      });
      throw new Error(result.errorMessage ?? "WhatsApp send failed");
    }
  });

  registerJobHandler("whatsapp.downloadMedia", async (payload) => {
    const { messageId, mediaId } = payload as { messageId: string; mediaId: string; waType: string };
    const provider = getWhatsAppProvider();
    const { buffer, mimeType } = await provider.downloadMedia(mediaId);

    // Storage: in production this should upload to S3/GCS/Blob storage and
    // store the resulting URL. Kept as a local-disk stub here to avoid
    // pulling in a cloud SDK dependency the deployer hasn't chosen yet.
    const storageUrl = await import("../lib/mediaStorage").then((m) => m.storeMediaBuffer(messageId, buffer, mimeType));

    await prisma.mediaAsset.create({
      data: { messageId, storageUrl, mimeType },
    });
    await prisma.message.update({ where: { id: messageId }, data: { mediaUrl: storageUrl } });
    logger.info({ messageId }, "WhatsApp media downloaded and stored");
  });

  registerJobHandler("ai.extractCustomerDraft", async (payload) => {
    const { conversationId } = payload as { conversationId: string };
    await extractCustomerDraftFromConversation(conversationId);
  });
}
