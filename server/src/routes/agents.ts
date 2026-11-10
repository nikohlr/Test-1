import { Router, type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "crypto";
import { z, ZodError } from "zod";
import { env, isAgentsDemoMode } from "../config/env";
import { getAgentStore } from "../agents";
import { AgentStoreError } from "../agents/agentStore";
import { deliverToAgent } from "../agents/agentGateway";
import type { AgentEvent, AgentSnapshot } from "../agents/types";

export const agentsRouter = Router();

// --- Terminal (browser) endpoints ------------------------------------------

agentsRouter.get("/", (_req, res) => {
  const store = getAgentStore();
  const snapshot: AgentSnapshot = {
    agents: store.listAgents(),
    tasks: store.listTasks(),
    questions: store.listQuestions(),
    demoMode: isAgentsDemoMode(),
  };
  res.json(snapshot);
});

// Live updates for every open terminal (laptop, PC, phone) via Server-Sent Events.
agentsRouter.get("/stream", (req, res) => {
  const store = getAgentStore();
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write("retry: 3000\n\n");

  const onEvent = (event: AgentEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const heartbeat = setInterval(() => res.write(": ping\n\n"), 25_000);
  store.on("event", onEvent);
  req.on("close", () => {
    clearInterval(heartbeat);
    store.off("event", onEvent);
  });
});

const textSchema = z.object({ text: z.string().trim().min(1).max(8000) });

// New Auftrag for an agent.
agentsRouter.post("/:agentId/tasks", (req, res) => {
  const { text } = textSchema.parse(req.body);
  const store = getAgentStore();
  const agent = store.getAgent(req.params.agentId);
  if (!agent) return res.status(404).json({ error: "Agent nicht gefunden" });
  const task = store.createTask(agent.id, text);
  void deliverToAgent(store, agent, task, "task", text);
  res.status(201).json(task);
});

agentsRouter.get("/tasks/:taskId/messages", (req, res) => {
  const store = getAgentStore();
  if (!store.getTask(req.params.taskId)) return res.status(404).json({ error: "Auftrag nicht gefunden" });
  res.json(store.listMessages(req.params.taskId));
});

// Follow-up inside a task. If exactly one question is open, the text answers it.
agentsRouter.post("/tasks/:taskId/messages", (req, res) => {
  const { text } = textSchema.parse(req.body);
  const store = getAgentStore();
  const task = store.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: "Auftrag nicht gefunden" });
  const agent = store.getAgent(task.agentId)!;
  const open = store.openQuestions({ taskId: task.id });
  if (open.length === 1) {
    store.answerQuestion(open[0].id, text);
    void deliverToAgent(store, agent, task, "answer", text, open[0].id);
    return res.status(201).json({ answered: open[0].id });
  }
  const message = store.addMessage(task.id, "user", text);
  if (task.status !== "running" && task.status !== "waiting") store.updateTask(task.id, { status: "running" });
  void deliverToAgent(store, agent, task, "message", text);
  res.status(201).json(message);
});

agentsRouter.post("/questions/:questionId/answer", (req, res) => {
  const { answer } = z.object({ answer: z.string().trim().min(1).max(4000) }).parse(req.body);
  const store = getAgentStore();
  const question = store.answerQuestion(req.params.questionId, answer);
  const task = store.getTask(question.taskId)!;
  void deliverToAgent(store, store.getAgent(question.agentId)!, task, "answer", answer, question.id);
  res.json(question);
});

agentsRouter.post("/tasks/:taskId/stop", (req, res) => {
  const store = getAgentStore();
  const task = store.getTask(req.params.taskId);
  if (!task) return res.status(404).json({ error: "Auftrag nicht gefunden" });
  const updated = store.updateTask(task.id, { status: "stopped" });
  store.addMessage(task.id, "system", "Von dir gestoppt.");
  void deliverToAgent(store, store.getAgent(task.agentId)!, task, "stop", "stop");
  res.json(updated);
});

agentsRouter.post("/tasks/:taskId/archive", (req, res) => {
  const store = getAgentStore();
  res.json(store.updateTask(req.params.taskId, { archived: true }));
});

// --- Inbound endpoint for the real agents ------------------------------------
// One endpoint, several event types, so an n8n workflow or any script can
// report with a single HTTP request node.

const id = z.string().min(1);
const inboundSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("register"),
    agentId: id,
    name: z.string().min(1),
    role: z.string().optional(),
    isLead: z.boolean().optional(),
    webhookUrl: z.string().url().nullable().optional(),
    avatarUrl: z.string().url().nullable().optional(),
  }),
  z.object({ type: z.literal("status"), agentId: id, status: z.enum(["idle", "working", "waiting", "error", "offline"]) }),
  z.object({
    type: z.literal("task"),
    agentId: id,
    taskId: id.optional(),
    title: z.string().optional(),
    instruction: z.string().optional(),
    status: z.enum(["running", "waiting", "done", "stopped", "failed"]).optional(),
  }),
  z.object({ type: z.literal("step"), agentId: id, taskId: id.optional(), text: z.string().min(1) }),
  z.object({ type: z.literal("progress"), agentId: id, taskId: id.optional(), text: z.string().min(1) }),
  z.object({ type: z.literal("message"), agentId: id, taskId: id.optional(), text: z.string().min(1) }),
  z.object({
    type: z.literal("question"),
    agentId: id,
    taskId: id.optional(),
    text: z.string().min(1),
    options: z.array(z.string()).max(6).optional(),
  }),
]);

function requireInboundToken(req: Request, res: Response, next: NextFunction) {
  const expected = env.agents.inboundToken;
  if (!expected) {
    // Demo mode: allow local testing without a token, but only from this machine.
    const ip = req.socket.remoteAddress ?? "";
    if (["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(ip)) return next();
    return res.status(403).json({ error: "AGENTS_INBOUND_TOKEN ist nicht gesetzt" });
  }
  const given = (req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: "Ungültiges Token" });
  next();
}

agentsRouter.post("/inbound", requireInboundToken, (req, res) => {
  const event = inboundSchema.parse(req.body);
  const store = getAgentStore();

  if (event.type === "register") {
    const { agentId, type: _t, ...rest } = event;
    return res.json(store.upsertAgent({ id: agentId, ...rest }));
  }
  if (!store.getAgent(event.agentId)) throw new AgentStoreError(404, `Agent "${event.agentId}" nicht gefunden – erst "register" senden`);
  if (event.type === "status") return res.json(store.setAgentStatus(event.agentId, event.status));

  if (event.type === "task") {
    const existing = event.taskId ? store.getTask(event.taskId) : undefined;
    if (!existing) {
      const task = store.createTask(event.agentId, event.instruction ?? event.title ?? "Auftrag", { id: event.taskId, title: event.title });
      return res.json(event.status && event.status !== "running" ? store.updateTask(task.id, { status: event.status }) : task);
    }
    return res.json(store.updateTask(existing.id, { title: event.title, status: event.status }));
  }

  // step / progress / message / question: fall back to the agent's latest active task, or open a new one.
  const task =
    (event.taskId && store.getTask(event.taskId)) ||
    store.latestActiveTask(event.agentId) ||
    store.createTask(event.agentId, event.type === "question" ? "Rückfrage" : "Meldung", { id: event.taskId });

  switch (event.type) {
    case "step":
      return res.json(store.updateTask(task.id, { step: event.text }));
    case "progress":
      return res.json(store.addMessage(task.id, "agent", event.text, { append: true }));
    case "message":
      return res.json(store.addMessage(task.id, "agent", event.text));
    case "question":
      return res.json(store.askQuestion(task.id, event.text, event.options));
  }
});

// Local error mapping so validation/store errors become 4xx instead of 500.
agentsRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: "Ungültige Eingabe", details: err.issues });
  if (err instanceof AgentStoreError) return res.status(err.status).json({ error: err.message });
  next(err);
});
