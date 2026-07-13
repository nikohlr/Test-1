import { Router } from "express";
import { env } from "../config/env";
import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { verifyMetaSignature } from "../whatsapp/signature";
import { extractDedupeKey } from "../whatsapp/dedupeKey";
import { enqueueJob } from "../lib/queue";

export const webhookRouter = Router();

// Step 5 of the setup guide: Meta calls this with a GET request to verify
// the webhook URL when you save it in the App Dashboard.
webhookRouter.get("/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === env.whatsapp.webhookVerifyToken) {
    res.status(200).send(challenge);
  } else {
    logger.warn({ mode }, "WhatsApp webhook verification failed (token mismatch)");
    res.sendStatus(403);
  }
});

webhookRouter.post("/whatsapp", async (req, res) => {
  const signature = req.header("X-Hub-Signature-256");
  const rawBody: Buffer = (req as any).rawBody;

  // In demo mode (no app secret configured) we still accept payloads so the
  // mock/test flow keeps working, but real deployments must always verify.
  if (env.whatsapp.appSecret && !verifyMetaSignature(rawBody, signature)) {
    logger.warn("rejected WhatsApp webhook with invalid signature");
    return res.sendStatus(401);
  }

  // Always ack fast; Meta retries aggressively on non-2xx / timeouts.
  res.sendStatus(200);

  // Dedupe key: WhatsApp does not send one top-level event id, so we hash
  // the delivered message/status ids to detect Meta's at-least-once retries
  // of the *same* webhook delivery without depending on body byte-equality.
  const dedupeKey = extractDedupeKey(req.body);
  let event;
  try {
    event = await prisma.webhookEvent.create({
      data: {
        provider: "WHATSAPP",
        externalEventId: dedupeKey,
        eventType: req.body?.entry?.[0]?.changes?.[0]?.field ?? "unknown",
        payload: req.body,
        processingStatus: "RECEIVED",
      },
    });
  } catch (err: any) {
    // P2002 = unique constraint violation, i.e. this exact delivery was
    // already recorded (a concurrent request or a Meta retry) - not a real error.
    if (err?.code === "P2002") {
      logger.info({ dedupeKey }, "duplicate WhatsApp webhook delivery ignored");
      return;
    }
    logger.error({ err: err?.message }, "failed to persist WhatsApp webhook event");
    return;
  }

  try {
    await enqueueJob("whatsapp.processWebhookEvent", { webhookEventId: event.id });
  } catch (err: any) {
    logger.error({ err: err?.message }, "failed to enqueue WhatsApp webhook processing job");
  }
});
