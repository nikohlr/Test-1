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
  samantha: ["Tagesplanung mit dem Team abstimmen", "Ergebnisse der Agenten prüfen", "Prioritäten für heute setzen"],
  kundenservice: ["Antwort an Familie Weber vorbereiten", "3 neue WhatsApp-Anfragen sortieren", "Rückfrage zu Heckenschnitt klären"],
  angebote: ["Angebot Rasenpflege Müller kalkulieren", "Preisliste 2027 abgleichen", "Angebot Baumfällung entwerfen"],
  termine: ["Touren für Donnerstag optimieren", "Terminkonflikt Freitag auflösen", "Wetterprognose einplanen"],
  recherche: ["Wettbewerberpreise Region recherchieren", "Fördermittel Gartenbau prüfen", "Lieferanten für Rindenmulch vergleichen"],
  buchhaltung: ["Zahlungseingänge abgleichen", "Mahnung Rechnung #1043 vorbereiten", "Monatsabschluss vorbereiten"],
};

const STEPS = ["Daten geladen", "Kontext ausgewertet", "Entwurf erstellt", "Zwischenergebnis gespeichert", "Prüfung läuft", "Quellen abgeglichen"];

const QUESTIONS: Record<string, { text: string; options: string[] }[]> = {
  samantha: [{ text: "Soll ich das Angebot für Müller heute noch rausschicken oder bis morgen warten?", options: ["Heute senden", "Bis morgen warten"] }],
  kundenservice: [{ text: "Frau Weber fragt nach einem Termin am Samstag. Bieten wir Samstagstermine an?", options: ["Ja, mit Aufschlag", "Nein", "Nur vormittags"] }],
  angebote: [{ text: "Für die Baumfällung fehlt die Stammdicke. Pauschal mit 40 cm kalkulieren?", options: ["Ja, 40 cm", "Erst Kunden fragen"] }],
  termine: [{ text: "Donnerstag ist Regen gemeldet. Rasentermine auf Freitag verschieben?", options: ["Verschieben", "So lassen"] }],
  recherche: [],
  buchhaltung: [{ text: "Rechnung #1043 ist 21 Tage überfällig. Erste Mahnung versenden?", options: ["Ja, versenden", "Noch 1 Woche warten"] }],
};

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** Seeds Samantha + team and keeps them "busy" so the terminal can be tried without real agents. */
export function startDemoSimulation(store: AgentStore, intervalMs = 4000): () => void {
  for (const seed of DEMO_AGENTS) {
    if (!store.getAgent(seed.id)) {
      store.upsertAgent({ ...seed, status: "working", currentTask: pick(TASKS[seed.id]), progress: Math.floor(Math.random() * 60) });
      store.addMessage(seed.id, "agent", seed.isLead ? "Hallo Niko, das Team ist bereit. Schreib mir, was ansteht – ich verteile es." : `Bereit. Ich bin zuständig für: ${seed.role}.`);
    }
  }
  // Start with one open question so the red glow is visible right away.
  if (store.openQuestions().length === 0) {
    const q = QUESTIONS.kundenservice[0];
    store.askQuestion("kundenservice", q.text, q.options);
  }

  const timer = setInterval(() => {
    const agents = store.listAgents().filter((a) => DEMO_AGENTS.some((d) => d.id === a.id));
    if (agents.length === 0) return;
    const agent = pick(agents);
    if (agent.status === "waiting" || agent.status === "offline") return; // waits for you

    const roll = Math.random();
    if (roll < 0.06 && QUESTIONS[agent.id]?.length && store.openQuestions().length < 3) {
      const q = pick(QUESTIONS[agent.id]);
      store.askQuestion(agent.id, q.text, q.options);
      store.addActivity(agent.id, "Wartet auf deine Entscheidung", "warn");
      return;
    }
    if (agent.status === "idle" || roll < 0.12) {
      const task = pick(TASKS[agent.id] ?? ["Aufgabe bearbeiten"]);
      store.setStatus(agent.id, "working", task, 0);
      store.addActivity(agent.id, `Startet: ${task}`);
      return;
    }
    const progress = Math.min(100, (agent.progress ?? 0) + 8 + Math.floor(Math.random() * 20));
    if (progress >= 100) {
      store.addActivity(agent.id, `Fertig: ${agent.currentTask ?? "Aufgabe"}`, "success");
      store.setStatus(agent.id, "idle", null, null);
      if (!agent.isLead) store.addActivity("samantha", `Ergebnis von ${agent.name} geprüft`);
    } else {
      store.setStatus(agent.id, "working", agent.currentTask, progress);
      store.addActivity(agent.id, `${pick(STEPS)} (${progress} %)`);
    }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
