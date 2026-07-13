import { randomUUID } from "crypto";

interface PendingAction {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  preview: string;
  createdAt: number;
}

const PENDING_TTL_MS = 15 * 60_000;
const store = new Map<string, PendingAction>();

// Ephemeral, single-process store for tool calls that must not execute until
// a human clicks "confirm" in the UI (sendWhatsAppMessage, and any future
// write with a real customer-facing effect). Not durable by design: an
// unconfirmed action should simply expire, not survive a restart.
export function createPendingAction(toolName: string, args: Record<string, unknown>, preview: string): PendingAction {
  const action: PendingAction = { id: randomUUID(), toolName, args, preview, createdAt: Date.now() };
  store.set(action.id, action);
  return action;
}

export function getPendingAction(id: string): PendingAction | undefined {
  const action = store.get(id);
  if (action && Date.now() - action.createdAt > PENDING_TTL_MS) {
    store.delete(id);
    return undefined;
  }
  return action;
}

export function consumePendingAction(id: string): PendingAction | undefined {
  const action = getPendingAction(id);
  if (action) store.delete(id);
  return action;
}
