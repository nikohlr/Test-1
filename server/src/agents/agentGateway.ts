import { env } from "../config/env";
import { logger } from "../lib/logger";
import type { AgentStore } from "./agentStore";
import type { Agent } from "./types";

/**
 * Delivers what you type in the terminal to the actual agent.
 *
 * - Agent has a webhookUrl (n8n workflow, own agent server, ...): we POST the
 *   message there. The agent answers asynchronously via POST /api/agents/inbound
 *   (or synchronously by returning { reply } in the HTTP response).
 * - No webhookUrl: the demo responder answers so the terminal stays usable.
 */
export async function deliverToAgent(store: AgentStore, agent: Agent, text: string, kind: "message" | "answer", questionId?: string) {
  if (!agent.webhookUrl) {
    demoReply(store, agent, text, kind);
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
        kind,
        text,
        questionId: questionId ?? null,
        replyUrl: `${env.appBaseUrl}/api/agents/inbound`,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json().catch(() => null)) as { reply?: unknown } | null;
    if (body && typeof body.reply === "string" && body.reply.trim()) {
      store.addMessage(agent.id, "agent", body.reply);
    }
  } catch (err: any) {
    logger.warn({ agentId: agent.id, err: err?.message }, "Nachricht an Agent konnte nicht zugestellt werden");
    store.addMessage(agent.id, "system", `Zustellung an ${agent.name} fehlgeschlagen (${err?.message ?? "unbekannter Fehler"}).`);
    store.addActivity(agent.id, "Nachricht nicht zugestellt", "error");
  }
}

function demoReply(store: AgentStore, agent: Agent, text: string, kind: "message" | "answer") {
  const delay = 700 + Math.random() * 900;
  setTimeout(() => {
    if (!store.getAgent(agent.id)) return;
    if (kind === "answer") {
      store.addMessage(agent.id, "agent", `Danke, ist notiert: „${text}". Ich mache damit weiter.`);
      store.addActivity(agent.id, `Antwort erhalten → arbeite weiter`, "success");
      return;
    }
    const reply = agent.isLead
      ? `Verstanden. Ich verteile das ans Team und melde mich, sobald es Ergebnisse gibt. (Demo-Antwort – hinterlege eine webhookUrl, damit ich wirklich antworte.)`
      : `Alles klar, ich kümmere mich darum. (Demo-Antwort – hinterlege eine webhookUrl für ${agent.name}.)`;
    store.addMessage(agent.id, "agent", reply);
    store.setStatus(agent.id, "working", text.length > 70 ? `${text.slice(0, 70)}…` : text, 5);
    store.addActivity(agent.id, `Neuer Auftrag von dir übernommen`);
  }, delay).unref?.();
}
