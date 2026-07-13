import { useState } from "react";
import { api } from "../api/client";
import type { PendingAction } from "../api/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const EXAMPLE_PROMPTS = [
  "Zeige mir alle Kunden, die noch auf ein Angebot warten.",
  "Welche Kunden muss ich heute zurückrufen?",
  "Welche Aufträge sind diese Woche geplant?",
  "Zeige mir unbezahlte Rechnungen.",
];

export default function AssistantPage() {
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [toolResults, setToolResults] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);

  async function send(message?: string) {
    const text = message ?? input;
    if (!text.trim()) return;
    const newHistory: ChatMessage[] = [...history, { role: "user", content: text }];
    setHistory(newHistory);
    setInput("");
    setLoading(true);
    try {
      const res = await api.post<{ reply: string; toolResults: Record<string, unknown>; pendingActions: PendingAction[] }>(
        "/assistant/chat",
        { history: newHistory }
      );
      setHistory([...newHistory, { role: "assistant", content: res.reply }]);
      setToolResults(res.toolResults);
      setPendingActions((prev) => [...prev, ...res.pendingActions]);
    } catch (err: any) {
      setHistory([...newHistory, { role: "assistant", content: `Fehler: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmAction(action: PendingAction) {
    await api.post(`/assistant/confirm-action/${action.id}`);
    setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
  }

  async function rejectAction(action: PendingAction) {
    await api.post(`/assistant/confirm-action/${action.id}/reject`);
    setPendingActions((prev) => prev.filter((a) => a.id !== action.id));
  }

  return (
    <div className="assistant-page">
      <div className="assistant-intro">
        <h2>Broszeit-Assistent</h2>
        <p>
          Der Assistent kann Geschäftsdaten <strong>lesen</strong> und <strong>Entwürfe</strong> erstellen. Aktionen mit
          echter Wirkung (z.B. eine WhatsApp-Nachricht versenden) müssen von Ihnen ausdrücklich bestätigt werden.
        </p>
        <div className="example-prompts">
          {EXAMPLE_PROMPTS.map((p) => (
            <button key={p} onClick={() => send(p)}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="assistant-chat">
        {history.map((m, i) => (
          <div key={i} className={`assistant-msg ${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && <div className="assistant-msg assistant">…denkt nach</div>}
      </div>

      {pendingActions.length > 0 && (
        <div className="pending-actions">
          {pendingActions.map((a) => (
            <div key={a.id} className="pending-action-card">
              <div className="pending-action-title">Bestätigung erforderlich</div>
              <div className="pending-action-preview">{a.preview}</div>
              <div className="pending-action-buttons">
                <button onClick={() => confirmAction(a)}>Bestätigen &amp; ausführen</button>
                <button className="secondary" onClick={() => rejectAction(a)}>
                  Verwerfen
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {Object.keys(toolResults).length > 0 && (
        <details className="tool-results">
          <summary>Rohdaten der letzten Werkzeugaufrufe</summary>
          <pre>{JSON.stringify(toolResults, null, 2)}</pre>
        </details>
      )}

      <div className="assistant-input">
        <textarea
          rows={2}
          placeholder="Frage an den Broszeit-Assistenten…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button onClick={() => send()} disabled={loading || !input.trim()}>
          Senden
        </button>
      </div>
    </div>
  );
}
