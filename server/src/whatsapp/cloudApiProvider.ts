import { env } from "../config/env";
import { logger } from "../lib/logger";
import type { MediaDownloadResult, OutboundWhatsAppMessage, SendResult, WhatsAppProvider } from "./types";

// Real implementation against the official WhatsApp Cloud API
// (https://developers.facebook.com/docs/whatsapp/cloud-api). No browser
// automation, no unofficial WhatsApp Web bots - Graph API calls only.
export class CloudApiWhatsAppProvider implements WhatsAppProvider {
  readonly isDemo = false;

  private get baseUrl() {
    return `https://graph.facebook.com/${env.whatsapp.apiVersion}/${env.whatsapp.phoneNumberId}`;
  }

  private get headers() {
    return {
      Authorization: `Bearer ${env.whatsapp.accessToken}`,
      "Content-Type": "application/json",
    };
  }

  async sendMessage(message: OutboundWhatsAppMessage): Promise<SendResult> {
    const body = this.toGraphPayload(message);
    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: "POST",
        headers: this.headers,
        body: JSON.stringify(body),
      });
      const json: any = await res.json();
      if (!res.ok) {
        const errorMessage = json?.error?.message ?? `WhatsApp API error (HTTP ${res.status})`;
        logger.error({ status: res.status, json }, "WhatsApp send failed");
        return { externalMessageId: "", status: "failed", errorMessage };
      }
      const externalMessageId = json?.messages?.[0]?.id;
      return { externalMessageId, status: "sent" };
    } catch (err: any) {
      logger.error({ err: err?.message }, "WhatsApp send threw");
      return { externalMessageId: "", status: "failed", errorMessage: err?.message ?? "unknown error" };
    }
  }

  async downloadMedia(mediaId: string): Promise<MediaDownloadResult> {
    const metaRes = await fetch(`https://graph.facebook.com/${env.whatsapp.apiVersion}/${mediaId}`, {
      headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` },
    });
    const meta: any = await metaRes.json();
    if (!metaRes.ok) throw new Error(meta?.error?.message ?? "Failed to resolve media URL");

    const fileRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${env.whatsapp.accessToken}` } });
    if (!fileRes.ok) throw new Error(`Failed to download media (HTTP ${fileRes.status})`);
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    return { buffer, mimeType: meta.mime_type ?? "application/octet-stream" };
  }

  async markAsRead(externalMessageId: string): Promise<void> {
    await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: externalMessageId }),
    });
  }

  private toGraphPayload(message: OutboundWhatsAppMessage) {
    const base = { messaging_product: "whatsapp", recipient_type: "individual" };
    switch (message.kind) {
      case "text":
        return {
          ...base,
          to: message.to,
          type: "text",
          text: { body: message.text },
          ...(message.replyToExternalId ? { context: { message_id: message.replyToExternalId } } : {}),
        };
      case "image":
        return { ...base, to: message.to, type: "image", image: { link: message.mediaUrl, caption: message.caption } };
      case "document":
        return {
          ...base,
          to: message.to,
          type: "document",
          document: { link: message.mediaUrl, filename: message.filename, caption: message.caption },
        };
      case "template":
        return {
          ...base,
          to: message.to,
          type: "template",
          template: {
            name: message.templateName,
            language: { code: message.language },
            components: [
              {
                type: "body",
                parameters: Object.values(message.variables).map((text) => ({ type: "text", text })),
              },
            ],
          },
        };
    }
  }
}
