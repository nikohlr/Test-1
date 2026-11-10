import { describe, expect, it } from "vitest";
import { AgentStore } from "../agentStore";
import type { AgentEvent } from "../types";

function storeWithAgent() {
  const store = new AgentStore(null);
  store.upsertAgent({ id: "samantha", name: "Samantha", isLead: true, status: "working" });
  return store;
}

describe("AgentStore", () => {
  it("marks an agent as waiting while it has an open question", () => {
    const store = storeWithAgent();
    store.askQuestion("samantha", "Angebot heute senden?", ["Ja", "Nein"]);
    expect(store.getAgent("samantha")!.status).toBe("waiting");
    // A status update from the agent must not hide the open question.
    store.setStatus("samantha", "working", "etwas anderes");
    expect(store.getAgent("samantha")!.status).toBe("waiting");
  });

  it("returns to working once all questions are answered", () => {
    const store = storeWithAgent();
    const q1 = store.askQuestion("samantha", "Frage 1");
    const q2 = store.askQuestion("samantha", "Frage 2");
    store.answerQuestion(q1.id, "Ja");
    expect(store.getAgent("samantha")!.status).toBe("waiting");
    store.answerQuestion(q2.id, "Nein");
    expect(store.getAgent("samantha")!.status).toBe("working");
    expect(store.openQuestions()).toHaveLength(0);
  });

  it("rejects answering the same question twice", () => {
    const store = storeWithAgent();
    const q = store.askQuestion("samantha", "Frage");
    store.answerQuestion(q.id, "Ja");
    expect(() => store.answerQuestion(q.id, "Nein")).toThrow(/bereits/);
  });

  it("emits live events for every connected terminal", () => {
    const store = storeWithAgent();
    const events: AgentEvent[] = [];
    store.on("event", (e) => events.push(e));
    store.addMessage("samantha", "user", "Hallo");
    store.addActivity("samantha", "Plant den Tag");
    expect(events.map((e) => e.type)).toEqual(["message", "activity"]);
  });

  it("refuses events for unknown agents", () => {
    const store = new AgentStore(null);
    expect(() => store.addMessage("nobody", "user", "x")).toThrow(/nicht gefunden/);
  });
});
