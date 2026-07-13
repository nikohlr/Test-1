# WhatsApp Business Platform einrichten

Diese Anleitung führt durch die Einrichtung der offiziellen **WhatsApp Cloud API**
von Meta für die Broszeit Kommunikationszentrale. Es wird ausschließlich die
offizielle Business Platform verwendet - keine WhatsApp-Web-Automatisierung
oder Browser-Bots.

Solange die folgenden Schritte nicht abgeschlossen sind, läuft die Anwendung
automatisch im **Demo-Modus** (Mock-Provider, keine echten Nachrichten) und
bleibt vollständig benutzbar.

## 1. Meta-Entwicklerkonto anlegen

1. Gehen Sie auf https://developers.facebook.com/ und melden Sie sich mit
   einem Facebook-Konto an (ein separates Geschäftskonto empfiehlt sich).
2. Bestätigen Sie Ihre E-Mail-Adresse und ggf. Telefonnummer, um vollen
   Entwicklerzugriff zu erhalten.
3. Legen Sie unter https://business.facebook.com/ ein **Meta Business
   Konto** für "Broszeit Gartenservice" an, falls noch nicht vorhanden.

## 2. Meta-App erstellen

1. Im [App Dashboard](https://developers.facebook.com/apps/) auf
   **"App erstellen"** klicken.
2. App-Typ **"Business"** wählen.
3. Namen vergeben (z.B. "Broszeit Kommunikationszentrale") und dem
   Business-Konto aus Schritt 1 zuordnen.
4. Nach dem Anlegen: im Bereich **App-Einstellungen → Grundlegendes**
   den **App Secret** anzeigen lassen und sicher notieren
   → wird zu `META_APP_SECRET`.

## 3. WhatsApp Business Platform hinzufügen

1. Im App Dashboard links auf **"Produkt hinzufügen"**.
2. **WhatsApp** auswählen und **"Einrichten"** klicken.
3. Meta erstellt automatisch ein **WhatsApp Business Account (WABA)** und
   eine kostenlose **Testnummer**.
4. Die **WhatsApp Business Account ID** ist im Bereich
   **WhatsApp → API-Setup** sichtbar → wird zu `WHATSAPP_BUSINESS_ACCOUNT_ID`.

## 4. Testnummer einrichten

1. Unter **WhatsApp → API-Setup** finden Sie die von Meta bereitgestellte
   Testnummer sowie deren **Phone Number ID**
   → wird zu `WHATSAPP_PHONE_NUMBER_ID`.
2. Fügen Sie unter **"To"** bis zu 5 private Empfänger-Rufnummern hinzu
   (eigenes Handy), um Testnachrichten zu empfangen. Diese müssen den
   Verifizierungscode bestätigen, den WhatsApp per Nachricht sendet.
3. Mit dem Button **"Send message"** kann direkt im Dashboard eine
   Testnachricht verschickt werden, um die Einrichtung zu prüfen.

## 5. Webhook konfigurieren

1. Legen Sie in `server/.env` einen eigenen, zufälligen Wert für
   `WHATSAPP_WEBHOOK_VERIFY_TOKEN` fest (ein beliebiges, geheimes
   Passwort - **nicht** das Access Token).
2. Starten Sie den Server so, dass er über eine öffentlich erreichbare
   HTTPS-URL angesprochen werden kann (z.B. über einen Tunnel-Dienst wie
   ngrok während der Entwicklung, oder Ihre produktive Domain).
3. Im App Dashboard unter **WhatsApp → Konfiguration → Webhook**:
   - **Callback-URL**: `https://IHRE-DOMAIN/webhooks/whatsapp`
   - **Verify Token**: der Wert aus Schritt 1
   - Auf **"Verifizieren und speichern"** klicken. Der Server beantwortet
     den GET-Request automatisch korrekt (siehe `src/routes/webhooks.ts`).
4. Webhook-Felder abonnieren: mindestens `messages` (für eingehende
   Nachrichten und Zustell-/Lesestatus).

## 6. Zugriffstoken hinterlegen

1. Für erste Tests kann das **temporäre Access Token** aus
   **WhatsApp → API-Setup** verwendet werden (gültig für 24 Stunden).
2. Für den Dauerbetrieb: unter **Systembenutzer** (Business-Einstellungen)
   einen Systembenutzer mit der Rolle "Admin" anlegen und diesem
   Zugriff auf die WhatsApp-App gewähren. Dort ein **permanentes
   Zugriffstoken** generieren.
3. Alle Werte in `server/.env` eintragen (niemals in den Quellcode!):

   ```
   WHATSAPP_ACCESS_TOKEN=...
   WHATSAPP_PHONE_NUMBER_ID=...
   WHATSAPP_BUSINESS_ACCOUNT_ID=...
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=...
   META_APP_SECRET=...
   WHATSAPP_API_VERSION=v21.0
   ```

4. Server neu starten. Solange auch nur einer dieser Werte fehlt, bleibt
   die Anwendung automatisch im Demo-Modus (siehe Statusanzeige unter
   "Einstellungen").

## 7. Eigene Geschäftsnummer später verbinden

Die Testnummer eignet sich nur für die Entwicklung (eingeschränkter
Versand, max. 5 Test-Empfänger). Für den Live-Betrieb:

1. Unter **WhatsApp → Konfiguration → Rufnummern** auf
   **"Rufnummer hinzufügen"** klicken.
2. Die reale Geschäftsnummer eintragen. Diese darf **nicht** bereits in
   der normalen WhatsApp- oder WhatsApp-Business-App registriert sein
   (ggf. vorher dort deregistrieren).
3. Verifizierung per SMS oder Anruf durchführen.
4. Meta Business-Verifizierung abschließen (Handelsregisterauszug o.ä.
   kann angefordert werden), um Versandlimits zu erhöhen.
5. `WHATSAPP_PHONE_NUMBER_ID` in `server/.env` auf die ID der neuen
   Nummer umstellen.

## 8. Nachrichtenvorlagen anlegen und freigeben lassen

Außerhalb des 24-Stunden-Kundenservice-Fensters (d.h. wenn der Kunde
nicht innerhalb der letzten 24h geschrieben hat) dürfen ausschließlich
**freigegebene Vorlagen** verschickt werden.

1. Vorlagen können im Verwaltungsbereich **"Vorlagen"** der Anwendung
   angelegt werden (interner Name, Inhalt, Variablen, Kategorie).
2. Zusätzlich müssen sie bei Meta eingereicht werden: entweder über den
   **Business-Manager → WhatsApp-Manager → Nachrichtenvorlagen** oder
   über die Business-Management-API
   (`POST /{waba-id}/message_templates`).
3. Meta prüft die Vorlage (meist innerhalb weniger Minuten bis Stunden)
   und setzt sie auf **"Genehmigt"**, **"Abgelehnt"** oder lässt sie in
   Prüfung. Der Button **"Sync"** in der Vorlagenverwaltung der
   Anwendung ruft diesen Status ab, sobald die echte Anbindung
   konfiguriert ist (aktuell ein Platzhalter im Demo-Modus).
4. Erst **genehmigte** Vorlagen dürfen für Nachrichten außerhalb des
   24h-Fensters verwendet werden - die Anwendung speichert den
   Freigabestatus je Vorlage (`approvalStatus`), um dies nachvollziehbar
   zu machen.

---

## Häufige Stolpersteine

- **Webhook-Verifizierung schlägt fehl**: `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
  in `.env` muss exakt mit dem im App Dashboard eingetragenen Wert
  übereinstimmen.
- **401 bei eingehenden Webhooks**: Meta signiert jede Anfrage mit
  `META_APP_SECRET` (Header `X-Hub-Signature-256`). Stimmt das Secret
  nicht, wird die Anfrage von der Anwendung abgelehnt (siehe
  `src/whatsapp/signature.ts`).
- **Testnachrichten kommen nicht an**: Empfängernummer muss unter
  "To numbers" im API-Setup hinzugefügt und verifiziert sein - das gilt
  nur für die kostenlose Testnummer, nicht für eine verifizierte eigene
  Geschäftsnummer.
- **Vorlage wird abgelehnt**: Meta lehnt Vorlagen mit werblichem Inhalt,
  fehlenden Variablen-Beispielen oder unklarer Kategorie häufig ab -
  Inhalt möglichst sachlich/transaktional halten (Kategorie `UTILITY`).
