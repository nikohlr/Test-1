import { env } from "../config/env";
import { logger } from "../lib/logger";
import type { AgentStore } from "./agentStore";
import type { Agent, AgentTask } from "./types";

export type DeliveryKind = "task" | "message" | "answer" | "stop";

/**
 * Delivers what you do in the terminal to the actual agent.
 *
 * - Agent has a webhookUrl (n8n workflow, own agent server, ...): we POST it
 *   there. The agent reports back via POST /api/agents/inbound (or answers
 *   synchronously by returning { reply } in the HTTP response).
 * - No webhookUrl: the demo simulation plays the agent.
 */
export async function deliverToAgent(
  store: AgentStore,
  agent: Agent,
  task: AgentTask,
  kind: DeliveryKind,
  text: string,
  questionId?: string
) {
  if (!agent.webhookUrl) {
    demoReply(store, task, kind, text);
    return;
  }

  try {
    const res = await fetch(agent.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.agents.outboundToken ? { Authorization: `Bearer ${env.agents.outboundToken}` } : {}),
      },
      body: JSON.stringify({
        agentId: agent.id,
        taskId: task.id,
        kind,
        text,
        instruction: task.instruction,
        questionId: questionId ?? null,
        replyUrl: `${env.appBaseUrl}/api/agents/inbound`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json().catch(() => null)) as { reply?: unknown } | null;
    if (body && typeof body.reply === "string" && body.reply.trim()) {
      store.addMessage(task.id, "agent", body.reply);
    }
  } catch (err: any) {
    logger.warn({ agentId: agent.id, taskId: task.id, err: err?.message }, "Zustellung an Agent fehlgeschlagen");
    store.addMessage(task.id, "system", `Zustellung an ${agent.name} fehlgeschlagen (${err?.message ?? "unbekannter Fehler"}).`);
    if (kind === "task") store.updateTask(task.id, { status: "failed" });
  }
}

function demoReply(store: AgentStore, task: AgentTask, kind: DeliveryKind, text: string) {
  if (kind === "task" || kind === "stop") return; // the simulation picks new tasks up by itself
  setTimeout(() => {
    if (!store.getTask(task.id)) return;
    if (kind === "answer") {
      store.addMessage(task.id, "agent", `Danke, ist notiert: „${text}". Ich mache weiter.`);
    } else {
      store.addMessage(task.id, "agent", "Alles klar, ich baue das ein. (Demo-Antwort, hinterlege eine webhookUrl für echte Antworten.)");
      const current = store.getTask(task.id);
      if (current && current.status !== "running" && current.status !== "waiting") store.updateTask(task.id, { status: "running" });
    }
  }, 700 + Math.random() * 900).unref?.();
}
