# Broszeit Kommunikationszentrale

Zentrale Kunden- und Auftragskommunikation für Broszeit Gartenservice:
WhatsApp Business Platform (Meta Cloud API) als bevorzugter Kanal, mit einem
OpenAI-gestützten Kommunikationsassistenten. Läuft vollständig im
**Demo-Modus** ohne echte Zugangsdaten und wird per Umgebungsvariable in den
Live-Betrieb überführt.

## Architektur

```
server/   Node.js + TypeScript + Express + Prisma + PostgreSQL (REST-API, Webhooks, Job-Queue)
web/      React + TypeScript + Vite (Nachrichtenansicht, Broszeit-Assistent, Vorlagen, Einstellungen)
docs/     Einrichtungsanleitungen (WhatsApp Business Platform)
```

Kernprinzipien:

- **Provider-Abstraktion**: WhatsApp (`server/src/whatsapp`) und OpenAI
  (`server/src/openai`) sind austauschbare Services mit einer
  Mock-Implementierung. Fehlen echte Zugangsdaten, greift automatisch der
  Mock - die Anwendung bleibt voll benutzbar (**Demo-Modus**, sichtbar als
  Banner in der Oberfläche und im Bereich "Einstellungen").
- **Kein KI-Zugriff aus dem Browser**: Alle OpenAI-Aufrufe laufen
  ausschließlich serverseitig (`server/src/openai`), der API-Schlüssel
  verlässt den Server nie.
- **Bestätigungspflicht**: Antwortvorschläge werden erst nach Klick auf
  "Senden" verschickt. Der Broszeit-Assistent darf Daten lesen und
  Entwürfe erstellen, aber jede Aktion mit echter Wirkung (z.B. eine
  WhatsApp-Nachricht senden) muss über eine `pendingAction` explizit
  bestätigt werden (Function Calling, siehe `server/src/openai/tools.ts`).
- **Idempotenz**: Eingehende WhatsApp-Ereignisse werden per
  `WebhookEvent`- und `Message.externalMessageId`-Eindeutigkeit dedupliziert;
  Meta-Wiederholungszustellungen führen nie zu doppelten Nachrichten oder
  doppelten automatischen Antworten.
- **Warteschlange mit Wiederholung**: Ausgehende Nachrichten und
  Webhook-Verarbeitung laufen über eine einfache, DB-gestützte Job-Queue
  (`server/src/lib/queue.ts`) mit exponentiellem Backoff bei Fehlern.

## Lokal starten

Voraussetzungen: Node.js 20+, PostgreSQL (lokal oder via `docker-compose up -d postgres`).

```bash
npm install
cp .env.example server/.env   # Werte bei Bedarf anpassen, siehe unten
npm run prisma:migrate --workspace server
npm run prisma:seed --workspace server
npm run dev:server            # Terminal 1 - http://localhost:4000
npm run dev:web               # Terminal 2 - http://localhost:5173
```

Ohne echte `WHATSAPP_*`- oder `OPENAI_*`-Werte startet die Anwendung
automatisch im Demo-Modus (Mock-WhatsApp-Provider, deterministische
KI-Antworten) - ideal zum Ausprobieren der Oberfläche.

## Umgebungsvariablen

Siehe `.env.example` für die vollständige Liste. Wichtig: Zugangsdaten
gehören ausschließlich in `server/.env` (niemals in den Quellcode oder ins
Frontend-Bundle).

Für die WhatsApp-Einrichtung (Meta-Entwicklerkonto, App, Testnummer,
Webhook, Zugriffstoken, eigene Geschäftsnummer, Vorlagen-Freigabe) siehe
die Schritt-für-Schritt-Anleitung unter [`docs/WHATSAPP_SETUP.md`](docs/WHATSAPP_SETUP.md).

## Umsetzungsstand nach Kommunikationsphasen

**Phase 1 - Zentrale Nachrichtenansicht** ✅
Nachrichtenansicht (3-Spalten-Messenger-UI), Mock-WhatsApp-Provider,
Kundenchat, vollständige Nachrichtenhistorie, KI-Antwortvorschläge
(3 Varianten + Verfeinerungsaktionen), manuelles Bestätigen/Senden,
interne Notizen strikt getrennt von Kundennachrichten.

**Phase 2 - Echte WhatsApp Cloud API** ✅ (Anbindung fertig, ungetestet gegen echtes Meta-Konto)
Cloud-API-Client, Webhook-Empfang mit Signaturprüfung und Idempotenz,
Bilder/Dokumente/Sprachnachrichten/Standort, Zustell- und Lesestatus,
Vorlagenverwaltung inkl. Freigabestatus, automatische Kundenzuordnung
und Interessenten-Anlage aus unbekannten Nummern.

**Phase 3 - KI-gestützte Strukturierung** ✅ (Kernfunktionen; ohne UI-Feinschliff)
Automatische, unverbindliche Datenerkennung aus Gesprächen
(Bestätigungs-Workflow "Folgende Kundendaten wurden erkannt"),
Sprachtranskription (Whisper) mit Korrekturmöglichkeit, Broszeit-Assistent
mit Function Calling und Bestätigungspflicht für schreibende Aktionen,
Bildbeschreibung mit ausdrücklicher Unverbindlichkeits-Kennzeichnung.

**Phase 4 - Automatisierung & Statistiken** 🚧 (vorbereitet, bewusst zurückhaltend)
Automatikstufen 1-3 sind im Datenmodell und in den Einstellungen angelegt
und **standardmäßig deaktiviert** (Stufe 1). Die eigentliche
Auto-Antwort-Logik für Stufe 2/3 sowie Kommunikationsstatistiken und
differenzierte Team-Zuweisungsregeln sind bewusst noch nicht
implementiert, um Fehlversand ungeprüft zu vermeiden - das ist der
naheliegende nächste Ausbauschritt.

## Bekannte Vereinfachungen

- **Auth**: minimaler Header-basierter Benutzerwechsel (`x-user-id`,
  Dropdown oben rechts) statt echtem Login/JWT-Flow - bewusst isoliert in
  `server/src/middleware/auth.ts`, damit ein echtes Identitätssystem später
  ohne Änderungen an den übrigen Routen eingebaut werden kann.
- **Medienspeicherung**: lokales Dateisystem (`server/storage/media`) als
  Platzhalter für einen Objektspeicher (S3/GCS) - isoliert in
  `server/src/lib/mediaStorage.ts`.
- **Angebote/Rechnungen/PDF-Erzeugung**: Datenmodell und Function-Calling-
  Werkzeuge (Entwürfe) sind vorhanden, PDF-Rendering und die
  Auftragsabwicklungs-UI selbst sind nicht Teil dieses Kommunikationsmoduls.
