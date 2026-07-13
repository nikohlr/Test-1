import { Router } from "express";
import { prisma } from "../lib/prisma";
import { isOpenAiDemoMode, isWhatsAppDemoMode } from "../config/env";
import { asyncHandler } from "../lib/asyncHandler";

export const healthRouter = Router();

healthRouter.get(
  "/health",
  asyncHandler(async (_req, res) => {
    let dbOk = true;
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbOk = false;
    }

    res.json({
      status: dbOk ? "ok" : "degraded",
      database: dbOk ? "up" : "down",
      integrations: {
        whatsapp: { demoMode: isWhatsAppDemoMode(), configured: !isWhatsAppDemoMode() },
        openai: { demoMode: isOpenAiDemoMode(), configured: !isOpenAiDemoMode() },
      },
      timestamp: new Date().toISOString(),
    });
  })
);
