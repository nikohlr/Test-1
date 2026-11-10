// Agenten-Terminal: shared types for Samantha + her team and their tasks (Aufträge).

export type AgentStatus = "idle" | "working" | "waiting" | "error" | "offline";

export interface Agent {
  id: string;
  name: string;
  role: string;
  /** Samantha: the lead agent that coordinates the others. */
  isLead: boolean;
  status: AgentStatus;
  currentTask: string | null;
  /** Where tasks/messages from the terminal are POSTed (n8n, own agent server, ...). Null = demo responder. */
  webhookUrl: string | null;
  avatarUrl: string | null;
  lastActivityAt: string;
}

export type TaskStatus = "running" | "waiting" | "done" | "stopped" | "failed";

/** One Auftrag = one panel in the terminal. */
export interface AgentTask {
  id: string;
  agentId: string;
  title: string;
  instruction: string;
  status: TaskStatus;
  stepCount: number;
  currentStep: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export type MessageSender = "user" | "agent" | "system";

export interface AgentMessage {
  id: string;
  agentId: string;
  taskId: string;
  from: MessageSender;
  text: string;
  createdAt: string;
  /** Set when this message is the question itself, so the UI can link answer buttons to it. */
  questionId?: string;
}

export interface AgentQuestion {
  id: string;
  agentId: string;
  taskId: string;
  text: string;
  options: string[];
  status: "open" | "answered";
  answer: string | null;
  createdAt: string;
  answeredAt: string | null;
}

export interface AgentSnapshot {
  agents: Agent[];
  tasks: AgentTask[];
  questions: AgentQuestion[];
  demoMode: boolean;
}

/** Events pushed live to every connected terminal (laptop, PC, phone ...) via SSE. */
export type AgentEvent =
  | { type: "agent"; agent: Agent }
  | { type: "agentRemoved"; agentId: string }
  | { type: "task"; task: AgentTask }
  | { type: "message"; message: AgentMessage }
  | { type: "question"; question: AgentQuestion };
