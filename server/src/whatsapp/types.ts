export type OutboundWhatsAppMessage =
  | { kind: "text"; to: string; text: string; replyToExternalId?: string }
  | { kind: "image"; to: string; mediaUrl: string; caption?: string }
  | { kind: "document"; to: string; mediaUrl: string; filename: string; caption?: string }
  | { kind: "template"; to: string; templateName: string; language: string; variables: Record<string, string> };

export interface SendResult {
  externalMessageId: string;
  status: "sent" | "failed";
  errorMessage?: string;
}

export interface MediaDownloadResult {
  buffer: Buffer;
  mimeType: string;
}

// Provider abstraction so the WhatsApp Cloud API can be swapped for a mock
// (local dev / demo mode) or, later, another BSP without touching callers.
export interface WhatsAppProvider {
  readonly isDemo: boolean;
  sendMessage(message: OutboundWhatsAppMessage): Promise<SendResult>;
  downloadMedia(mediaId: string): Promise<MediaDownloadResult>;
  markAsRead(externalMessageId: string): Promise<void>;
}
