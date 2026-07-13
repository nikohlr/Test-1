import { useEffect, useState } from "react";
import { api } from "../api/client";

interface Settings {
  inquiryDialogText: string;
  automationLevel: "SUGGESTIONS_ONLY" | "STANDARD_AUTO_REPLIES" | "ADVANCED";
  demoMode: { whatsapp: boolean; openai: boolean };
}

const LEVELS: { value: Settings["automationLevel"]; title: string; description: string }[] = [
  {
    value: "SUGGESTIONS_ONLY",
    title: "Stufe 1 — Nur Vorschläge (Standard)",
    description: "Die KI erstellt lediglich Antwortvorschläge. Jede Nachricht wird manuell von Ihnen gesendet.",
  },
  {
    value: "STANDARD_AUTO_REPLIES",
    title: "Stufe 2 — Automatische Standardantworten",
    description: "Nur eindeutig definierte Nachrichten (Eingangsbestätigung, Geschäftszeiten, Bitte um Adresse/Bilder) werden automatisch gesendet.",
  },
  {
    value: "ADVANCED",
    title: "Stufe 3 — Erweiterte Automatisierung",
    description:
      "Die KI darf innerhalb strenger Regeln einfache Gespräche führen. Preise, Rabatte, rechtliche Aussagen, Zahlungsvereinbarungen, Terminabsagen und verbindliche Zusagen bleiben immer ausgeschlossen.",
  },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [dialogText, setDialogText] = useState("");
  const [health, setHealth] = useState<any>(null);

  useEffect(() => {
    api.get<Settings>("/settings").then((s) => {
      setSettings(s);
      setDialogText(s.inquiryDialogText);
    });
    api.get<any>("/health").then(setHealth);
  }, []);

  async function saveDialogText() {
    await api.put("/settings/inquiry-dialog-text", { value: dialogText });
  }

  async function setLevel(value: Settings["automationLevel"]) {
    if (value !== "SUGGESTIONS_ONLY") {
      const ok = window.confirm(
        "Automatikstufen versenden Nachrichten ohne manuelle Bestätigung. Wirklich aktivieren?"
      );
      if (!ok) return;
    }
    await api.put("/settings/automation-level", { value });
    setSettings((s) => (s ? { ...s, automationLevel: value } : s));
  }

  if (!settings) return <div className="empty-hint">Lade Einstellungen…</div>;

  return (
    <div className="settings-page">
      <section>
        <h2>Integrationen</h2>
        <table className="status-table">
          <tbody>
            <tr>
              <td>WhatsApp Cloud API</td>
              <td>{settings.demoMode.whatsapp ? "Demo-Modus (keine echten Zugangsdaten)" : "Live verbunden"}</td>
            </tr>
            <tr>
              <td>OpenAI</td>
              <td>{settings.demoMode.openai ? "Demo-Modus (kein API-Schlüssel)" : "Live verbunden"}</td>
            </tr>
            <tr>
              <td>Datenbank</td>
              <td>{health?.database === "up" ? "Verbunden" : "Nicht erreichbar"}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>Standarddialog für neue WhatsApp-Anfragen</h2>
        <textarea rows={8} value={dialogText} onChange={(e) => setDialogText(e.target.value)} />
        <button onClick={saveDialogText}>Speichern</button>
      </section>

      <section>
        <h2>Automatikmodus (standardmäßig deaktiviert)</h2>
        {LEVELS.map((l) => (
          <label key={l.value} className="automation-level-option">
            <input type="radio" checked={settings.automationLevel === l.value} onChange={() => setLevel(l.value)} />
            <div>
              <div className="level-title">{l.title}</div>
              <div className="level-description">{l.description}</div>
            </div>
          </label>
        ))}
      </section>
    </div>
  );
}
