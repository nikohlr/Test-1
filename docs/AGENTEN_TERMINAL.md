# Agenten-Terminal (Samantha + Team)

Vollbild-Terminal unter **`/terminal`**. Dort siehst du live, was Samantha und jeder einzelne Agent gerade macht, und kannst mit allen direkt chatten.

- **Kacheln pro Agent**: Status (arbeitet / bereit / wartet auf dich / Fehler / offline), aktuelle Aufgabe, Fortschritt, letzte Schritte
- **Offene Frage** = pulsierende **rote Leuchtumrandung** + roter Balken oben + Zähler im Browser-Tab + optional eine System-Benachrichtigung
- **Chat** rechts (auf dem Handy als Vollbild). Antwort-Buttons beantworten die Frage mit einem Klick. Getippter Text beantwortet die Frage, wenn genau eine offen ist.
- **Tastatur**: `Alt+1…9` wählt einen Agenten, `F` springt zur nächsten offenen Frage, `Esc` schließt den Chat
- **Live-Protokoll** unten über alle Agenten
- **Mehrere Geräte**: Updates gehen per Server-Sent Events an alle offenen Terminals. Als App installierbar (PWA, „Zum Startbildschirm hinzufügen“)

## Echte Agenten anbinden

1. In `server/.env` `AGENTS_INBOUND_TOKEN` setzen. Damit endet der Demo-Modus.
2. Deine Agenten (z. B. n8n-Workflows) melden sich mit einem HTTP-Request:

```
POST /api/agents/inbound
Authorization: Bearer <AGENTS_INBOUND_TOKEN>
Content-Type: application/json
```

| `type`     | Felder                                                        | Wirkung |
|------------|---------------------------------------------------------------|---------|
| `register` | `agentId`, `name`, `role?`, `isLead?`, `webhookUrl?`          | Agent anlegen/aktualisieren |
| `status`   | `agentId`, `status`, `currentTask?`, `progress?` (0–100)      | Kachel aktualisieren |
| `activity` | `agentId`, `text`, `level?` (info/success/warn/error)         | Zeile im Protokoll |
| `message`  | `agentId`, `text`                                             | Nachricht im Chat |
| `question` | `agentId`, `text`, `options?` (max. 6)                        | Rote Markierung, bis du antwortest |

3. Was du im Terminal schreibst, wird an die `webhookUrl` des Agenten gePOSTet:
   `{ agentId, kind: "message" | "answer", text, questionId, replyUrl }`.
   Der Agent antwortet direkt mit `{ "reply": "..." }` oder später über `/api/agents/inbound`.
   Optional wird `AGENTS_OUTBOUND_TOKEN` als Bearer-Token mitgeschickt.

Agenten können auch beim Start fest über `AGENTS_REGISTRY` (JSON) eingetragen werden, siehe `.env.example`.

## Wichtig für den Zugriff von Laptop/PC/Handy

Der Dev-Server lauscht im Netzwerk (`http://<IP>:5173/terminal`). Von unterwegs erreichst du das Terminal nur, wenn der Server erreichbar gehostet ist oder über ein privates Netz wie Tailscale. Die Terminal-Routen haben noch **kein Login**. Deshalb bitte nicht ungeschützt ins Internet stellen (siehe „Bekannte Vereinfachungen“ im README).
