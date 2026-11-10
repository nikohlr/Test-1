import { Router, type NextFunction, type Request, type Response } from "express";
import { timingSafeEqual } from "crypto";
import { z, ZodError } from "zod";
import { env, isAgentsDemoMode } from "../config/env";
import { getAgentStore } from "../agents";
import { AgentStoreError } from "../agents/agentStore";
import { deliverToAgent } from "../agents/agentGateway";
import type { AgentEvent, AgentSnapshot } from "../agents/types";

export const agentsRouter = Router();

const statusEnum = z.enum(["idle", "working", "waiting", "error", "offline"]);

// --- Terminal (browser) endpoints ------------------------------------------

agentsRouter.get("/", (_req, res) => {
  const store = getAgentStore();
  const snapshot: AgentSnapshot = {
    agents: store.listAgents(),
    questions: store.listQuestions(),
    activity: store.listActivity().slice(-80),
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

agentsRouter.get("/:agentId/messages", (req, res) => {
  const store = getAgentStore();
  if (!store.getAgent(req.params.agentId)) return res.status(404).json({ error: "Agent nicht gefunden" });
  res.json(store.listMessages(req.params.agentId));
});

agentsRouter.post("/:agentId/messages", (req, res) => {
  const { text } = z.object({ text: z.string().trim().min(1).max(8000) }).parse(req.body);
  const store = getAgentStore();
  const agent = store.getAgent(req.params.agentId);
  if (!agent) return res.status(404).json({ error: "Agent nicht gefunden" });
  const message = store.addMessage(agent.id, "user", text);
  void deliverToAgent(store, agent, text, "message");
  res.status(201).json(message);
});

agentsRouter.post("/questions/:questionId/answer", (req, res) => {
  const { answer } = z.object({ answer: z.string().trim().min(1).max(4000) }).parse(req.body);
  const store = getAgentStore();
  const question = store.answerQuestion(req.params.questionId, answer);
  const agent = store.getAgent(question.agentId)!;
  void deliverToAgent(store, agent, answer, "answer", question.id);
  res.json(question);
});

// --- Inbound endpoint for the real agents ------------------------------------
// One endpoint, several event types, so an n8n workflow or any script can
// report with a single HTTP request node.

const inboundSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("register"),
    agentId: z.string().min(1),
    name: z.string().min(1),
    role: z.string().optional(),
    isLead: z.boolean().optional(),
    webhookUrl: z.string().url().nullable().optional(),
  }),
  z.object({
    type: z.literal("status"),
    agentId: z.string().min(1),
    status: statusEnum,
    currentTask: z.string().nullable().optional(),
    progress: z.number().min(0).max(100).nullable().optional(),
  }),
  z.object({
    type: z.literal("activity"),
    agentId: z.string().min(1),
    text: z.string().min(1),
    level: z.enum(["info", "success", "warn", "error"]).optional(),
  }),
  z.object({ type: z.literal("message"), agentId: z.string().min(1), text: z.string().min(1) }),
  z.object({
    type: z.literal("question"),
    agentId: z.string().min(1),
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
  switch (event.type) {
    case "register":
      return res.json(store.upsertAgent({ id: event.agentId, name: event.name, role: event.role, isLead: event.isLead, webhookUrl: event.webhookUrl }));
    case "status":
      return res.json(store.setStatus(event.agentId, event.status, event.currentTask, event.progress));
    case "activity":
      return res.json(store.addActivity(event.agentId, event.text, event.level));
    case "message":
      return res.json(store.addMessage(event.agentId, "agent", event.text));
    case "question":
      return res.json(store.askQuestion(event.agentId, event.text, event.options));
  }
});

// Local error mapping so validation/store errors become 4xx instead of 500.
agentsRouter.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: "Ungültige Eingabe", details: err.issues });
  if (err instanceof AgentStoreError) return res.status(err.status).json({ error: err.message });
  next(err);
});
