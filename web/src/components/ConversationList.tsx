import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { ConversationListItem } from "../api/types";

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Alle" },
  { key: "unread", label: "Ungelesen" },
  { key: "new_leads", label: "Neue Interessenten" },
  { key: "quote_pending", label: "Angebot offen" },
  { key: "appointment", label: "Terminvereinbarung" },
  { key: "job_planned", label: "Auftrag geplant" },
  { key: "invoice_open", label: "Rechnung offen" },
  { key: "callback_required", label: "Rückruf erforderlich" },
  { key: "archived", label: "Archiviert" },
];

function customerLabel(c: ConversationListItem["customer"]) {
  if (!c) return "Unbekannt";
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return name || c.companyName || c.phoneNumber || "Unbekannt";
}

function formatTime(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get<ConversationListItem[]>(`/conversations${filter ? `?filter=${filter}` : ""}`)
      .then(setConversations)
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <div className="conversation-list">
      <div className="filter-chips">
        {FILTERS.map((f) => (
          <button key={f.key} className={f.key === filter ? "chip active" : "chip"} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="conversation-items">
        {loading && <div className="empty-hint">Lade Unterhaltungen…</div>}
        {!loading && conversations.length === 0 && <div className="empty-hint">Keine Unterhaltungen gefunden.</div>}
        {conversations.map((c) => (
          <button
            key={c.id}
            className={`conversation-item ${c.id === selectedId ? "selected" : ""} ${c.unreadCount > 0 ? "unread" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            <div className="avatar">{customerLabel(c.customer).charAt(0).toUpperCase()}</div>
            <div className="conversation-main">
              <div className="conversation-top-row">
                <span className="customer-name">{customerLabel(c.customer)}</span>
                <span className="timestamp">{formatTime(c.lastMessageAt)}</span>
              </div>
              <div className="conversation-second-row">
                <span className="phone">{c.phoneNumber}</span>
                {c.customer?.status === "LEAD" && <span className="badge lead">Interessent</span>}
                {c.urgency > 0 && <span className="badge urgent">Dringend</span>}
              </div>
              <div className="last-message">
                {c.lastMessage?.isInternalNote ? "📝 " : ""}
                {c.lastMessage?.text ?? (c.lastMessage ? `[${c.lastMessage.messageType}]` : "Noch keine Nachrichten")}
              </div>
              <div className="conversation-meta-row">
                {c.assignedUser && <span className="meta-tag">👤 {c.assignedUser.name}</span>}
                {c.openTask && <span className="meta-tag">☎ {c.openTask.title}</span>}
                {c.latestInquiry && <span className="meta-tag">📋 {c.latestInquiry.desiredService ?? c.latestInquiry.status}</span>}
              </div>
            </div>
            {c.unreadCount > 0 && <span className="unread-badge">{c.unreadCount}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
