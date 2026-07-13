import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { isOpenAiDemoMode, isWhatsAppDemoMode } from "../config/env";

export const settingsRouter = Router();

export const DEFAULT_INQUIRY_TEXT = `Hallo und vielen Dank für Ihre Nachricht an Broszeit Gartenservice. Damit wir den Aufwand möglichst gut einschätzen können, schicken Sie uns bitte kurz:

- die Adresse des Grundstücks,
- eine Beschreibung der gewünschten Arbeiten,
- einige aktuelle Bilder,
- ungefähr die Größe der Fläche,
- und Ihren gewünschten Zeitraum.

Wir melden uns anschließend schnellstmöglich bei Ihnen.`;

const KEYS = {
  inquiryDialogText: "inquiryDialogText",
  automationLevel: "automationLevel",
} as const;

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.appSetting.findMany();
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({
      inquiryDialogText: map[KEYS.inquiryDialogText] ?? DEFAULT_INQUIRY_TEXT,
      // Automation stays OFF (Stufe 1 only) until a human explicitly turns it on.
      automationLevel: map[KEYS.automationLevel] ?? "SUGGESTIONS_ONLY",
      demoMode: { whatsapp: isWhatsAppDemoMode(), openai: isOpenAiDemoMode() },
    });
  })
);

settingsRouter.put(
  "/inquiry-dialog-text",
  asyncHandler(async (req, res) => {
    const value = z.string().min(1).parse(req.body.value);
    await prisma.appSetting.upsert({
      where: { key: KEYS.inquiryDialogText },
      update: { value },
      create: { key: KEYS.inquiryDialogText, value },
    });
    res.json({ value });
  })
);

settingsRouter.put(
  "/automation-level",
  asyncHandler(async (req, res) => {
    const value = z.enum(["SUGGESTIONS_ONLY", "STANDARD_AUTO_REPLIES", "ADVANCED"]).parse(req.body.value);
    await prisma.appSetting.upsert({
      where: { key: KEYS.automationLevel },
      update: { value },
      create: { key: KEYS.automationLevel, value },
    });
    res.json({ value });
  })
);

settingsRouter.get(
  "/users",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" } }));
  })
);
