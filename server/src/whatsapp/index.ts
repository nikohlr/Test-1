import { isWhatsAppDemoMode } from "../config/env";
import { CloudApiWhatsAppProvider } from "./cloudApiProvider";
import { MockWhatsAppProvider } from "./mockProvider";
import type { WhatsAppProvider } from "./types";

let instance: WhatsAppProvider | null = null;

// Single access point for the rest of the app. Chooses the mock provider
// automatically whenever real Meta credentials are not configured, so the
// app is always fully startable/usable ("Demo-Modus").
export function getWhatsAppProvider(): WhatsAppProvider {
  if (!instance) {
    instance = isWhatsAppDemoMode() ? new MockWhatsAppProvider() : new CloudApiWhatsAppProvider();
  }
  return instance;
}

export * from "./types";
