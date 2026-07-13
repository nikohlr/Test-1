export interface ReplySuggestionRequest {
  conversationId: string;
  recentMessages: { direction: "INBOUND" | "OUTBOUND"; text: string; createdAt: Date }[];
  customerName?: string;
}

export interface ReplySuggestionVariant {
  type: "REPLY_SHORT" | "REPLY_FRIENDLY" | "REPLY_PROFESSIONAL";
  text: string;
}

export interface ExtractedCustomerData {
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  email?: string;
  street?: string;
  city?: string;
  desiredService?: string;
  desiredDate?: string;
  propertySizeEstimateSqm?: number;
  careType?: "ONE_TIME" | "RECURRING";
  specialRequests?: string;
  confidence?: Record<string, number>;
}

export interface ChatToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON schema
  requiresConfirmation: boolean;
}

export interface ChatToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AssistantChatResult {
  reply: string;
  toolCalls: ChatToolCall[];
  model: string;
}

// Service abstraction: keeps the model provider swappable and keeps every
// OpenAI network call strictly server-side (never exposed to the browser).
export interface AiService {
  readonly isDemo: boolean;
  readonly model: string;
  generateReplySuggestions(req: ReplySuggestionRequest): Promise<ReplySuggestionVariant[]>;
  refineText(text: string, instruction: string): Promise<string>;
  summarizeConversation(messages: { direction: string; text: string | null; createdAt: Date }[]): Promise<string>;
  extractCustomerData(conversationText: string): Promise<ExtractedCustomerData>;
  chat(
    history: { role: "user" | "assistant"; content: string }[],
    tools: ChatToolDefinition[]
  ): Promise<AssistantChatResult>;
  describeImage(imageUrl: string): Promise<string>;
  transcribeAudio(buffer: Buffer, mimeType: string): Promise<string>;
}
