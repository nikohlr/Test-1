import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/asyncHandler";

export const customersRouter = Router();

customersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? "");
    const customers = await prisma.customer.findMany({
      where: q
        ? {
            OR: [
              { firstName: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { phoneNumber: { contains: q } },
            ],
          }
        : undefined,
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    res.json(customers);
  })
);

customersRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        properties: true,
        inquiries: true,
        quotes: { include: { items: true } },
        invoices: true,
        tasks: true,
        appointments: true,
        consent: true,
        conversations: true,
      },
    });
    if (!customer) return res.status(404).json({ error: "Kunde nicht gefunden" });
    res.json(customer);
  })
);

const updateSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  street: z.string().optional(),
  postalCode: z.string().optional(),
  city: z.string().optional(),
  status: z.enum(["LEAD", "ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
});

customersRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const data = updateSchema.parse(req.body);
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data });
    res.json(customer);
  })
);

// Customer leads are created automatically from WhatsApp, but staff can also
// create one by hand (e.g. after a phone call).
customersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const data = updateSchema.extend({ phoneNumber: z.string().optional(), source: z.string().optional() }).parse(req.body);
    const customer = await prisma.customer.create({ data: { ...data, source: data.source ?? "manual" } });
    res.status(201).json(customer);
  })
);

// --- Customer drafts (AI-recognized data pending human review) -----------

customersRouter.get(
  "/:id/drafts",
  asyncHandler(async (req, res) => {
    const drafts = await prisma.customerDraft.findMany({ where: { customerId: req.params.id }, orderBy: { createdAt: "desc" } });
    res.json(drafts);
  })
);

customersRouter.post(
  "/drafts/:draftId/confirm",
  asyncHandler(async (req, res) => {
    const draft = await prisma.customerDraft.findUniqueOrThrow({ where: { id: req.params.draftId } });
    const data = req.body.extractedData ?? draft.extractedData; // allow user corrections before confirming
    const fields: any = data;

    const customer = draft.customerId
      ? await prisma.customer.update({
          where: { id: draft.customerId },
          data: {
            firstName: fields.firstName || undefined,
            lastName: fields.lastName || undefined,
            email: fields.email || undefined,
            street: fields.street || undefined,
            city: fields.city || undefined,
            status: "ACTIVE",
          },
        })
      : await prisma.customer.create({
          data: {
            firstName: fields.firstName,
            lastName: fields.lastName,
            phoneNumber: fields.phoneNumber,
            email: fields.email,
            street: fields.street,
            city: fields.city,
            status: "LEAD",
            source: "whatsapp",
          },
        });

    await prisma.customerDraft.update({
      where: { id: draft.id },
      data: { status: "CONFIRMED", customerId: customer.id, reviewedAt: new Date(), reviewedByUserId: req.user?.id },
    });

    res.json({ customer });
  })
);

customersRouter.post(
  "/drafts/:draftId/reject",
  asyncHandler(async (req, res) => {
    const draft = await prisma.customerDraft.update({
      where: { id: req.params.draftId },
      data: { status: "REJECTED", reviewedAt: new Date(), reviewedByUserId: req.user?.id },
    });
    res.json(draft);
  })
);
