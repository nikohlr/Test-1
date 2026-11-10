import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAgentTerminal, type Agent, type AgentMessage, type AgentQuestion, type AgentTask, type TaskStatus } from "./useAgentTerminal";
import "./terminal.css";

type Filter = "all" | "needs" | "running" | "done";
type Theme = "hell" | "nacht";

const TASK_LABEL: Record<TaskStatus, string> = {
  running: "Arbeitet",
  waiting: "Braucht dich",
  done: "Erledigt",
  stopped: "Gestoppt",
  failed: "Fehler",
};
const AGENT_LABEL: Record<Agent["status"], string> = {
  working: "arbeitet",
  waiting: "braucht dich",
  idle: "frei",
  error: "Fehler",
  offline: "offline",
};
// Sort order: what needs you first, then running, then finished (newest first within each group).
const ORDER: Record<TaskStatus, number> = { waiting: 0, running: 1, failed: 2, done: 3, stopped: 4 };

const isActive = (t: AgentTask) => t.status === "running" || t.status === "waiting";
const time = (iso: string) => new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

function duration(task: AgentTask, nowMs: number) {
  const end = task.finishedAt ? new Date(task.finishedAt).getTime() : nowMs;
  const s = Math.max(0, Math.floor((end - new Date(task.createdAt).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}

function readPref<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export default function TerminalPage() {
  const t = useAgentTerminal();
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<Filter>("all");
  const [theme, setTheme] = useState<Theme>(() => readPref<Theme>("terminal.theme", "hell"));
  const [scale, setScale] = useState(() => Number(readPref("terminal.scale", "1")) || 1);
  const [composeFor, setComposeFor] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notifyOn, setNotifyOn] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  const taskRefs = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => writePref("terminal.theme", theme), [theme]);
  useEffect(() => writePref("terminal.scale", String(scale)), [scale]);

  const openByTask = useMemo(() => {
    const map = new Map<string, AgentQuestion[]>();
    t.openQuestions.forEach((q) => map.set(q.taskId, [...(map.get(q.taskId) ?? []), q]));
    return map;
  }, [t.openQuestions]);

  const counts = {
    needs: t.tasks.filter((x) => x.status === "waiting").length,
    running: t.tasks.filter((x) => x.status === "running").length,
    done: t.tasks.filter((x) => !isActive(x)).length,
  };

  const visible = t.tasks
    .filter((x) =>
      filter === "all" ? true : filter === "needs" ? x.status === "waiting" : filter === "running" ? x.status === "running" : !isActive(x)
    )
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.updatedAt.localeCompare(a.updatedAt));

  // Tab title shows what needs you, so you see it from any other window.
  useEffect(() => {
    document.title = counts.needs ? `(${counts.needs}) braucht dich · Agenten-Terminal` : `Agenten-Terminal · ${counts.running} laufen`;
    return () => {
      document.title = "Broszeit Kommunikationszentrale";
    };
  }, [counts.needs, counts.running]);

  const jumpTo = (taskId: string) => {
    setFilter("all");
    requestAnimationFrame(() => taskRefs.current.get(taskId)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  t.onQuestion((q) => {
    if (!notifyOn || document.hasFocus()) return;
    const agent = t.agents.find((a) => a.id === q.agentId);
    const n = new Notification(`${agent?.name ?? "Agent"} braucht dich`, { body: q.text, tag: q.id });
    n.onclick = () => {
      window.focus();
      jumpTo(q.taskId);
    };
  });

  // Keyboard: F = next task that needs you, N = new task for Samantha, Esc = close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return;
      if (e.key === "f" && t.openQuestions[0]) jumpTo(t.openQuestions[0].taskId);
      else if (e.key === "n") {
        e.preventDefault();
        setComposeFor(t.agents.find((a) => a.isLead)?.id ?? t.agents[0]?.id ?? null);
      } else if (e.key === "Escape") {
        setExpanded(null);
        setComposeFor(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const composeAgent = t.agents.find((a) => a.id === composeFor) ?? null;

  return (
    <div className="term" data-theme={theme} style={{ ["--scale" as string]: scale }}>
      <header className="term-header">
        <Link to="/messages" className="term-back" title="Zur Kommunikationszentrale">
          ←
        </Link>
        <div className="term-title">
          <div className="term-brand">Agenten-Terminal</div>
          <div className="term-date">{now.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
        </div>
        <div className="term-clock">{now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</div>
        <div className={`term-live ${t.connected ? "on" : ""}`}>{t.connected ? "live" : "verbinde…"}</div>
        <div className="term-tools">
          <div className="seg">
            <button className={theme === "hell" ? "on" : ""} onClick={() => setTheme("hell")}>
              Hell
            </button>
            <button className={theme === "nacht" ? "on" : ""} onClick={() => setTheme("nacht")}>
              Nacht
            </button>
          </div>
          <button className="tool" onClick={() => setScale((s) => Math.max(0.85, +(s - 0.1).toFixed(2)))} title="Schrift kleiner">
            A−
          </button>
          <button className="tool" onClick={() => setScale((s) => Math.min(1.5, +(s + 0.1).toFixed(2)))} title="Schrift größer">
            A+
          </button>
          {typeof Notification !== "undefined" && !notifyOn && (
            <button className="tool" onClick={() => Notification.requestPermission().then((p) => setNotifyOn(p === "granted"))}>
              🔔
            </button>
          )}
        </div>
      </header>

      {t.demoMode && <div className="term-demo">Demo: simulierte Agenten. Echte Agenten anbinden: docs/AGENTEN_TERMINAL.md</div>}

      {/* Team strip: who is doing what, click = new Auftrag */}
      <nav className="team" aria-label="Mitarbeiter">
        {t.agents.map((a) => (
          <button
            key={a.id}
            className={`member st-${a.status} ${composeFor === a.id ? "selected" : ""}`}
            onClick={() => setComposeFor(composeFor === a.id ? null : a.id)}
            title={`${a.name}: ${AGENT_LABEL[a.status]}${a.currentTask ? ` · ${a.currentTask}` : ""}\nKlicken für neuen Auftrag`}
          >
            <Avatar agent={a} size="sm" />
            <span className="member-text">
              <span className="member-name">
                {a.name}
                {a.isLead && <span className="lead-tag">Leitung</span>}
              </span>
              <span className="member-status">
                <span className="dot" /> {AGENT_LABEL[a.status]}
              </span>
            </span>
          </button>
        ))}
        <button className="member add" onClick={() => setComposeFor(t.agents.find((a) => a.isLead)?.id ?? t.agents[0]?.id ?? null)}>
          + Neuer Auftrag <kbd>N</kbd>
        </button>
      </nav>

      <div className="filters">
        <FilterBtn on={filter === "all"} onClick={() => setFilter("all")} label="Alle" count={t.tasks.length} />
        <FilterBtn on={filter === "needs"} onClick={() => setFilter("needs")} label="Braucht dich" count={counts.needs} alert={counts.needs > 0} />
        <FilterBtn on={filter === "running"} onClick={() => setFilter("running")} label="Läuft" count={counts.running} />
        <FilterBtn on={filter === "done"} onClick={() => setFilter("done")} label="Erledigt" count={counts.done} />
        {counts.needs > 0 && (
          <button className="needs-jump" onClick={() => jumpTo(t.openQuestions[0].taskId)}>
            <span className="pulse-dot" /> Zur nächsten Frage <kbd>F</kbd>
          </button>
        )}
      </div>

      <main className="board">
        {composeAgent && (
          <Composer
            agent={composeAgent}
            agents={t.agents}
            onAgent={setComposeFor}
            onClose={() => setComposeFor(null)}
            onSubmit={async (text) => {
              const task = await t.createTask(composeAgent.id, text);
              setComposeFor(null);
              setFilter("all");
              jumpTo(task.id);
            }}
          />
        )}
        {visible.map((task) => (
          <TaskPanel
            key={task.id}
            refCb={(el) => (el ? taskRefs.current.set(task.id, el) : taskRefs.current.delete(task.id))}
            task={task}
            agent={t.agents.find((a) => a.id === task.agentId)}
            messages={t.messages[task.id]}
            questions={t.questions.filter((q) => q.taskId === task.id)}
            openCount={openByTask.get(task.id)?.length ?? 0}
            nowMs={now.getTime()}
            expanded={expanded === task.id}
            onExpand={() => setExpanded(expanded === task.id ? null : task.id)}
            loadMessages={t.loadMessages}
            onSend={(text) => t.sendToTask(task.id, text)}
            onAnswer={t.answerQuestion}
            onStop={() => t.stopTask(task.id)}
            onArchive={() => t.archiveTask(task.id)}
          />
        ))}
        {visible.length === 0 && !composeAgent && (
          <div className="empty">{filter === "needs" ? "Nichts offen. Niemand wartet auf dich. 👍" : "Keine Aufträge in dieser Ansicht."}</div>
        )}
      </main>
    </div>
  );
}

function FilterBtn(props: { on: boolean; onClick: () => void; label: string; count: number; alert?: boolean }) {
  return (
    <button className={`filter ${props.on ? "on" : ""} ${props.alert ? "alert" : ""}`} onClick={props.onClick}>
      {props.label} <span className="count">{props.count}</span>
    </button>
  );
}

function Avatar({ agent, size = "md" }: { agent?: Agent; size?: "sm" | "md" }) {
  const name = agent?.name ?? "?";
  return (
    <span className={`ag-avatar ${size} st-${agent?.status ?? "idle"}`}>
      {agent?.avatarUrl ? <img src={agent.avatarUrl} alt="" /> : name.slice(0, 2).toUpperCase()}
    </span>
  );
}

function Composer(props: { agent: Agent; agents: Agent[]; onAgent: (id: string) => void; onClose: () => void; onSubmit: (text: string) => Promise<void> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, [props.agent.id]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await props.onSubmit(text.trim());
    } catch (e: any) {
      setError(e?.message ?? "Fehler");
      setBusy(false);
    }
  };

  return (
    <section className="panel composer">
      <header className="panel-head">
        <Avatar agent={props.agent} />
        <div className="panel-id">
          <div className="panel-title">Neuer Auftrag</div>
          <div className="panel-sub">
            an{" "}
            <select value={props.agent.id} onChange={(e) => props.onAgent(e.target.value)}>
              {props.agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} – {a.role}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className="icon-btn" onClick={props.onClose} title="Schließen (Esc)">
          ×
        </button>
      </header>
      <div className="composer-body">
        <textarea
          ref={ref}
          rows={4}
          value={text}
          placeholder={`Was soll ${props.agent.name} erledigen? (Enter sendet, Shift+Enter neue Zeile)`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        {error && <div className="panel-error">{error}</div>}
        <div className="composer-actions">
          <button className="btn primary" disabled={busy || !text.trim()} onClick={submit}>
            Los
          </button>
        </div>
      </div>
    </section>
  );
}

function TaskPanel(props: {
  refCb: (el: HTMLElement | null) => void;
  task: AgentTask;
  agent?: Agent;
  messages?: AgentMessage[];
  questions: AgentQuestion[];
  openCount: number;
  nowMs: number;
  expanded: boolean;
  onExpand: () => void;
  loadMessages: (taskId: string) => Promise<void>;
  onSend: (text: string) => Promise<unknown>;
  onAnswer: (questionId: string, answer: string) => Promise<unknown>;
  onStop: () => Promise<unknown>;
  onArchive: () => Promise<unknown>;
}) {
  const { task, agent } = props;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const questionById = new Map(props.questions.map((q) => [q.id, q]));
  const active = isActive(task);
  const name = agent?.name ?? task.agentId;

  useEffect(() => {
    void props.loadMessages(task.id);
  }, [task.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the live text like a terminal, unless you scrolled up to read.
  const lastText = props.messages?.[props.messages.length - 1]?.text;
  useEffect(() => {
    const el = logRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [props.messages?.length, lastText]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e: any) {
      setError(e?.message ?? "Fehler");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text) return;
    if (await run(() => props.onSend(text))) setDraft("");
  };

  return (
    <article
      ref={props.refCb}
      className={`panel task ts-${task.status} ${props.openCount ? "alert" : ""} ${props.expanded ? "expanded" : ""}`}
      aria-label={`${task.title} – ${TASK_LABEL[task.status]}`}
    >
      <header className="panel-head">
        <Avatar agent={agent} />
        <div className="panel-id">
          <div className="panel-title" title={task.title}>
            {task.title}
          </div>
          <div className="panel-sub">
            {name}
            {agent?.role ? `, ${agent.role}` : ""}
          </div>
        </div>
        <span className={`pill ts-${task.status}`}>
          <span className="dot" /> {TASK_LABEL[task.status]}
        </span>
        <button className="icon-btn" onClick={props.onExpand} title={props.expanded ? "Verkleinern" : "Groß anzeigen"}>
          {props.expanded ? "⤡" : "⤢"}
        </button>
        {!active && (
          <button className="icon-btn" onClick={() => run(props.onArchive)} title="Aus der Übersicht entfernen">
            ×
          </button>
        )}
      </header>

      <div className="panel-log" ref={logRef}>
        <blockquote className="brief">
          <div className="brief-label">Auftrag · {time(task.createdAt)}</div>
          {task.instruction}
        </blockquote>
        {(props.messages ?? []).map((m) => {
          const q = m.questionId ? questionById.get(m.questionId) : undefined;
          const isQuestion = !!q && m.from === "agent";
          const open = isQuestion && q!.status === "open";
          return (
            <div key={m.id} className={`entry from-${m.from} ${isQuestion ? "question" : ""} ${open ? "open" : ""}`}>
              {m.from !== "agent" || isQuestion ? (
                <div className="entry-meta">
                  {open ? `❓ ${name} fragt` : m.from === "user" ? "Du" : m.from === "system" ? "System" : `${name} fragte`} · {time(m.createdAt)}
                </div>
              ) : null}
              <div className="entry-text">{m.text}</div>
              {open && q!.options.length > 0 && (
                <div className="options">
                  {q!.options.map((opt) => (
                    <button key={opt} className="btn option" disabled={busy} onClick={() => run(() => props.onAnswer(q!.id, opt))}>
                      {opt}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {task.status === "running" && <span className="cursor" aria-hidden />}
      </div>

      <div className="stepbar">
        <span className={`dot ${task.status === "running" ? "blink" : ""}`} />
        {task.stepCount > 0 && <span className="step-no">Schritt {task.stepCount}</span>}
        <span className="step-text">
          {task.status === "running"
            ? task.currentStep ?? "startet…"
            : task.status === "waiting"
            ? `wartet auf deine Antwort`
            : TASK_LABEL[task.status]}
        </span>
        <span className="step-time">{duration(task, props.nowMs)}</span>
      </div>

      {error && <div className="panel-error">{error}</div>}
      <form
        className="panel-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <textarea
          rows={1}
          value={draft}
          placeholder={
            props.openCount === 1
              ? `Antwort an ${name} … (Enter sendet)`
              : active
              ? `Ergänzung für ${name} … (Enter sendet, Shift+Enter neue Zeile)`
              : `Weiterer Auftrag für ${name} … (Enter sendet)`
          }
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        {draft.trim() || !active ? (
          <button type="submit" className="btn primary" disabled={busy || !draft.trim()}>
            Los
          </button>
        ) : (
          <button type="button" className="btn" disabled={busy} onClick={() => run(props.onStop)}>
            Stopp
          </button>
        )}
      </form>
    </article>
  );
}
