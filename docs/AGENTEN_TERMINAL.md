# Agenten-Terminal (Samantha + Team)

Vollbild-Ansicht unter **`/terminal`**. Sie ist nach **Aufträgen** aufgebaut: Jeder Auftrag hat ein eigenes Panel. So siehst du am PC sofort, wo du gebraucht wirst, was gerade läuft und was erledigt ist.

- **Team-Leiste oben**: alle Mitarbeiter mit Status (arbeitet / frei / braucht dich). Ein Klick öffnet einen neuen Auftrag an diesen Mitarbeiter, `N` öffnet einen Auftrag an Samantha.
- **Filter**: Alle · **Braucht dich** · Läuft · Erledigt. Sortiert ist immer zuerst nach „braucht dich“, dann „läuft“, dann „erledigt“.
- **Auftrags-Panel**: Auftragstext, live mitlaufender Arbeitsstand, Schrittleiste („Schritt 49 · liest kontakt_b.jpg · 20:20 min“), Eingabe für Ergänzungen, Buttons **Los** und **Stopp**. Mit ⤢ wird das Panel groß, mit × verschwindet ein erledigter Auftrag aus der Übersicht.
- **Rückfrage**: Das Panel bekommt eine pulsierende **rote Leuchtumrandung**. Antwort-Buttons beantworten mit einem Klick, getippter Text geht auch. `F` springt zur nächsten offenen Frage. Die Zahl steht zusätzlich im Browser-Tab, optional kommt eine Benachrichtigung (🔔).
- **Darstellung**: Hell / Nacht, Schriftgröße A− / A+ (wird pro Gerät gemerkt)
- **Mehrere Geräte**: Updates gehen live per Server-Sent Events an alle offenen Terminals. Als App installierbar (PWA).

## Echte Agenten anbinden

1. In `server/.env` `AGENTS_INBOUND_TOKEN` setzen. Damit endet der Demo-Modus.
2. Agenten melden sich mit **einem** HTTP-Request-Typ (z. B. ein HTTP-Node in n8n):

```
POST /api/agents/inbound
Authorization: Bearer <AGENTS_INBOUND_TOKEN>
Content-Type: application/json
```

| `type`     | Felder                                                                      | Wirkung |
|------------|-----------------------------------------------------------------------------|---------|
| `register` | `agentId`, `name`, `role?`, `isLead?`, `webhookUrl?`, `avatarUrl?`           | Mitarbeiter anlegen/aktualisieren |
| `task`     | `agentId`, `taskId?`, `title?`, `instruction?`, `status?` (running/waiting/done/stopped/failed) | Auftrag anlegen oder Status setzen |
| `step`     | `agentId`, `taskId?`, `text`                                                | Schrittzähler +1, aktueller Schritt („liest kontakt_b.jpg“) |
| `progress` | `agentId`, `taskId?`, `text`                                                | Text an den laufenden Arbeitsstand anhängen |
| `message`  | `agentId`, `taskId?`, `text`                                                | Neuer Absatz/Ergebnis im Panel |
| `question` | `agentId`, `taskId?`, `text`, `options?` (max. 6)                           | Rote Markierung, bis du antwortest |
| `status`   | `agentId`, `status` (idle/working/waiting/error/offline)                    | Status des Mitarbeiters (z. B. offline) |

Ohne `taskId` landet die Meldung beim zuletzt aktiven Auftrag des Agenten.

3. Was du im Terminal tust, wird an die `webhookUrl` des Agenten gePOSTet:
   `{ agentId, taskId, kind: "task" | "message" | "answer" | "stop", text, instruction, questionId, replyUrl }`.
   Der Agent antwortet direkt mit `{ "reply": "..." }` oder später über `/api/agents/inbound`.
   Optional wird `AGENTS_OUTBOUND_TOKEN` als Bearer-Token mitgeschickt.

Mitarbeiter können auch beim Start fest über `AGENTS_REGISTRY` (JSON) eingetragen werden, siehe `.env.example`.

## Wichtig für den Zugriff von Laptop/PC/Handy

Der Dev-Server lauscht im Netzwerk (`http://<IP>:5173/terminal`). Von unterwegs erreichst du das Terminal nur, wenn der Server erreichbar gehostet ist oder über ein privates Netz wie Tailscale. Die Terminal-Routen haben noch **kein Login**. Deshalb bitte nicht ungeschützt ins Internet stellen (siehe „Bekannte Vereinfachungen“ im README).
