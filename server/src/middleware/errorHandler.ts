import type { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";
import { AiProcessingNotAllowedError } from "../services/aiAssistantService";

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AiProcessingNotAllowedError) {
    return res.status(403).json({ error: err.message });
  }
  logger.error({ err: err?.message, stack: err?.stack, path: req.path }, "unhandled request error");
  res.status(500).json({ error: "Interner Serverfehler" });
}
