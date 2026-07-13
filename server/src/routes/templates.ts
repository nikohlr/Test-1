import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";
import { isWhatsAppDemoMode } from "../config/env";

export const templatesRouter = Router();

templatesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.messageTemplate.findMany({ orderBy: { internalName: "asc" } }));
  })
);

const templateSchema = z.object({
  channel: z.enum(["WHATSAPP", "EMAIL", "PHONE_NOTE", "SMS", "INTERNAL", "CUSTOMER_PORTAL"]).default("WHATSAPP"),
  internalName: z.string().min(1),
  externalTemplateName: z.string().optional(),
  language: z.string().default("de"),
  category: z.string().optional(),
  content: z.string().min(1),
  variables: z.array(z.string()).optional(),
});

templatesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = templateSchema.parse(req.body);
    const template = await prisma.messageTemplate.create({ data: { ...data, approvalStatus: "DRAFT" } });
    res.status(201).json(template);
  })
);

templatesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = templateSchema.partial().extend({ active: z.boolean().optional() }).parse(req.body);
    const template = await prisma.messageTemplate.update({ where: { id: req.params.id }, data });
    res.json(template);
  })
);

// Meta requires WhatsApp templates to be submitted for approval and only
// APPROVED templates may be used outside the 24h customer-service window.
// This stub marks the sync attempt; wire it to the real Business Management
// API (`POST /{waba-id}/message_templates`) once real credentials exist.
templatesRouter.post(
  "/:id/sync",
  asyncHandler(async (req, res) => {
    const template = await prisma.messageTemplate.findUniqueOrThrow({ where: { id: req.params.id } });
    if (isWhatsAppDemoMode()) {
      const updated = await prisma.messageTemplate.update({
        where: { id: template.id },
        data: { approvalStatus: "PENDING", lastSyncedAt: new Date() },
      });
      return res.json({ ...updated, note: "Demo-Modus: kein echter Meta-Sync durchgeführt." });
    }
    // Real sync against the Business Management API would go here.
    res.status(501).json({ error: "Meta-Vorlagen-Sync ist noch nicht implementiert." });
  })
);
