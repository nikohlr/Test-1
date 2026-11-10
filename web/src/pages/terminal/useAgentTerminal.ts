import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";

export type AgentStatus = "idle" | "working" | "waiting" | "error" | "offline";
export type TaskStatus = "running" | "waiting" | "done" | "stopped" | "failed";

export interface Agent {
  id: string;
  name: string;
  role: string;
  isLead: boolean;
  status: AgentStatus;
  currentTask: string | null;
  webhookUrl: string | null;
  avatarUrl: string | null;
  lastActivityAt: string;
}

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

export interface AgentMessage {
  id: string;
  agentId: string;
  taskId: string;
  from: "user" | "agent" | "system";
  text: string;
  createdAt: string;
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
}

type AgentEvent =
  | { type: "agent"; agent: Agent }
  | { type: "agentRemoved"; agentId: string }
  | { type: "task"; task: AgentTask }
  | { type: "message"; message: AgentMessage }
  | { type: "question"; question: AgentQuestion };

interface Snapshot {
  agents: Agent[];
  tasks: AgentTask[];
  questions: AgentQuestion[];
  demoMode: boolean;
}

const sortAgents = (list: Agent[]) => list.sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name));

/**
 * Loads the snapshot once, then keeps everything live via Server-Sent Events.
 * Messages are loaded per visible task and kept in sync from the stream.
 */
export function useAgentTerminal() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [questions, setQuestions] = useState<AgentQuestion[]>([]);
  const [messages, setMessages] = useState<Record<string, AgentMessage[]>>({});
  const [demoMode, setDemoMode] = useState(false);
  const [connected, setConnected] = useState(false);
  const loadedTasks = useRef(new Set<string>());
  const onQuestionRef = useRef<((q: AgentQuestion) => void) | null>(null);

  const loadMessages = useCallback(async (taskId: string, force = false) => {
    if (loadedTasks.current.has(taskId) && !force) return;
    loadedTasks.current.add(taskId);
    const list = await api.get<AgentMessage[]>(`/agents/tasks/${taskId}/messages`).catch(() => null);
    if (list) setMessages((m) => ({ ...m, [taskId]: list }));
  }, []);

  const loadSnapshot = useCallback(async () => {
    const snap = await api.get<Snapshot>("/agents");
    setAgents(sortAgents(snap.agents));
    setTasks(snap.tasks);
    setQuestions(snap.questions);
    setDemoMode(snap.demoMode);
    // Refresh the timelines that are already on screen (we may have missed events while offline).
    loadedTasks.current.forEach((id) => void loadMessages(id, true));
  }, [loadMessages]);

  useEffect(() => {
    let cancelled = false;
    const source = new EventSource("/api/agents/stream");
    source.onopen = () => {
      setConnected(true);
      loadSnapshot().catch(() => undefined);
    };
    source.onerror = () => setConnected(false);
    source.onmessage = (e) => {
      if (cancelled) return;
      const event = JSON.parse(e.data) as AgentEvent;
      switch (event.type) {
        case "agent":
          setAgents((list) =>
            sortAgents(list.some((a) => a.id === event.agent.id) ? list.map((a) => (a.id === event.agent.id ? event.agent : a)) : [...list, event.agent])
          );
          break;
        case "agentRemoved":
          setAgents((list) => list.filter((a) => a.id !== event.agentId));
          break;
        case "task":
          setTasks((list) => (list.some((t) => t.id === event.task.id) ? list.map((t) => (t.id === event.task.id ? event.task : t)) : [...list, event.task]));
          break;
        case "question":
          setQuestions((list) =>
            list.some((q) => q.id === event.question.id) ? list.map((q) => (q.id === event.question.id ? event.question : q)) : [...list, event.question]
          );
          if (event.question.status === "open") onQuestionRef.current?.(event.question);
          break;
        case "message": {
          const msg = event.message;
          setMessages((m) => {
            const list = m[msg.taskId] ?? [];
            const next = list.some((x) => x.id === msg.id) ? list.map((x) => (x.id === msg.id ? msg : x)) : [...list, msg];
            return { ...m, [msg.taskId]: next };
          });
          break;
        }
      }
    };
    return () => {
      cancelled = true;
      source.close();
    };
  }, [loadSnapshot]);

  return {
    agents,
    tasks: tasks.filter((t) => !t.archived),
    questions,
    openQuestions: questions.filter((q) => q.status === "open"),
    messages,
    demoMode,
    connected,
    loadMessages,
    createTask: (agentId: string, text: string) => api.post<AgentTask>(`/agents/${agentId}/tasks`, { text }),
    sendToTask: (taskId: string, text: string) => api.post(`/agents/tasks/${taskId}/messages`, { text }),
    answerQuestion: (questionId: string, answer: string) => api.post(`/agents/questions/${questionId}/answer`, { answer }),
    stopTask: (taskId: string) => api.post(`/agents/tasks/${taskId}/stop`),
    archiveTask: (taskId: string) => api.post(`/agents/tasks/${taskId}/archive`),
    onQuestion: (fn: (q: AgentQuestion) => void) => {
      onQuestionRef.current = fn;
    },
  };
}
