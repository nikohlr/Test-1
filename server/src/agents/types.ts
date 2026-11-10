// Agenten-Terminal: shared types for the agent registry (Samantha + her team).

export type AgentStatus = "idle" | "working" | "waiting" | "error" | "offline";

export interface Agent {
  id: string;
  name: string;
  role: string;
  /** Samantha: the lead agent that coordinates the others. */
  isLead: boolean;
  status: AgentStatus;
  currentTask: string | null;
  /** 0-100, null when the agent does not report progress. */
  progress: number | null;
  /** Where messages from the terminal are POSTed (n8n, own agent server, ...). Null = demo responder. */
  webhookUrl: string | null;
  lastActivityAt: string;
}

export type MessageSender = "user" | "agent" | "system";

export interface AgentMessage {
  id: string;
  agentId: string;
  from: MessageSender;
  text: string;
  createdAt: string;
  /** Set when this message is the question itself, so the UI can link answer buttons to it. */
  questionId?: string;
}

export interface AgentQuestion {
  id: string;
  agentId: string;
  text: string;
  options: string[];
  status: "open" | "answered";
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
}

export interface ActivityEntry {
  id: string;
  agentId: string;
  text: string;
  level: "info" | "success" | "warn" | "error";
  createdAt: string;
}

export interface AgentSnapshot {
  agents: Agent[];
  questions: AgentQuestion[];
  activity: ActivityEntry[];
  demoMode: boolean;
}

/** Events pushed live to every connected terminal (laptop, PC, phone ...) via SSE. */
export type AgentEvent =
  | { type: "agent"; agent: Agent }
  | { type: "agentRemoved"; agentId: string }
  | { type: "message"; message: AgentMessage }
  | { type: "question"; question: AgentQuestion }
  | { type: "activity"; entry: ActivityEntry };
