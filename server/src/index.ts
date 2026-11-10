import express from "express";
import cors from "cors";
import path from "path";
import pinoHttp from "pino-http";
import { env, isOpenAiDemoMode, isWhatsAppDemoMode } from "./config/env";
import { logger } from "./lib/logger";
import { attachUser } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";
import { webhookRouter } from "./routes/webhooks";
import { healthRouter } from "./routes/health";
import { customersRouter } from "./routes/customers";
import { conversationsRouter } from "./routes/conversations";
import { templatesRouter } from "./routes/templates";
import { consentRouter } from "./routes/consent";
import { assistantRouter } from "./routes/assistant";
import { mediaRouter } from "./routes/media";
import { settingsRouter } from "./routes/settings";
import { agentsRouter } from "./routes/agents";
import { getAgentStore } from "./agents";
import { registerAllJobHandlers } from "./jobs/handlers";
import { startQueueWorker } from "./lib/queue";

const app = express();

app.use(cors({ origin: env.webBaseUrl, credentials: true }));
app.use(pinoHttp({ logger }));

// Capture the raw body for WhatsApp webhook signature verification while
// still parsing JSON for every other route.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  })
);

app.use(attachUser);

app.use("/media", express.static(path.join(process.cwd(), "storage", "media")));

app.use("/webhooks", webhookRouter);
app.use("/api", healthRouter);
app.use("/api/customers", customersRouter);
app.use("/api/conversations", conversationsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/consent", consentRouter);
app.use("/api/assistant", assistantRouter);
app.use("/api/media", mediaRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/agents", agentsRouter);

app.use(errorHandler);

registerAllJobHandlers();
getAgentStore();
startQueueWorker();

app.listen(env.port, () => {
  logger.info(
    {
      port: env.port,
      whatsappDemoMode: isWhatsAppDemoMode(),
      openaiDemoMode: isOpenAiDemoMode(),
    },
    `Broszeit Communication Hub server listening on :${env.port}`
  );
  if (isWhatsAppDemoMode()) logger.warn("WhatsApp läuft im DEMO-MODUS (keine echten Zugangsdaten hinterlegt)");
  if (isOpenAiDemoMode()) logger.warn("OpenAI läuft im DEMO-MODUS (kein API-Schlüssel hinterlegt)");
});
