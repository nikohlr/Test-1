import type { AgentStore } from "./agentStore";
import type { Agent } from "./types";

type Seed = Pick<Agent, "id" | "name" | "role" | "isLead">;

export const DEMO_AGENTS: Seed[] = [
  { id: "samantha", name: "Samantha", role: "Leitung · koordiniert das Team", isLead: true },
  { id: "kundenservice", name: "Kundenservice", role: "WhatsApp-Anfragen beantworten", isLead: false },
  { id: "angebote", name: "Angebote", role: "Angebote & Kalkulation", isLead: false },
  { id: "termine", name: "Termine", role: "Einsatzplanung & Kalender", isLead: false },
  { id: "recherche", name: "Recherche", role: "Web-Recherche & Analysen", isLead: false },
  { id: "buchhaltung", name: "Buchhaltung", role: "Rechnungen & Zahlungseingänge", isLead: false },
];

const TASKS: Record<string, string[]> = {
  samantha: ["Wochenplanung mit dem Team abstimmen", "Ergebnisse der Agenten prüfen und zusammenfassen"],
  kundenservice: ["Antworten auf die 3 neuen WhatsApp-Anfragen vorbereiten", "Rückfrage zum Heckenschnitt bei Familie Weber klären"],
  angebote: ["Angebot Rasenpflege Müller kalkulieren", "Angebot Baumfällung Schneider entwerfen"],
  termine: ["Touren für Donnerstag optimieren", "Terminkonflikt am Freitag auflösen"],
  recherche: ["Wettbewerberpreise in der Region recherchieren", "Lieferanten für Rindenmulch vergleichen"],
  buchhaltung: ["Zahlungseingänge vom Oktober abgleichen", "Mahnung für Rechnung #1043 vorbereiten"],
};

const STEPS = ["liest kunden.csv", "öffnet WhatsApp-Verlauf", "liest angebot_vorlage.docx", "prüft Kalender", "sucht im Web", "liest kontakt_b.jpg", "schreibt Entwurf", "rechnet Positionen", "prüft Ergebnis"];

const PROGRESS = [
  "Ich sammle gerade die Unterlagen zusammen.",
  "Die Daten sind da, jetzt werte ich sie aus.",
  "Erster Entwurf steht, ich prüfe noch die Details.",
  "Zwei Kleinigkeiten korrigiere ich noch.",
  "Jetzt gleiche ich alles mit den bisherigen Absprachen ab.",
];

const QUESTIONS: Record<string, { text: string; options: string[] }> = {
  samantha: { text: "Soll ich das Angebot für Müller heute noch rausschicken oder bis morgen warten?", options: ["Heute senden", "Bis morgen warten"] },
  kundenservice: { text: "Frau Weber fragt nach einem Termin am Samstag. Bieten wir Samstagstermine an?", options: ["Ja, mit Aufschlag", "Nein", "Nur vormittags"] },
  angebote: { text: "Für die Baumfällung fehlt die Stammdicke. Pauschal mit 40 cm kalkulieren?", options: ["Ja, 40 cm", "Erst Kunden fragen"] },
  termine: { text: "Donnerstag ist Regen gemeldet. Rasentermine auf Freitag verschieben?", options: ["Verschieben", "So lassen"] },
  buchhaltung: { text: "Rechnung #1043 ist 21 Tage überfällig. Erste Mahnung versenden?", options: ["Ja, versenden", "Noch 1 Woche warten"] },
};

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

interface SimState {
  targetSteps: number;
  asked: boolean;
}

/** Seeds Samantha + team and keeps their tasks moving so the terminal can be tried without real agents. */
export function startDemoSimulation(store: AgentStore, intervalMs = 2500): () => void {
  const sim = new Map<string, SimState>();
  const isDemoAgent = (agentId: string) => {
    const agent = store.getAgent(agentId);
    return !!agent && !agent.webhookUrl;
  };

  for (const seed of DEMO_AGENTS) {
    if (!store.getAgent(seed.id)) store.upsertAgent({ ...seed, status: "idle" });
  }

  if (store.listTasks().length === 0) {
    // A finished task with a result, a waiting one (red) and a few running ones.
    const done = store.createTask("angebote", "Bitte erstelle das Angebot für die Rasenpflege bei Familie Krüger (ca. 400 m², 14-tägig).");
    store.updateTask(done.id, { step: "liest angebot_vorlage.docx" });
    store.addMessage(done.id, "agent", "Das Angebot steht: 14-tägige Rasenpflege, 400 m², 89 € pro Einsatz netto. Der Entwurf liegt in den Angeboten zur Freigabe.");
    store.updateTask(done.id, { status: "done" });

    const waiting = store.createTask("kundenservice", "Beantworte die neue Anfrage von Frau Weber zum Heckenschnitt.");
    store.addMessage(waiting.id, "agent", "Ich habe den Verlauf gelesen und eine Antwort vorbereitet.");
    store.askQuestion(waiting.id, QUESTIONS.kundenservice.text, QUESTIONS.kundenservice.options);
    sim.set(waiting.id, { targetSteps: 6, asked: true });

    for (const agentId of ["samantha", "recherche", "termine"]) {
      const task = store.createTask(agentId, pick(TASKS[agentId]));
      store.updateTask(task.id, { step: pick(STEPS) });
      store.addMessage(task.id, "agent", PROGRESS[0]);
    }
  }

  const tick = () => {
    const active = store.listTasks().filter((t) => t.status === "running" && isDemoAgent(t.agentId));

    // Keep a few tasks going: Samantha "delegates" new work to idle agents.
    if (active.length < 3 && Math.random() < 0.3) {
      const idle = DEMO_AGENTS.filter((a) => store.getAgent(a.id)?.status === "idle");
      if (idle.length) {
        const agent = pick(idle);
        store.createTask(agent.id, `${pick(TASKS[agent.id])} (von Samantha delegiert)`);
      }
    }

    for (const task of active) {
      if (Math.random() < 0.45) continue;
      const state = sim.get(task.id) ?? { targetSteps: 5 + Math.floor(Math.random() * 6), asked: false };
      sim.set(task.id, state);

      if (task.stepCount >= state.targetSteps) {
        store.addMessage(task.id, "agent", "Fertig. Das Ergebnis liegt zur Prüfung bereit.");
        store.updateTask(task.id, { status: "done" });
        sim.delete(task.id);
        continue;
      }
      if (!state.asked && QUESTIONS[task.agentId] && task.stepCount >= 2 && Math.random() < 0.12 && store.openQuestions().length < 3) {
        state.asked = true;
        store.askQuestion(task.id, QUESTIONS[task.agentId].text, QUESTIONS[task.agentId].options);
        continue;
      }
      store.updateTask(task.id, { step: pick(STEPS) });
      if (Math.random() < 0.6) store.addMessage(task.id, "agent", pick(PROGRESS), { append: true });
    }
  };

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
