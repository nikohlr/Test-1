import { prisma } from "../lib/prisma";
import { Channel } from "@prisma/client";

// Finds the customer for an inbound phone number, or creates a new
// "Interessent" (lead) automatically - per spec, unknown numbers always
// get a lead record so nothing inbound is ever lost.
export async function findOrCreateCustomerByPhone(phoneNumber: string) {
  const existing = await prisma.customer.findUnique({ where: { phoneNumber } });
  if (existing) return { customer: existing, isNew: false };

  const customer = await prisma.customer.create({
    data: {
      phoneNumber,
      status: "LEAD",
      source: "whatsapp",
    },
  });
  await prisma.communicationConsent.create({
    data: {
      customerId: customer.id,
      whatsappAllowed: true,
      source: "whatsapp_inbound_contact",
    },
  });
  return { customer, isNew: true };
}

export async function findOrCreateWhatsAppConversation(customerId: string, phoneNumber: string) {
  const existing = await prisma.conversation.findFirst({
    where: { customerId, channel: Channel.WHATSAPP },
  });
  if (existing) return { conversation: existing, isNew: false };

  const conversation = await prisma.conversation.create({
    data: {
      customerId,
      channel: Channel.WHATSAPP,
      phoneNumber,
      status: "OPEN",
    },
  });
  return { conversation, isNew: true };
}
