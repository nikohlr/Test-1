import { prisma } from "../lib/prisma";
import type { ChatToolDefinition } from "./types";

// Registry of server-side tools the Broszeit-Assistent may call (function
// calling). Tools flagged `requiresConfirmation` never execute their real
// effect immediately - the API layer turns them into a "pendingAction" that
// is shown to the user and only runs after an explicit confirm click.
export interface ToolSpec extends ChatToolDefinition {
  execute: (args: any) => Promise<unknown>;
}

export const tools: ToolSpec[] = [
  {
    name: "searchCustomers",
    description: "Sucht Kunden/Interessenten nach Name, Telefonnummer, Status oder Ort.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Freitextsuche (Name, Telefon, Ort)" },
        status: { type: "string", enum: ["LEAD", "ACTIVE", "INACTIVE", "ARCHIVED"] },
      },
    },
    requiresConfirmation: false,
    async execute({ query, status }) {
      return prisma.customer.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(query
            ? {
                OR: [
                  { firstName: { contains: query, mode: "insensitive" } },
                  { lastName: { contains: query, mode: "insensitive" } },
                  { phoneNumber: { contains: query } },
                  { city: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        take: 20,
      });
    },
  },
  {
    name: "getCustomer",
    description: "Lädt Details zu einem Kunden inklusive Aufträgen, Rechnungen und Aufgaben.",
    parameters: { type: "object", properties: { customerId: { type: "string" } }, required: ["customerId"] },
    requiresConfirmation: false,
    async execute({ customerId }) {
      return prisma.customer.findUnique({
        where: { id: customerId },
        include: { properties: true, inquiries: true, quotes: true, invoices: true, tasks: true },
      });
    },
  },
  {
    name: "getOpenInvoices",
    description: "Listet offene (nicht bezahlte) Rechnungen.",
    parameters: { type: "object", properties: {} },
    requiresConfirmation: false,
    async execute() {
      return prisma.invoice.findMany({ where: { status: { in: ["SENT", "OVERDUE"] } }, include: { customer: true } });
    },
  },
  {
    name: "getUpcomingJobs",
    description: "Listet anstehende Termine/Aufträge in einem Zeitraum.",
    parameters: {
      type: "object",
      properties: { fromDate: { type: "string" }, toDate: { type: "string" } },
    },
    requiresConfirmation: false,
    async execute({ fromDate, toDate }) {
      return prisma.appointment.findMany({
        where: {
          startsAt: { gte: fromDate ? new Date(fromDate) : new Date(), lte: toDate ? new Date(toDate) : undefined },
          status: { in: ["PROPOSED", "CONFIRMED"] },
        },
        include: { customer: true },
        orderBy: { startsAt: "asc" },
      });
    },
  },
  {
    name: "summarizeConversation",
    description: "Fasst den WhatsApp-/Nachrichtenverlauf mit einem Kunden zusammen.",
    parameters: { type: "object", properties: { conversationId: { type: "string" } }, required: ["conversationId"] },
    requiresConfirmation: false,
    async execute({ conversationId }) {
      const { getAiService } = await import("./index");
      const messages = await prisma.message.findMany({
        where: { conversationId, isInternalNote: false },
        orderBy: { createdAt: "asc" },
      });
      return { summary: await getAiService().summarizeConversation(messages) };
    },
  },
  {
    name: "createCustomerDraft",
    description: "Legt einen Entwurf für neue oder geänderte Kundendaten an (muss vom Benutzer noch bestätigt werden).",
    parameters: {
      type: "object",
      properties: { customerId: { type: "string" }, conversationId: { type: "string" }, extractedData: { type: "object" } },
      required: ["extractedData"],
    },
    requiresConfirmation: false, // creates a PENDING draft only, never changes real customer data
    async execute({ customerId, conversationId, extractedData }) {
      return prisma.customerDraft.create({ data: { customerId, conversationId, extractedData, status: "PENDING" } });
    },
  },
  {
    name: "updateCustomerDraft",
    description: "Aktualisiert einen bestehenden Kundendaten-Entwurf.",
    parameters: { type: "object", properties: { draftId: { type: "string" }, extractedData: { type: "object" } }, required: ["draftId"] },
    requiresConfirmation: false,
    async execute({ draftId, extractedData }) {
      return prisma.customerDraft.update({ where: { id: draftId }, data: { extractedData } });
    },
  },
  {
    name: "createInquiryDraft",
    description: "Erstellt eine neue Kundenanfrage (Inquiry) im Status NEW aus einem Gespräch.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        desiredService: { type: "string" },
        desiredDate: { type: "string" },
        careType: { type: "string", enum: ["ONE_TIME", "RECURRING"] },
        originConversationId: { type: "string" },
      },
      required: ["customerId"],
    },
    requiresConfirmation: false,
    async execute({ customerId, desiredService, desiredDate, careType, originConversationId }) {
      return prisma.inquiry.create({
        data: {
          customerId,
          desiredService,
          desiredDate: desiredDate ? new Date(desiredDate) : undefined,
          careType,
          originConversationId,
        },
      });
    },
  },
  {
    name: "createTaskDraft",
    description: "Erstellt eine Aufgabe, z.B. einen Rückruf.",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        title: { type: "string" },
        type: { type: "string", enum: ["CALLBACK", "SITE_VISIT", "FOLLOW_UP", "GENERIC"] },
        dueAt: { type: "string" },
      },
      required: ["title"],
    },
    requiresConfirmation: false,
    async execute({ customerId, title, type, dueAt }) {
      return prisma.task.create({ data: { customerId, title, type, dueAt: dueAt ? new Date(dueAt) : undefined } });
    },
  },
  {
    name: "createAppointmentDraft",
    description: "Schlägt einen Termin vor (Status PROPOSED, muss bestätigt werden).",
    parameters: {
      type: "object",
      properties: { customerId: { type: "string" }, title: { type: "string" }, startsAt: { type: "string" } },
      required: ["customerId", "title", "startsAt"],
    },
    requiresConfirmation: false, // status stays PROPOSED until a human confirms it
    async execute({ customerId, title, startsAt }) {
      return prisma.appointment.create({ data: { customerId, title, startsAt: new Date(startsAt), status: "PROPOSED" } });
    },
  },
  {
    name: "createQuoteDraft",
    description: "Erstellt einen Angebotsentwurf mit Positionen (Status DRAFT, keine Preise werden verbindlich festgelegt).",
    parameters: {
      type: "object",
      properties: {
        customerId: { type: "string" },
        inquiryId: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unitPrice: { type: "number" },
            },
          },
        },
      },
      required: ["customerId"],
    },
    requiresConfirmation: false,
    async execute({ customerId, inquiryId, items = [] }) {
      const quoteNumber = `Q-${Date.now()}`;
      return prisma.quote.create({
        data: {
          customerId,
          inquiryId,
          quoteNumber,
          status: "DRAFT",
          items: { create: items.map((it: any, i: number) => ({ ...it, position: i })) },
        },
        include: { items: true },
      });
    },
  },
  {
    name: "draftWhatsAppMessage",
    description: "Formuliert einen WhatsApp-Nachrichtenentwurf, ohne ihn zu versenden.",
    parameters: { type: "object", properties: { conversationId: { type: "string" }, instruction: { type: "string" } }, required: ["conversationId", "instruction"] },
    requiresConfirmation: false,
    async execute({ conversationId, instruction }) {
      const { getAiService } = await import("./index");
      return { draft: await getAiService().refineText("", instruction), conversationId };
    },
  },
  {
    name: "draftEmail",
    description: "Formuliert einen E-Mail-Entwurf.",
    parameters: { type: "object", properties: { customerId: { type: "string" }, instruction: { type: "string" } }, required: ["instruction"] },
    requiresConfirmation: false,
    async execute({ instruction }) {
      const { getAiService } = await import("./index");
      return { draft: await getAiService().refineText("", instruction) };
    },
  },
  {
    name: "sendWhatsAppMessage",
    description: "Versendet eine WhatsApp-Nachricht an den Kunden. WIRKT SICH SOFORT AUS - erfordert Bestätigung.",
    parameters: {
      type: "object",
      properties: { conversationId: { type: "string" }, text: { type: "string" } },
      required: ["conversationId", "text"],
    },
    requiresConfirmation: true,
    async execute({ conversationId, text }) {
      const { sendOutboundMessage } = await import("../services/messageService");
      return sendOutboundMessage(conversationId, text, { isAiGenerated: true });
    },
  },
];

export const toolByName = new Map(tools.map((t) => [t.name, t]));
