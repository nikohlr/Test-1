import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@broszeit-gartenservice.de" },
    update: {},
    create: { name: "Anna Broszeit", email: "admin@broszeit-gartenservice.de", role: "ADMIN" },
  });
  const office = await prisma.user.upsert({
    where: { email: "buero@broszeit-gartenservice.de" },
    update: {},
    create: { name: "Tom Büro", email: "buero@broszeit-gartenservice.de", role: "OFFICE" },
  });

  const mueller = await prisma.customer.upsert({
    where: { phoneNumber: "+491701234567" },
    update: {},
    create: {
      firstName: "Peter",
      lastName: "Müller",
      phoneNumber: "+491701234567",
      email: "peter.mueller@example.com",
      street: "Gartenweg 12",
      postalCode: "12345",
      city: "Musterstadt",
      status: "ACTIVE",
      source: "whatsapp",
    },
  });

  await prisma.communicationConsent.upsert({
    where: { customerId: mueller.id },
    update: {},
    create: { customerId: mueller.id, source: "whatsapp_inbound_contact" },
  });

  const conversation = await prisma.conversation.upsert({
    where: { channel_externalConversationId: { channel: "WHATSAPP", externalConversationId: "demo-mueller" } },
    update: {},
    create: {
      customerId: mueller.id,
      channel: "WHATSAPP",
      externalConversationId: "demo-mueller",
      phoneNumber: mueller.phoneNumber!,
      status: "OPEN",
      assignedUserId: office.id,
      unreadCount: 1,
      lastMessageAt: new Date(),
    },
  });

  const existingMessages = await prisma.message.count({ where: { conversationId: conversation.id } });
  if (existingMessages === 0) {
    await prisma.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          direction: "INBOUND",
          sender: mueller.phoneNumber!,
          messageType: "TEXT",
          text: "Hallo, ich hätte gerne ein Angebot für die Heckenschnitt meines Grundstücks.",
          deliveryStatus: "DELIVERED",
          externalMessageId: "seed-msg-1",
        },
        {
          conversationId: conversation.id,
          direction: "OUTBOUND",
          recipient: mueller.phoneNumber!,
          messageType: "TEXT",
          text: "Hallo Herr Müller, vielen Dank für Ihre Anfrage! Können Sie uns die ungefähre Größe der Hecke und ein paar Bilder schicken?",
          deliveryStatus: "READ",
          externalMessageId: "seed-msg-2",
        },
      ],
    });
  }

  const templates: { internalName: string; content: string; category: string }[] = [
    { internalName: "Begrüßung", content: "Hallo und herzlich willkommen bei Broszeit Gartenservice!", category: "UTILITY" },
    {
      internalName: "Eingangsbestätigung",
      content: "Vielen Dank für Ihre Nachricht. Wir haben Ihre Anfrage erhalten und melden uns schnellstmöglich.",
      category: "UTILITY",
    },
    { internalName: "Bitte um Bilder", content: "Könnten Sie uns bitte ein paar aktuelle Bilder der Fläche schicken?", category: "UTILITY" },
    { internalName: "Bitte um Adresse", content: "Wie lautet die genaue Adresse des Grundstücks?", category: "UTILITY" },
    { internalName: "Terminvereinbarung", content: "Wann würde Ihnen ein Termin zur Besichtigung passen?", category: "UTILITY" },
    { internalName: "Terminbestätigung", content: "Ihr Termin am {{appointment_date}} wurde bestätigt.", category: "UTILITY" },
    { internalName: "Terminerinnerung", content: "Kurze Erinnerung an Ihren Termin am {{appointment_date}}.", category: "UTILITY" },
    { internalName: "Angebot ist fertig", content: "Ihr Angebot ist fertig und liegt dieser Nachricht als PDF bei.", category: "UTILITY" },
    { internalName: "Nachfrage zum Angebot", content: "Hatten Sie schon Gelegenheit, sich unser Angebot anzusehen?", category: "UTILITY" },
    { internalName: "Auftragsbestätigung", content: "Wir bestätigen hiermit Ihren Auftrag.", category: "UTILITY" },
    { internalName: "Terminverschiebung", content: "Ihr Termin wurde auf {{appointment_date}} verschoben.", category: "UTILITY" },
    { internalName: "Rechnung ist fertig", content: "Ihre Rechnung liegt dieser Nachricht als PDF bei.", category: "UTILITY" },
    { internalName: "Zahlungserinnerung", content: "Wir möchten Sie freundlich an die offene Rechnung {{invoice_number}} erinnern.", category: "UTILITY" },
    { internalName: "Auftrag abgeschlossen", content: "Der Auftrag wurde abgeschlossen. Vielen Dank für Ihr Vertrauen!", category: "UTILITY" },
    { internalName: "Bitte um Bewertung", content: "Wir würden uns sehr über eine kurze Bewertung freuen!", category: "MARKETING" },
    { internalName: "Saisonale Gartenpflege", content: "Die neue Saison beginnt - soll Ihre Gartenpflege eingeplant werden?", category: "MARKETING" },
    { internalName: "Erinnerung regelmäßige Pflege", content: "Zeit für den nächsten Pflegetermin?", category: "MARKETING" },
  ];

  for (const t of templates) {
    await prisma.messageTemplate.upsert({
      where: { channel_internalName: { channel: "WHATSAPP", internalName: t.internalName } },
      update: {},
      create: { channel: "WHATSAPP", internalName: t.internalName, content: t.content, category: t.category, language: "de" },
    });
  }

  console.log("Seed complete:", { admin: admin.email, office: office.email, customer: mueller.phoneNumber });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
