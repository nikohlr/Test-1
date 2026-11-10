import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ActivityEntry, Agent, AgentEvent, AgentMessage, AgentQuestion, AgentStatus } from "./types";

const MAX_MESSAGES_PER_AGENT = 300;
const MAX_ACTIVITY = 200;

interface PersistedState {
  agents: Agent[];
  messages: AgentMessage[];
  questions: AgentQuestion[];
  activity: ActivityEntry[];
}

/**
 * Small in-memory store with optional JSON persistence. Every mutation emits an
 * AgentEvent so all connected terminals update instantly. Kept separate from
 * Prisma on purpose: agent state is high-frequency, short-lived telemetry and
 * can be moved to the database later without touching routes or UI.
 */
export class AgentStore extends EventEmitter {
  private agents = new Map<string, Agent>();
  private messages: AgentMessage[] = [];
  private questions: AgentQuestion[] = [];
  private activity: ActivityEntry[] = [];
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(private readonly persistFile: string | null = null) {
    super();
    this.setMaxListeners(0); // one listener per connected device
    this.load();
  }

  // --- reads ---------------------------------------------------------------

  listAgents(): Agent[] {
    return [...this.agents.values()].sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name));
  }

  getAgent(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  listMessages(agentId: string): AgentMessage[] {
    return this.messages.filter((m) => m.agentId === agentId);
  }

  listQuestions(): AgentQuestion[] {
    return [...this.questions];
  }

  openQuestions(agentId?: string): AgentQuestion[] {
    return this.questions.filter((q) => q.status === "open" && (!agentId || q.agentId === agentId));
  }

  listActivity(): ActivityEntry[] {
    return [...this.activity];
  }

  // --- writes --------------------------------------------------------------

  upsertAgent(input: Partial<Agent> & { id: string; name?: string }): Agent {
    const existing = this.agents.get(input.id);
    const agent: Agent = {
      id: input.id,
      name: input.name ?? existing?.name ?? input.id,
      role: input.role ?? existing?.role ?? "",
      isLead: input.isLead ?? existing?.isLead ?? false,
      status: input.status ?? existing?.status ?? "idle",
      currentTask: input.currentTask !== undefined ? input.currentTask : existing?.currentTask ?? null,
      progress: input.progress !== undefined ? input.progress : existing?.progress ?? null,
      webhookUrl: input.webhookUrl !== undefined ? input.webhookUrl : existing?.webhookUrl ?? null,
      lastActivityAt: new Date().toISOString(),
    };
    // An agent with an open question is always "waiting" (red glow) until it is answered.
    if (this.openQuestions(agent.id).length > 0 && agent.status !== "error") agent.status = "waiting";
    this.agents.set(agent.id, agent);
    this.emitEvent({ type: "agent", agent });
    return agent;
  }

  removeAgent(id: string) {
    if (!this.agents.delete(id)) return;
    this.messages = this.messages.filter((m) => m.agentId !== id);
    this.questions = this.questions.filter((q) => q.agentId !== id);
    this.emitEvent({ type: "agentRemoved", agentId: id });
  }

  setStatus(agentId: string, status: AgentStatus, currentTask?: string | null, progress?: number | null) {
    this.requireAgent(agentId);
    return this.upsertAgent({ id: agentId, status, currentTask, progress });
  }

  addMessage(agentId: string, from: AgentMessage["from"], text: string, questionId?: string): AgentMessage {
    this.requireAgent(agentId);
    const message: AgentMessage = { id: randomUUID(), agentId, from, text, createdAt: new Date().toISOString(), questionId };
    this.messages.push(message);
    const forAgent = this.messages.filter((m) => m.agentId === agentId);
    if (forAgent.length > MAX_MESSAGES_PER_AGENT) {
      const drop = new Set(forAgent.slice(0, forAgent.length - MAX_MESSAGES_PER_AGENT).map((m) => m.id));
      this.messages = this.messages.filter((m) => !drop.has(m.id));
    }
    this.touch(agentId);
    this.emitEvent({ type: "message", message });
    return message;
  }

  addActivity(agentId: string, text: string, level: ActivityEntry["level"] = "info"): ActivityEntry {
    this.requireAgent(agentId);
    const entry: ActivityEntry = { id: randomUUID(), agentId, text, level, createdAt: new Date().toISOString() };
    this.activity.push(entry);
    if (this.activity.length > MAX_ACTIVITY) this.activity = this.activity.slice(-MAX_ACTIVITY);
    this.touch(agentId);
    this.emitEvent({ type: "activity", entry });
    return entry;
  }

  askQuestion(agentId: string, text: string, options: string[] = []): AgentQuestion {
    this.requireAgent(agentId);
    const question: AgentQuestion = {
      id: randomUUID(),
      agentId,
      text,
      options,
      status: "open",
      answer: null,
      createdAt: new Date().toISOString(),
      answeredAt: null,
    };
    this.questions.push(question);
    this.emitEvent({ type: "question", question });
    this.addMessage(agentId, "agent", text, question.id);
    this.upsertAgent({ id: agentId, status: "waiting" });
    return question;
  }

  answerQuestion(questionId: string, answer: string): AgentQuestion {
    const question = this.questions.find((q) => q.id === questionId);
    if (!question) throw new AgentStoreError(404, "Frage nicht gefunden");
    if (question.status === "answered") throw new AgentStoreError(409, "Frage wurde bereits beantwortet");
    question.status = "answered";
    question.answer = answer;
    question.answeredAt = new Date().toISOString();
    this.emitEvent({ type: "question", question });
    this.addMessage(question.agentId, "user", answer, question.id);
    if (this.openQuestions(question.agentId).length === 0) {
      const agent = this.requireAgent(question.agentId);
      if (agent.status === "waiting") this.upsertAgent({ id: agent.id, status: "working" });
    }
    return question;
  }

  // --- internals -----------------------------------------------------------

  private requireAgent(id: string): Agent {
    const agent = this.agents.get(id);
    if (!agent) throw new AgentStoreError(404, `Agent "${id}" nicht gefunden`);
    return agent;
  }

  private touch(agentId: string) {
    const agent = this.agents.get(agentId);
    if (agent) agent.lastActivityAt = new Date().toISOString();
  }

  private emitEvent(event: AgentEvent) {
    this.emit("event", event);
    this.scheduleSave();
  }

  private load() {
    if (!this.persistFile || !fs.existsSync(this.persistFile)) return;
    try {
      const state = JSON.parse(fs.readFileSync(this.persistFile, "utf8")) as PersistedState;
      state.agents.forEach((a) => this.agents.set(a.id, a));
      this.messages = state.messages ?? [];
      this.questions = state.questions ?? [];
      this.activity = state.activity ?? [];
    } catch {
      // Corrupt state file: start fresh rather than refusing to boot.
    }
  }

  private scheduleSave() {
    if (!this.persistFile || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const state: PersistedState = {
        agents: [...this.agents.values()],
        messages: this.messages,
        questions: this.questions,
        activity: this.activity,
      };
      fs.mkdirSync(path.dirname(this.persistFile!), { recursive: true });
      fs.writeFile(this.persistFile!, JSON.stringify(state), () => undefined);
    }, 500);
    this.saveTimer.unref?.();
  }
}

export class AgentStoreError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}
