import type {
  AiService,
  AssistantChatResult,
  ChatToolDefinition,
  ExtractedCustomerData,
  ReplySuggestionRequest,
  ReplySuggestionVariant,
} from "./types";

// Deterministic, offline stand-in for the OpenAI Responses API. Used
// automatically in demo mode (no OPENAI_API_KEY) and in tests so the whole
// app - including the AI-assistant UI - stays fully usable without any key.
export class MockAiService implements AiService {
  readonly isDemo = true;
  readonly model = "demo-mock-model";

  async generateReplySuggestions(req: ReplySuggestionRequest): Promise<ReplySuggestionVariant[]> {
    const name = req.customerName ?? "";
    const greeting = name ? `Hallo ${name}, ` : "Hallo, ";
    return [
      { type: "REPLY_SHORT", text: `${greeting}danke für Ihre Nachricht. Wir melden uns kurzfristig bei Ihnen.` },
      {
        type: "REPLY_FRIENDLY",
        text: `${greeting}vielen Dank für Ihre Nachricht! Wir kümmern uns gerne darum und melden uns schnellstmöglich mit den nächsten Schritten bei Ihnen. [Demo-Vorschlag]`,
      },
      {
        type: "REPLY_PROFESSIONAL",
        text: `${greeting}vielen Dank für Ihre Anfrage an Broszeit Gartenservice. Wir prüfen die vorliegenden Angaben und melden uns in Kürze mit einer Einschätzung sowie den weiteren Schritten bei Ihnen. [Demo-Vorschlag]`,
      },
    ];
  }

  async refineText(text: string, instruction: string): Promise<string> {
    return `${text}\n\n[Demo-Überarbeitung gemäß "${instruction}" - im Demo-Modus unverändert]`;
  }

  async summarizeConversation(messages: { direction: string; text: string | null }[]): Promise<string> {
    const count = messages.length;
    return `[Demo-Zusammenfassung] Unterhaltung mit ${count} Nachrichten. Letzte Nachricht: "${
      messages.at(-1)?.text ?? ""
    }".`;
  }

  async extractCustomerData(conversationText: string): Promise<ExtractedCustomerData> {
    // Very small heuristic extraction so the demo mode still produces
    // something plausible to review, without calling any external API.
    const phoneMatch = conversationText.match(/\+?\d[\d\s/-]{6,}\d/);
    const emailMatch = conversationText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return {
      phoneNumber: phoneMatch?.[0]?.trim(),
      email: emailMatch?.[0],
      confidence: { phoneNumber: phoneMatch ? 0.6 : 0, email: emailMatch ? 0.6 : 0 },
    };
  }

  async chat(
    history: { role: "user" | "assistant"; content: string }[],
    _tools: ChatToolDefinition[]
  ): Promise<AssistantChatResult> {
    const lastUser = history.filter((m) => m.role === "user").at(-1)?.content ?? "";
    return {
      reply: `[Demo-Antwort] Ich habe im Demo-Modus keine echte KI-Anbindung, würde aber zu "${lastUser}" recherchieren und einen Entwurf vorschlagen.`,
      toolCalls: [],
      model: this.model,
    };
  }

  async describeImage(): Promise<string> {
    return "[Demo] Unverbindliche Bildbeschreibung nicht verfügbar (Demo-Modus).";
  }

  async transcribeAudio(): Promise<string> {
    return "[Demo-Transkript] Automatische Transkription ist im Demo-Modus nicht verfügbar.";
  }
}
