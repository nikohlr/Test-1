import { randomUUID } from "crypto";
import { logger } from "../lib/logger";
import type { MediaDownloadResult, OutboundWhatsAppMessage, SendResult, WhatsAppProvider } from "./types";

// Used automatically whenever real WhatsApp credentials are not configured
// (demo mode) and in tests. Never calls out to Meta.
export class MockWhatsAppProvider implements WhatsAppProvider {
  readonly isDemo = true;

  async sendMessage(message: OutboundWhatsAppMessage): Promise<SendResult> {
    const externalMessageId = `mock-${randomUUID()}`;
    logger.info({ message, externalMessageId }, "[demo] WhatsApp send (not actually delivered)");
    return { externalMessageId, status: "sent" };
  }

  async downloadMedia(mediaId: string): Promise<MediaDownloadResult> {
    logger.info({ mediaId }, "[demo] WhatsApp media download (returning placeholder)");
    return { buffer: Buffer.from("demo-media-placeholder"), mimeType: "application/octet-stream" };
  }

  async markAsRead(externalMessageId: string): Promise<void> {
    logger.info({ externalMessageId }, "[demo] WhatsApp mark-as-read");
  }
}
