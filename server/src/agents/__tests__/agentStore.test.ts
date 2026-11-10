import { describe, expect, it } from "vitest";
import { AgentStore } from "../agentStore";
import type { AgentEvent } from "../types";

function setup() {
  const store = new AgentStore(null);
  store.upsertAgent({ id: "max", name: "Max" });
  const task = store.createTask("max", "Erstelle zwei Entwürfe für eine Insta-Story");
  return { store, task };
}

describe("AgentStore tasks", () => {
  it("creates a running task and marks the agent as working", () => {
    const { store, task } = setup();
    expect(task.status).toBe("running");
    expect(task.title).toBe("Erstelle zwei Entwürfe für eine Insta-Story");
    expect(store.getAgent("max")!.status).toBe("working");
  });

  it("keeps task and agent waiting while a question is open", () => {
    const { store, task } = setup();
    const q = store.askQuestion(task.id, "Musik dezent?", ["Ja", "Nein"]);
    expect(store.getTask(task.id)!.status).toBe("waiting");
    expect(store.getAgent("max")!.status).toBe("waiting");
    store.updateTask(task.id, { status: "running" }); // agent reports progress meanwhile
    expect(store.getTask(task.id)!.status).toBe("waiting");
    store.answerQuestion(q.id, "Ja");
    expect(store.getTask(task.id)!.status).toBe("running");
    expect(store.getAgent("max")!.status).toBe("working");
  });

  it("counts steps and clears the step when done", () => {
    const { store, task } = setup();
    store.updateTask(task.id, { step: "liest kontakt_b.jpg" });
    store.updateTask(task.id, { step: "schneidet Fassung A" });
    expect(store.getTask(task.id)!.stepCount).toBe(2);
    store.updateTask(task.id, { status: "done" });
    const done = store.getTask(task.id)!;
    expect(done.currentStep).toBeNull();
    expect(done.finishedAt).not.toBeNull();
    expect(store.getAgent("max")!.status).toBe("idle");
  });

  it("closes open questions when a task is stopped", () => {
    const { store, task } = setup();
    store.askQuestion(task.id, "Weiter?");
    store.updateTask(task.id, { status: "stopped" });
    expect(store.openQuestions()).toHaveLength(0);
  });

  it("appends streamed progress to the agent's last message", () => {
    const { store, task } = setup();
    store.addMessage(task.id, "agent", "Ich sammle Material.", { append: true });
    store.addMessage(task.id, "agent", "Jetzt schneide ich.", { append: true });
    const msgs = store.listMessages(task.id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe("Ich sammle Material. Jetzt schneide ich.");
  });

  it("rejects answering the same question twice", () => {
    const { store, task } = setup();
    const q = store.askQuestion(task.id, "Frage");
    store.answerQuestion(q.id, "Ja");
    expect(() => store.answerQuestion(q.id, "Nein")).toThrow(/bereits/);
  });

  it("emits live events", () => {
    const { store, task } = setup();
    const events: AgentEvent[] = [];
    store.on("event", (e) => events.push(e));
    store.addMessage(task.id, "user", "Hallo");
    expect(events.map((e) => e.type)).toContain("message");
  });

  it("refuses unknown agents and tasks", () => {
    const store = new AgentStore(null);
    expect(() => store.createTask("nobody", "x")).toThrow(/nicht gefunden/);
    expect(() => store.addMessage("nope", "user", "x")).toThrow(/nicht gefunden/);
  });
});
