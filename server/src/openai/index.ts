import { isOpenAiDemoMode } from "../config/env";
import { MockAiService } from "./mockService";
import { OpenAiService } from "./openaiService";
import type { AiService } from "./types";

let instance: AiService | null = null;

export function getAiService(): AiService {
  if (!instance) {
    instance = isOpenAiDemoMode() ? new MockAiService() : new OpenAiService();
  }
  return instance;
}

export * from "./types";
