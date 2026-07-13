import "dotenv/config";

function isPlaceholder(value: string | undefined): boolean {
  return !value || value.trim() === "";
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:4000",
  webBaseUrl: process.env.WEB_BASE_URL ?? "http://localhost:5173",
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-insecure-secret",

  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    webhookVerifyToken: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    appSecret: process.env.META_APP_SECRET,
    apiVersion: process.env.WHATSAPP_API_VERSION ?? "v21.0",
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini",
    organizationId: process.env.OPENAI_ORGANIZATION_ID,
    projectId: process.env.OPENAI_PROJECT_ID,
  },

  retention: {
    aiContentDays: Number(process.env.AI_CONTENT_RETENTION_DAYS ?? 180),
    webhookRawPayloadDays: Number(process.env.WEBHOOK_RAW_PAYLOAD_RETENTION_DAYS ?? 30),
  },
};

// Demo mode: true whenever the required real credentials are missing.
// The app must stay fully usable in this state, backed by mock providers.
export const isWhatsAppDemoMode = (): boolean =>
  isPlaceholder(env.whatsapp.accessToken) ||
  isPlaceholder(env.whatsapp.phoneNumberId) ||
  isPlaceholder(env.whatsapp.appSecret);

export const isOpenAiDemoMode = (): boolean => isPlaceholder(env.openai.apiKey);
