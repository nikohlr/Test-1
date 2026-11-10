import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";

export type AgentStatus = "idle" | "working" | "waiting" | "error" | "offline";

export interface Agent {
  id: string;
  name: string;
  role: string;
  isLead: boolean;
  status: AgentStatus;
  currentTask: string | null;
  progress: number | null;
  webhookUrl: string | null;
  lastActivityAt: string;
}

export interface AgentMessage {
  id: string;
  agentId: string;
  from: "user" | "agent" | "system";
  text: string;
  createdAt: string;
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
}

export interface ActivityEntry {
  id: string;
  agentId: string;
  text: string;
  level: "info" | "success" | "warn" | "error";
  createdAt: string;
}

type AgentEvent =
  | { type: "agent"; agent: Agent }
  | { type: "agentRemoved"; agentId: string }
  | { type: "message"; message: AgentMessage }
  | { type: "question"; question: AgentQuestion }
  | { type: "activity"; entry: ActivityEntry };

interface Snapshot {
  agents: Agent[];
  questions: AgentQuestion[];
  activity: ActivityEntry[];
  demoMode: boolean;
}

/** Loads the snapshot once, then keeps everything live via Server-Sent Events. */
export function useAgentTerminal(selectedAgentId: string | null) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [questions, setQuestions] = useState<AgentQuestion[]>([]);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const selectedRef = useRef(selectedAgentId);
  selectedRef.current = selectedAgentId;
  const onQuestionRef = useRef<((q: AgentQuestion) => void) | null>(null);

  const loadSnapshot = useCallback(async () => {
    const snap = await api.get<Snapshot>("/agents");
    setAgents(snap.agents);
    setQuestions(snap.questions);
    setActivity(snap.activity);
    setDemoMode(snap.demoMode);
  }, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    const connect = () => {
      source = new EventSource("/api/agents/stream");
      source.onopen = () => {
        setConnected(true);
        // Re-sync after (re)connect so nothing is missed while offline.
        loadSnapshot().catch(() => undefined);
      };
      source.onerror = () => setConnected(false);
      source.onmessage = (e) => {
        if (cancelled) return;
        const event = JSON.parse(e.data) as AgentEvent;
        switch (event.type) {
          case "agent":
            setAgents((list) => {
              const next = list.some((a) => a.id === event.agent.id)
                ? list.map((a) => (a.id === event.agent.id ? event.agent : a))
                : [...list, event.agent];
              return next.sort((a, b) => Number(b.isLead) - Number(a.isLead) || a.name.localeCompare(b.name));
            });
            break;
          case "agentRemoved":
            setAgents((list) => list.filter((a) => a.id !== event.agentId));
            break;
          case "question":
            setQuestions((list) =>
              list.some((q) => q.id === event.question.id)
                ? list.map((q) => (q.id === event.question.id ? event.question : q))
                : [...list, event.question]
            );
            if (event.question.status === "open") onQuestionRef.current?.(event.question);
            break;
          case "activity":
            setActivity((list) => [...list.slice(-120), event.entry]);
            break;
          case "message":
            if (event.message.agentId === selectedRef.current) {
              setMessages((list) => (list.some((m) => m.id === event.message.id) ? list : [...list, event.message]));
            } else if (event.message.from === "agent") {
              setUnread((u) => ({ ...u, [event.message.agentId]: (u[event.message.agentId] ?? 0) + 1 }));
            }
            break;
        }
      };
    };

    loadSnapshot().catch(() => undefined);
    connect();
    return () => {
      cancelled = true;
      source?.close();
    };
  }, [loadSnapshot]);

  useEffect(() => {
    setMessages([]);
    if (!selectedAgentId) return;
    setUnread((u) => ({ ...u, [selectedAgentId]: 0 }));
    api.get<AgentMessage[]>(`/agents/${selectedAgentId}/messages`).then(setMessages).catch(() => undefined);
  }, [selectedAgentId]);

  const sendMessage = useCallback(async (agentId: string, text: string) => {
    const message = await api.post<AgentMessage>(`/agents/${agentId}/messages`, { text });
    setMessages((list) => (list.some((m) => m.id === message.id) ? list : [...list, message]));
  }, []);

  const answerQuestion = useCallback(async (questionId: string, answer: string) => {
    await api.post(`/agents/questions/${questionId}/answer`, { answer });
  }, []);

  return {
    agents,
    questions,
    openQuestions: questions.filter((q) => q.status === "open"),
    activity,
    messages,
    demoMode,
    connected,
    unread,
    sendMessage,
    answerQuestion,
    onQuestion: (fn: (q: AgentQuestion) => void) => {
      onQuestionRef.current = fn;
    },
  };
}
