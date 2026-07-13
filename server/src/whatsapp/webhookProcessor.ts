import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { enqueueJob } from "../lib/queue";
import { findOrCreateCustomerByPhone, findOrCreateWhatsAppConversation } from "../services/customerService";
import { MessageType } from "@prisma/client";

// Maps the WhatsApp Cloud API message "type" field to our internal enum.
function mapMessageType(waType: string): MessageType {
  switch (waType) {
    case "image":
      return MessageType.IMAGE;
    case "document":
      return MessageType.DOCUMENT;
    case "audio":
    case "voice":
      return MessageType.AUDIO;
    case "location":
      return MessageType.LOCATION;
    default:
      return MessageType.TEXT;
  }
}

function extractText(waMessage: any): string | undefined {
  if (waMessage.type === "text") return waMessage.text?.body;
  if (waMessage.type === "image" || waMessage.type === "document") return waMessage[waMessage.type]?.caption;
  if (waMessage.type === "location") {
    const loc = waMessage.location;
    return loc ? `Standort: ${loc.latitude}, ${loc.longitude}${loc.name ? ` (${loc.name})` : ""}` : undefined;
  }
  return undefined;
}

function extractMediaId(waMessage: any): string | undefined {
  return waMessage[waMessage.type]?.id;
}

// Processes one already-persisted WebhookEvent row (see webhookRoutes.ts).
// Idempotent: relies on Message.externalMessageId being a unique column, so
// re-processing the same delivery (Meta retries!) never double-inserts.
export async function processWhatsAppWebhookEvent(webhookEventId: string) {
  const event = await prisma.webhookEvent.update({
    where: { id: webhookEventId },
    data: { processingStatus: "PROCESSING" },
  });

  try {
    const payload = event.payload as any;
    const entries = payload?.entry ?? [];

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        for (const waMessage of value.messages ?? []) {
          await handleInboundMessage(waMessage, value.contacts?.[0]);
        }
        for (const status of value.statuses ?? []) {
          await handleStatusUpdate(status);
        }
      }
    }

    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processingStatus: "PROCESSED", processedAt: new Date() },
    });
  } catch (err: any) {
    logger.error({ err: err?.message, webhookEventId }, "failed to process WhatsApp webhook event");
    await prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: { processingStatus: "FAILED", errorMessage: String(err?.message ?? err) },
    });
    throw err;
  }
}

async function handleInboundMessage(waMessage: any, contact: any) {
  const externalMessageId: string = waMessage.id;

  // Idempotency: a message we've already stored is never stored/answered twice.
  const already = await prisma.message.findUnique({ where: { externalMessageId } });
  if (already) {
    logger.info({ externalMessageId }, "duplicate inbound WhatsApp message ignored");
    return;
  }

  const phoneNumber: string = waMessage.from;
  const { customer, isNew } = await findOrCreateCustomerByPhone(phoneNumber);
  if (isNew && contact?.profile?.name) {
    const [firstName, ...rest] = String(contact.profile.name).split(" ");
    await prisma.customer.update({
      where: { id: customer.id },
      data: { firstName, lastName: rest.join(" ") || null },
    });
  }
  const { conversation } = await findOrCreateWhatsAppConversation(customer.id, phoneNumber);

  const message = await prisma.message.create({
    data: {
      conversationId: conversation.id,
      direction: "INBOUND",
      sender: phoneNumber,
      messageType: mapMessageType(waMessage.type),
      text: extractText(waMessage),
      externalMessageId,
      deliveryStatus: "DELIVERED",
      sentAt: waMessage.timestamp ? new Date(Number(waMessage.timestamp) * 1000) : new Date(),
    },
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(), unreadCount: { increment: 1 } },
  });

  const mediaId = extractMediaId(waMessage);
  if (mediaId && ["image", "document", "audio", "voice"].includes(waMessage.type)) {
    await enqueueJob("whatsapp.downloadMedia", { messageId: message.id, mediaId, waType: waMessage.type });
  }

  if (isNew) {
    await enqueueJob("ai.extractCustomerDraft", { conversationId: conversation.id });
  }
}

async function handleStatusUpdate(status: any) {
  const externalMessageId: string = status.id;
  const message = await prisma.message.findUnique({ where: { externalMessageId } });
  if (!message) return; // status for a message we don't track (or already pruned)

  const timestamp = status.timestamp ? new Date(Number(status.timestamp) * 1000) : new Date();
  switch (status.status) {
    case "sent":
      await prisma.message.update({ where: { id: message.id }, data: { deliveryStatus: "SENT", sentAt: timestamp } });
      break;
    case "delivered":
      await prisma.message.update({
        where: { id: message.id },
        data: { deliveryStatus: "DELIVERED", deliveredAt: timestamp },
      });
      break;
    case "read":
      await prisma.message.update({ where: { id: message.id }, data: { deliveryStatus: "READ", readAt: timestamp } });
      break;
    case "failed":
      await prisma.message.update({
        where: { id: message.id },
        data: {
          deliveryStatus: "FAILED",
          failedAt: timestamp,
          errorMessage: status.errors?.[0]?.title ?? "Zustellung fehlgeschlagen",
        },
      });
      break;
  }
}
