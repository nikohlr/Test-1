import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "*.accessToken",
      "*.access_token",
      "*.appSecret",
      "*.apiKey",
      "*.api_key",
      "*.password",
      "*.iban",
      "*.bankAccount",
    ],
    censor: "[redacted]",
  },
});
