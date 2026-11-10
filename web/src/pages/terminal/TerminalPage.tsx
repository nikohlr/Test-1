import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAgentTerminal, type Agent, type AgentQuestion, type ActivityEntry } from "./useAgentTerminal";
import "./terminal.css";

const STATUS_LABEL: Record<Agent["status"], string> = {
  working: "arbeitet",
  waiting: "wartet auf dich",
  idle: "bereit",
  error: "Fehler",
  offline: "offline",
};

const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default function TerminalPage() {
  const { agentId } = useParams();
  const navigate = useNavigate();
  const t = useAgentTerminal(agentId ?? null);
  const [clock, setClock] = useState(() => new Date());
  const [notifyOn, setNotifyOn] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");

  const selected = t.agents.find((a) => a.id === agentId) ?? null;
  const select = (id: string | null) => navigate(id ? `/terminal/${id}` : "/terminal");

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Tab title shows open questions, so you see it even from another tab/window.
  useEffect(() => {
    document.title = t.openQuestions.length ? `(${t.openQuestions.length}) Fragen offen · Agenten-Terminal` : "Agenten-Terminal";
    return () => {
      document.title = "Broszeit Kommunikationszentrale";
    };
  }, [t.openQuestions.length]);

  // Desktop/phone notification when an agent asks something.
  t.onQuestion((q) => {
    if (!notifyOn || document.hasFocus()) return;
    const agent = t.agents.find((a) => a.id === q.agentId);
    const n = new Notification(`${agent?.name ?? "Agent"} hat eine Frage`, { body: q.text, tag: q.id });
    n.onclick = () => {
      window.focus();
      select(q.agentId);
    };
  });

  // Keyboard: Alt+1..9 picks an agent, Alt+0 back to overview, "f" jumps to the next open question.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.altKey && /^[0-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        select(idx < 0 ? null : t.agents[idx]?.id ?? null);
      } else if (!typing && e.key === "f" && t.openQuestions[0]) {
        select(t.openQuestions[0].agentId);
      } else if (e.key === "Escape" && !typing) {
        select(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const counts = useMemo(
    () => ({
      working: t.agents.filter((a) => a.status === "working").length,
      waiting: t.openQuestions.length,
      idle: t.agents.filter((a) => a.status === "idle").length,
    }),
    [t.agents, t.openQuestions]
  );

  return (
    <div className={`term ${selected ? "has-selection" : ""}`}>
      <header className="term-header">
        <Link to="/messages" className="term-back" title="Zur Kommunikationszentrale">
          ←
        </Link>
        <div className="term-brand">
          <span className="term-prompt">❯</span> AGENTEN-TERMINAL
        </div>
        <div className={`term-live ${t.connected ? "on" : ""}`}>{t.connected ? "LIVE" : "VERBINDE…"}</div>
        <div className="term-counters">
          <span className="c-working">{counts.working} aktiv</span>
          <span className={`c-waiting ${counts.waiting ? "alert" : ""}`}>{counts.waiting} Fragen</span>
          <span className="c-idle">{counts.idle} bereit</span>
        </div>
        {typeof Notification !== "undefined" && !notifyOn && (
          <button
            className="term-btn"
            onClick={() => Notification.requestPermission().then((p) => setNotifyOn(p === "granted"))}
          >
            🔔 Benachrichtigen
          </button>
        )}
        <div className="term-clock">{clock.toLocaleTimeString("de-DE")}</div>
      </header>

      {t.demoMode && <div className="term-demo">DEMO · simulierte Agenten – AGENTS_INBOUND_TOKEN in server/.env setzen und echte Agenten anbinden.</div>}

      {t.openQuestions.length > 0 && (
        <button className="term-alertbar" onClick={() => select(t.openQuestions[0].agentId)}>
          <span className="blink">●</span> {t.openQuestions.length === 1 ? "1 Frage wartet" : `${t.openQuestions.length} Fragen warten`} auf dich –{" "}
          {[...new Set(t.openQuestions.map((q) => t.agents.find((a) => a.id === q.agentId)?.name))].join(", ")}
          <kbd>F</kbd>
        </button>
      )}

      <div className="term-body">
        <section className="term-grid" aria-label="Mitarbeiter">
          {t.agents.map((agent, i) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              hotkey={i < 9 ? i + 1 : null}
              selected={agent.id === agentId}
              openQuestions={t.openQuestions.filter((q) => q.agentId === agent.id).length}
              unread={t.unread[agent.id] ?? 0}
              activity={t.activity.filter((a) => a.agentId === agent.id).slice(-3)}
              onClick={() => select(agent.id === agentId ? null : agent.id)}
            />
          ))}
          {t.agents.length === 0 && <div className="term-empty">Noch keine Agenten verbunden.</div>}
        </section>

        {selected && (
          <ChatPanel
            agent={selected}
            messages={t.messages}
            questions={t.questions.filter((q) => q.agentId === selected.id)}
            onClose={() => select(null)}
            onSend={(text) => t.sendMessage(selected.id, text)}
            onAnswer={t.answerQuestion}
          />
        )}
      </div>

      <footer className="term-feed" aria-label="Live-Protokoll">
        {t.activity
          .slice(-6)
          .reverse()
          .map((e) => (
            <FeedLine key={e.id} entry={e} agent={t.agents.find((a) => a.id === e.agentId)} />
          ))}
      </footer>
    </div>
  );
}

function AgentCard(props: {
  agent: Agent;
  hotkey: number | null;
  selected: boolean;
  openQuestions: number;
  unread: number;
  activity: ActivityEntry[];
  onClick: () => void;
}) {
  const { agent } = props;
  const alert = props.openQuestions > 0;
  return (
    <button
      className={`agent-card st-${agent.status} ${agent.isLead ? "lead" : ""} ${alert ? "alert" : ""} ${props.selected ? "selected" : ""}`}
      onClick={props.onClick}
    >
      <div className="agent-top">
        <div className="agent-avatar">{initials(agent.name)}</div>
        <div className="agent-id">
          <div className="agent-name">
            {agent.name}
            {agent.isLead && <span className="lead-tag">LEAD</span>}
          </div>
          <div className="agent-role">{agent.role}</div>
        </div>
        <div className="agent-badges">
          {alert && <span className="badge-q">? {props.openQuestions}</span>}
          {props.unread > 0 && <span className="badge-unread">{props.unread}</span>}
          {props.hotkey && <kbd>Alt+{props.hotkey}</kbd>}
        </div>
      </div>
      <div className="agent-status">
        <span className="dot" /> {STATUS_LABEL[agent.status]}
      </div>
      <div className="agent-task">{agent.currentTask ?? <span className="muted">— keine laufende Aufgabe —</span>}</div>
      {agent.progress !== null && agent.status === "working" && (
        <div className="agent-progress">
          <div style={{ width: `${agent.progress}%` }} />
        </div>
      )}
      <div className="agent-log">
        {props.activity.map((e) => (
          <div key={e.id} className={`lvl-${e.level}`}>
            <span className="muted">{time(e.createdAt)}</span> {e.text}
          </div>
        ))}
      </div>
    </button>
  );
}

function ChatPanel(props: {
  agent: Agent;
  messages: ReturnType<typeof useAgentTerminal>["messages"];
  questions: AgentQuestion[];
  onClose: () => void;
  onSend: (text: string) => Promise<void>;
  onAnswer: (questionId: string, answer: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const openQuestions = props.questions.filter((q) => q.status === "open");
  const questionById = new Map(props.questions.map((q) => [q.id, q]));

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [props.messages.length, props.agent.id]);
  useEffect(() => {
    inputRef.current?.focus();
  }, [props.agent.id]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: any) {
      setError(e?.message ?? "Fehler");
    } finally {
      setBusy(false);
    }
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    // If the agent is waiting on exactly one question, a typed reply answers it.
    const target = openQuestions.length === 1 ? openQuestions[0] : null;
    run(async () => {
      if (target) await props.onAnswer(target.id, text);
      else await props.onSend(text);
      setDraft("");
    });
  };

  return (
    <section className={`chat ${openQuestions.length ? "alert" : ""}`} aria-label={`Chat mit ${props.agent.name}`}>
      <header className="chat-head">
        <div className="agent-avatar small">{initials(props.agent.name)}</div>
        <div>
          <div className="agent-name">{props.agent.name}</div>
          <div className={`chat-status st-${props.agent.status}`}>
            <span className="dot" /> {STATUS_LABEL[props.agent.status]}
            {props.agent.currentTask && ` · ${props.agent.currentTask}`}
          </div>
        </div>
        <button className="term-btn chat-close" onClick={props.onClose} title="Schließen (Esc)">
          ✕
        </button>
      </header>

      <div className="chat-log">
        {props.messages.map((m) => {
          const q = m.questionId ? questionById.get(m.questionId) : undefined;
          const isQuestion = q && m.from === "agent";
          return (
            <div key={m.id} className={`msg from-${m.from} ${isQuestion ? "question" : ""} ${isQuestion && q!.status === "open" ? "open" : ""}`}>
              <div className="msg-meta">
                {m.from === "user" ? "du" : m.from === "agent" ? props.agent.name.toLowerCase() : "system"} · {time(m.createdAt)}
                {isQuestion && (q!.status === "open" ? " · FRAGE OFFEN" : " · beantwortet")}
              </div>
              <div className="msg-text">{m.text}</div>
              {isQuestion && q!.status === "open" && q!.options.length > 0 && (
                <div className="msg-options">
                  {q!.options.map((opt) => (
                    <button key={opt} disabled={busy} onClick={() => run(() => props.onAnswer(q!.id, opt))}>
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <div className="chat-error">{error}</div>}
      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <span className="term-prompt">❯</span>
        <textarea
          ref={inputRef}
          rows={1}
          value={draft}
          placeholder={openQuestions.length === 1 ? "Antwort auf die offene Frage…" : `Nachricht an ${props.agent.name}…`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <button type="submit" className="term-btn" disabled={busy || !draft.trim()}>
          Senden
        </button>
      </form>
    </section>
  );
}

function FeedLine({ entry, agent }: { entry: ActivityEntry; agent?: Agent }) {
  return (
    <div className={`feed-line lvl-${entry.level}`}>
      <span className="muted">{time(entry.createdAt)}</span> <span className="feed-agent">[{agent?.name ?? entry.agentId}]</span> {entry.text}
    </div>
  );
}
