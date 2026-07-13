import OpenAI, { toFile } from "openai";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import type {
  AiService,
  AssistantChatResult,
  ChatToolDefinition,
  ExtractedCustomerData,
  ReplySuggestionRequest,
  ReplySuggestionVariant,
} from "./types";

const SYSTEM_GUARDRAILS = `Du bist der interne Kommunikationsassistent von "Broszeit Gartenservice".
Du analysierst Kundennachrichten und formulierst Antwortvorschläge, Zusammenfassungen und Entwürfe.
Du darfst NIEMALS eigenständig verbindliche Preise, Rabatte, Termine oder rechtliche Zusagen festlegen,
außer sie sind bereits im System hinterlegt oder wurden vom Benutzer bestätigt.
Alle Schätzungen (z.B. Flächengröße aus Bildern) müssen ausdrücklich als unverbindlich gekennzeichnet werden.
Antworte auf Deutsch, freundlich und professionell.`;

// Real implementation against the OpenAI Responses API. Only ever
// instantiated server-side (see openai/index.ts) - the API key never
// reaches the browser.
export class OpenAiService implements AiService {
  readonly isDemo = false;
  readonly model: string;
  private client: OpenAI;

  constructor() {
    this.model = env.openai.model;
    this.client = new OpenAI({
      apiKey: env.openai.apiKey,
      organization: env.openai.organizationId,
      project: env.openai.projectId,
    });
  }

  async generateReplySuggestions(req: ReplySuggestionRequest): Promise<ReplySuggestionVariant[]> {
    const transcript = req.recentMessages
      .map((m) => `${m.direction === "INBOUND" ? "Kunde" : "Betrieb"}: ${m.text}`)
      .join("\n");

    const response = await this.client.responses.create({
      model: this.model,
      instructions: SYSTEM_GUARDRAILS,
      input: `Kundenname: ${req.customerName ?? "unbekannt"}\n\nVerlauf:\n${transcript}\n\nErstelle drei Antwortvorschläge auf die letzte Kundennachricht als JSON-Array mit Objekten {type, text}. type ist einer von REPLY_SHORT, REPLY_FRIENDLY, REPLY_PROFESSIONAL.`,
      text: { format: { type: "json_object" } },
    });

    try {
      const parsed = JSON.parse(response.output_text);
      const variants = Array.isArray(parsed) ? parsed : parsed.variants ?? parsed.suggestions ?? [];
      return variants;
    } catch (err) {
      logger.error({ err }, "failed to parse AI reply suggestions, falling back to raw text");
      return [{ type: "REPLY_FRIENDLY", text: response.output_text }];
    }
  }

  async refineText(text: string, instruction: string): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: SYSTEM_GUARDRAILS,
      input: `Überarbeite folgenden Text gemäß dieser Anweisung: "${instruction}".\n\nText:\n${text}`,
    });
    return response.output_text;
  }

  async summarizeConversation(messages: { direction: string; text: string | null }[]): Promise<string> {
    const transcript = messages.map((m) => `${m.direction === "INBOUND" ? "Kunde" : "Betrieb"}: ${m.text ?? ""}`).join("\n");
    const response = await this.client.responses.create({
      model: this.model,
      instructions: SYSTEM_GUARDRAILS,
      input: `Fasse den folgenden WhatsApp-Verlauf kurz und sachlich zusammen:\n\n${transcript}`,
    });
    return response.output_text;
  }

  async extractCustomerData(conversationText: string): Promise<ExtractedCustomerData> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: `${SYSTEM_GUARDRAILS}\nExtrahiere ausschließlich Informationen, die tatsächlich im Text stehen. Erfinde nichts. Gib niedrige confidence-Werte für unsichere Angaben.`,
      input: `Extrahiere Kundendaten aus diesem Gesprächsverlauf als JSON-Objekt mit den Feldern firstName, lastName, phoneNumber, email, street, city, desiredService, desiredDate, propertySizeEstimateSqm, careType (ONE_TIME|RECURRING), specialRequests und confidence (Objekt mit 0-1 Werten je Feld):\n\n${conversationText}`,
      text: { format: { type: "json_object" } },
    });
    try {
      return JSON.parse(response.output_text);
    } catch (err) {
      logger.error({ err }, "failed to parse AI customer data extraction");
      return {};
    }
  }

  async chat(
    history: { role: "user" | "assistant"; content: string }[],
    tools: ChatToolDefinition[]
  ): Promise<AssistantChatResult> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: `${SYSTEM_GUARDRAILS}\nDu bist der "Broszeit-Assistent". Du darfst Geschäftsdaten nur LESEN oder ENTWÜRFE erstellen.
Jedes Werkzeug mit schreibender oder versendender Wirkung wird erst nach ausdrücklicher Benutzerbestätigung ausgeführt - rufe es trotzdem auf, die Bestätigung erfolgt außerhalb deiner Kontrolle.`,
      input: history.map((m) => ({ role: m.role, content: m.content })),
      tools: tools.map((t) => ({
        type: "function" as const,
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        strict: false,
      })),
    });

    const toolCalls = (response.output ?? [])
      .filter((item: any) => item.type === "function_call")
      .map((item: any) => ({ name: item.name, arguments: JSON.parse(item.arguments || "{}") }));

    return { reply: response.output_text ?? "", toolCalls, model: this.model };
  }

  async describeImage(imageUrl: string): Promise<string> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: `${SYSTEM_GUARDRAILS}\nBeschreibe nur, was sichtbar ist. Leite KEINE verbindliche Flächengröße, KEINEN verbindlichen Arbeitsaufwand und KEINEN verbindlichen Preis ab. Kennzeichne jede Schätzung ausdrücklich als unverbindlich.`,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: "Beschreibe dieses Grundstücksbild kurz und schlage mögliche Gartenpflege-Leistungen vor." },
            { type: "input_image", image_url: imageUrl },
          ],
        },
      ] as any,
    });
    return response.output_text;
  }

  async transcribeAudio(buffer: Buffer, mimeType: string): Promise<string> {
    const ext = mimeType.split("/")[1]?.split(";")[0] ?? "ogg";
    const file = await toFile(buffer, `voice-message.${ext}`);
    const transcription = await this.client.audio.transcriptions.create({
      file,
      model: "whisper-1",
    });
    return transcription.text;
  }
}
