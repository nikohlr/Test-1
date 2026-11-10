import path from "path";
import { env, isAgentsDemoMode } from "../config/env";
import { logger } from "../lib/logger";
import { AgentStore } from "./agentStore";
import { startDemoSimulation } from "./demoSimulation";

let store: AgentStore | null = null;

export function getAgentStore(): AgentStore {
  if (!store) {
    store = new AgentStore(path.join(process.cwd(), "storage", "agents", "state.json"));
    for (const agent of env.agents.registry) {
      store.upsertAgent(agent);
    }
    if (isAgentsDemoMode()) {
      startDemoSimulation(store);
      logger.warn("Agenten-Terminal läuft im DEMO-MODUS (simulierte Agenten, AGENTS_INBOUND_TOKEN nicht gesetzt)");
    }
  }
  return store;
}
