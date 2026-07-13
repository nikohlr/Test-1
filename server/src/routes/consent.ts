import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";

export const consentRouter = Router();

consentRouter.get(
  "/:customerId",
  asyncHandler(async (req, res) => {
    const consent = await prisma.communicationConsent.findUnique({ where: { customerId: req.params.customerId } });
    res.json(consent);
  })
);

const consentSchema = z.object({
  whatsappAllowed: z.boolean().optional(),
  emailAllowed: z.boolean().optional(),
  phoneAllowed: z.boolean().optional(),
  aiProcessingAllowed: z.boolean().optional(),
  imageProcessingAllowed: z.boolean().optional(),
  source: z.string().optional(),
});

consentRouter.put(
  "/:customerId",
  asyncHandler(async (req, res) => {
    const data = consentSchema.parse(req.body);
    const revokedNow = data.aiProcessingAllowed === false || data.imageProcessingAllowed === false;
    const consent = await prisma.communicationConsent.upsert({
      where: { customerId: req.params.customerId },
      update: { ...data, revokedAt: revokedNow ? new Date() : undefined },
      create: { customerId: req.params.customerId, ...data },
    });
    res.json(consent);
  })
);
