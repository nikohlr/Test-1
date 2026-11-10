import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Agent, AgentEvent, AgentMessage, AgentQuestion, AgentTask, TaskStatus } from "./types";

const MAX_TASKS = 300;
const MAX_MESSAGES_PER_TASK = 200;

interface PersistedState {
  agents: Agent[];
  tasks: AgentTask[];
  messages: AgentMessage[];
  questions: AgentQuestion[];
}

const now = () => new Date().toISOString();
const shorten = (text: string, max = 80) => {
  const line = text.trim().split("\n")[0];
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

/**
 * In-memory store with JSON persistence. Every mutation emits an AgentEvent so
 * all connected terminals update instantly. Kept separate from Prisma on
 * purpose: this is high-frequency agent telemetry that can move to the DB later
 * without touching routes or UI.
 */
export class AgentStore extends EventEmitter {
  private agents = new Map<string, Agent>();
  private tasks: AgentTask[] = [];
  private messages: AgentMessage[] = [];
  private questions: AgentQuestion[] = [];
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

  listTasks(includeArchived = false): AgentTask[] {
    return this.tasks.filter((t) => includeArchived || !t.archived);
  }

  getTask(id: string): AgentTask | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  listMessages(taskId: string): AgentMessage[] {
    return this.messages.filter((m) => m.taskId === taskId);
  }

  listQuestions(): AgentQuestion[] {
    return [...this.questions];
  }

  openQuestions(filter: { agentId?: string; taskId?: string } = {}): AgentQuestion[] {
    return this.questions.filter(
      (q) => q.status === "open" && (!filter.agentId || q.agentId === filter.agentId) && (!filter.taskId || q.taskId === filter.taskId)
    );
  }

  // --- agents --------------------------------------------------------------

  upsertAgent(input: Partial<Agent> & { id: string }): Agent {
    const existing = this.agents.get(input.id);
    const agent: Agent = {
      id: input.id,
      name: input.name ?? existing?.name ?? input.id,
      role: input.role ?? existing?.role ?? "",
      isLead: input.isLead ?? existing?.isLead ?? false,
      status: input.status ?? existing?.status ?? "idle",
      currentTask: input.currentTask !== undefined ? input.currentTask : existing?.currentTask ?? null,
      webhookUrl: input.webhookUrl !== undefined ? input.webhookUrl : existing?.webhookUrl ?? null,
      avatarUrl: input.avatarUrl !== undefined ? input.avatarUrl : existing?.avatarUrl ?? null,
      lastActivityAt: now(),
    };
    // An agent with an open question is always "waiting" until it is answered.
    if (this.openQuestions({ agentId: agent.id }).length > 0 && agent.status !== "error") agent.status = "waiting";
    this.agents.set(agent.id, agent);
    this.emitEvent({ type: "agent", agent });
    return agent;
  }

  removeAgent(id: string) {
    if (!this.agents.delete(id)) return;
    this.tasks = this.tasks.filter((t) => t.agentId !== id);
    this.messages = this.messages.filter((m) => m.agentId !== id);
    this.questions = this.questions.filter((q) => q.agentId !== id);
    this.emitEvent({ type: "agentRemoved", agentId: id });
  }

  setAgentStatus(agentId: string, status: Agent["status"], currentTask?: string | null) {
    this.requireAgent(agentId);
    return this.upsertAgent({ id: agentId, status, currentTask });
  }

  // --- tasks ---------------------------------------------------------------

  createTask(agentId: string, instruction: string, opts: { id?: string; title?: string } = {}): AgentTask {
    this.requireAgent(agentId);
    const task: AgentTask = {
      id: opts.id ?? randomUUID(),
      agentId,
      title: opts.title?.trim() || shorten(instruction, 70),
      instruction,
      status: "running",
      stepCount: 0,
      currentStep: null,
      archived: false,
      createdAt: now(),
      updatedAt: now(),
      finishedAt: null,
    };
    this.tasks.push(task);
    if (this.tasks.length > MAX_TASKS) this.dropOldestFinishedTask();
    this.emitEvent({ type: "task", task });
    this.syncAgentFromTasks(agentId);
    return task;
  }

  updateTask(taskId: string, patch: { title?: string; status?: TaskStatus; step?: string; archived?: boolean }): AgentTask {
    const task = this.requireTask(taskId);
    if (patch.title) task.title = patch.title;
    if (patch.archived !== undefined) task.archived = patch.archived;
    if (patch.step) {
      task.stepCount += 1;
      task.currentStep = patch.step;
    }
    if (patch.status) {
      let status = patch.status;
      // Open questions keep the task "waiting" unless it is explicitly ended.
      if (status === "running" && this.openQuestions({ taskId }).length > 0) status = "waiting";
      task.status = status;
      const finished = status === "done" || status === "stopped" || status === "failed";
      task.finishedAt = finished ? task.finishedAt ?? now() : null;
      if (finished) {
        task.currentStep = null;
        // A finished task cannot wait for an answer anymore.
        for (const q of this.openQuestions({ taskId })) {
          q.status = "answered";
          q.answer = null;
          q.answeredAt = now();
          this.emitEvent({ type: "question", question: q });
        }
      }
    }
    task.updatedAt = now();
    this.emitEvent({ type: "task", task });
    this.syncAgentFromTasks(task.agentId);
    return task;
  }

  /** Most recent unfinished task of an agent, used when an agent reports without a taskId. */
  latestActiveTask(agentId: string): AgentTask | undefined {
    return [...this.tasks].reverse().find((t) => t.agentId === agentId && (t.status === "running" || t.status === "waiting"));
  }

  // --- messages & questions ----------------------------------------------

  addMessage(taskId: string, from: AgentMessage["from"], text: string, opts: { questionId?: string; append?: boolean } = {}): AgentMessage {
    const task = this.requireTask(taskId);
    const forTask = this.messages.filter((m) => m.taskId === taskId);
    const last = forTask[forTask.length - 1];

    // Streaming progress: glue text onto the agent's last message instead of creating a new bubble.
    if (opts.append && last && last.from === from && from === "agent" && !last.questionId) {
      last.text = `${last.text}${/[\s\n]$/.test(last.text) ? "" : " "}${text}`;
      this.touchTask(task);
      this.emitEvent({ type: "message", message: last });
      return last;
    }

    const message: AgentMessage = { id: randomUUID(), agentId: task.agentId, taskId, from, text, createdAt: now(), questionId: opts.questionId };
    this.messages.push(message);
    if (forTask.length + 1 > MAX_MESSAGES_PER_TASK) {
      const dropId = forTask[0].id;
      this.messages = this.messages.filter((m) => m.id !== dropId);
    }
    this.touchTask(task);
    this.emitEvent({ type: "message", message });
    return message;
  }

  askQuestion(taskId: string, text: string, options: string[] = []): AgentQuestion {
    const task = this.requireTask(taskId);
    const question: AgentQuestion = {
      id: randomUUID(),
      agentId: task.agentId,
      taskId,
      text,
      options,
      status: "open",
      answer: null,
      createdAt: now(),
      answeredAt: null,
    };
    this.questions.push(question);
    this.emitEvent({ type: "question", question });
    this.addMessage(taskId, "agent", text, { questionId: question.id });
    this.updateTask(taskId, { status: "waiting" });
    return question;
  }

  answerQuestion(questionId: string, answer: string): AgentQuestion {
    const question = this.questions.find((q) => q.id === questionId);
    if (!question) throw new AgentStoreError(404, "Frage nicht gefunden");
    if (question.status === "answered") throw new AgentStoreError(409, "Frage wurde bereits beantwortet");
    question.status = "answered";
    question.answer = answer;
    question.answeredAt = now();
    this.emitEvent({ type: "question", question });
    this.addMessage(question.taskId, "user", answer, { questionId: question.id });
    if (this.openQuestions({ taskId: question.taskId }).length === 0) {
      this.updateTask(question.taskId, { status: "running" });
    }
    return question;
  }

  // --- internals -----------------------------------------------------------

  private syncAgentFromTasks(agentId: string) {
    const agent = this.agents.get(agentId);
    if (!agent || agent.status === "offline" || agent.status === "error") return;
    const active = this.tasks.filter((t) => t.agentId === agentId && (t.status === "running" || t.status === "waiting"));
    const waiting = active.some((t) => t.status === "waiting");
    const status = waiting ? "waiting" : active.length ? "working" : "idle";
    const currentTask = active.length ? active[active.length - 1].title : null;
    if (agent.status !== status || agent.currentTask !== currentTask) this.upsertAgent({ id: agentId, status, currentTask });
  }

  private dropOldestFinishedTask() {
    const victim = this.tasks.find((t) => t.status !== "running" && t.status !== "waiting");
    if (!victim) return;
    this.tasks = this.tasks.filter((t) => t.id !== victim.id);
    this.messages = this.messages.filter((m) => m.taskId !== victim.id);
    this.questions = this.questions.filter((q) => q.taskId !== victim.id);
  }

  private requireAgent(id: string): Agent {
    const agent = this.agents.get(id);
    if (!agent) throw new AgentStoreError(404, `Agent "${id}" nicht gefunden`);
    return agent;
  }

  private requireTask(id: string): AgentTask {
    const task = this.getTask(id);
    if (!task) throw new AgentStoreError(404, "Auftrag nicht gefunden");
    return task;
  }

  private touchTask(task: AgentTask) {
    task.updatedAt = now();
    const agent = this.agents.get(task.agentId);
    if (agent) agent.lastActivityAt = task.updatedAt;
  }

  private emitEvent(event: AgentEvent) {
    this.emit("event", event);
    this.scheduleSave();
  }

  private load() {
    if (!this.persistFile || !fs.existsSync(this.persistFile)) return;
    try {
      const state = JSON.parse(fs.readFileSync(this.persistFile, "utf8")) as PersistedState;
      (state.agents ?? []).forEach((a) => this.agents.set(a.id, a));
      this.tasks = state.tasks ?? [];
      this.messages = (state.messages ?? []).filter((m) => m.taskId);
      this.questions = (state.questions ?? []).filter((q) => q.taskId);
    } catch {
      // Corrupt or outdated state file: start fresh rather than refusing to boot.
    }
  }

  private scheduleSave() {
    if (!this.persistFile || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const state: PersistedState = {
        agents: [...this.agents.values()],
        tasks: this.tasks,
        messages: this.messages,
        questions: this.questions,
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
