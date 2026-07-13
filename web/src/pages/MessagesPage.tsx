import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ConversationList from "../components/ConversationList";
import MessageThread from "../components/MessageThread";
import CustomerPanel from "../components/CustomerPanel";
import { api } from "../api/client";
import type { ConversationListItem } from "../api/types";

export default function MessagesPage() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState<string | null>(null);

  async function handleSelect(id: string) {
    navigate(`/messages/${id}`);
    const conv = await api.get<ConversationListItem>(`/conversations/${id}`);
    setCustomerId((conv as any).customerId ?? null);
  }

  return (
    <div className="messages-page">
      <ConversationList selectedId={conversationId ?? null} onSelect={handleSelect} />
      <MessageThread conversationId={conversationId ?? null} />
      <CustomerPanel conversationId={conversationId ?? null} customerId={customerId} />
    </div>
  );
}
