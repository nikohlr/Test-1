import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { MessageTemplate } from "../api/types";

const APPROVAL_LABELS: Record<string, string> = {
  DRAFT: "Entwurf",
  PENDING: "Zur Freigabe bei Meta eingereicht",
  APPROVED: "Freigegeben",
  REJECTED: "Abgelehnt",
  DISABLED: "Deaktiviert",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [editing, setEditing] = useState<Partial<MessageTemplate> | null>(null);

  function reload() {
    api.get<MessageTemplate[]>("/templates").then(setTemplates);
  }

  useEffect(reload, []);

  async function save() {
    if (!editing) return;
    if (editing.id) {
      await api.patch(`/templates/${editing.id}`, editing);
    } else {
      await api.post("/templates", editing);
    }
    setEditing(null);
    reload();
  }

  async function toggleActive(t: MessageTemplate) {
    await api.patch(`/templates/${t.id}`, { active: !t.active });
    reload();
  }

  async function sync(t: MessageTemplate) {
    await api.post(`/templates/${t.id}/sync`);
    reload();
  }

  return (
    <div className="templates-page">
      <div className="page-header">
        <h2>WhatsApp-Nachrichtenvorlagen</h2>
        <button onClick={() => setEditing({ channel: "WHATSAPP", language: "de", internalName: "", content: "" })}>
          Neue Vorlage
        </button>
      </div>
      <p className="hint">
        Nachrichten außerhalb des zulässigen Kundenservice-Zeitraums (24h-Fenster) dürfen nur mit von Meta freigegebenen
        Vorlagen versendet werden.
      </p>

      <table className="templates-table">
        <thead>
          <tr>
            <th>Interner Name</th>
            <th>Meta-Vorlagenname</th>
            <th>Sprache</th>
            <th>Kategorie</th>
            <th>Freigabestatus</th>
            <th>Letzter Sync</th>
            <th>Aktiv</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id}>
              <td>{t.internalName}</td>
              <td>{t.externalTemplateName ?? "—"}</td>
              <td>{t.language}</td>
              <td>{t.category ?? "—"}</td>
              <td>
                <span className={`badge status-${t.approvalStatus.toLowerCase()}`}>{APPROVAL_LABELS[t.approvalStatus]}</span>
              </td>
              <td>{t.lastSyncedAt ? new Date(t.lastSyncedAt).toLocaleString("de-DE") : "—"}</td>
              <td>
                <input type="checkbox" checked={t.active} onChange={() => toggleActive(t)} />
              </td>
              <td>
                <button className="small" onClick={() => setEditing(t)}>
                  Bearbeiten
                </button>
                <button className="small" onClick={() => sync(t)}>
                  Sync
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing.id ? "Vorlage bearbeiten" : "Neue Vorlage"}</h3>
            <label>
              Interner Name
              <input value={editing.internalName ?? ""} onChange={(e) => setEditing({ ...editing, internalName: e.target.value })} />
            </label>
            <label>
              Meta-Vorlagenname
              <input
                value={editing.externalTemplateName ?? ""}
                onChange={(e) => setEditing({ ...editing, externalTemplateName: e.target.value })}
              />
            </label>
            <label>
              Kategorie
              <input value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
            </label>
            <label>
              Inhalt (Variablen als {"{{"}variable{"}}"})
              <textarea rows={4} value={editing.content ?? ""} onChange={(e) => setEditing({ ...editing, content: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button onClick={save}>Speichern</button>
              <button className="secondary" onClick={() => setEditing(null)}>
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
