import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { Customer, CustomerDraft } from "../api/types";

const QUICK_ACTIONS = [
  "Neuen Kunden anlegen",
  "Kundendaten ergänzen",
  "Adresse übernehmen",
  "Rückrufaufgabe erstellen",
  "Besichtigung planen",
  "Termin vorschlagen",
  "Anfrage erstellen",
  "Angebot erstellen",
  "Angebot als PDF senden",
  "Auftrag bestätigen",
  "Rechnung senden",
  "Zahlungserinnerung senden",
  "Bilder dem Objekt zuordnen",
  "Unterhaltung archivieren",
];

interface FullCustomer extends Customer {
  properties: any[];
  inquiries: any[];
  quotes: any[];
  invoices: any[];
  tasks: any[];
  appointments: any[];
  consent: any;
}

export default function CustomerPanel({
  conversationId,
  customerId,
}: {
  conversationId: string | null;
  customerId: string | null;
}) {
  const [customer, setCustomer] = useState<FullCustomer | null>(null);
  const [drafts, setDrafts] = useState<CustomerDraft[]>([]);

  useEffect(() => {
    if (customerId) {
      api.get<FullCustomer>(`/customers/${customerId}`).then(setCustomer);
      api.get<CustomerDraft[]>(`/customers/${customerId}/drafts`).then((d) => setDrafts(d.filter((x) => x.status === "PENDING")));
    } else {
      setCustomer(null);
      setDrafts([]);
    }
  }, [customerId, conversationId]);

  async function confirmDraft(draft: CustomerDraft) {
    await api.post(`/customers/drafts/${draft.id}/confirm`, { extractedData: draft.extractedData });
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
    if (customerId) api.get<FullCustomer>(`/customers/${customerId}`).then(setCustomer);
  }

  async function rejectDraft(draft: CustomerDraft) {
    await api.post(`/customers/drafts/${draft.id}/reject`);
    setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
  }

  async function archiveConversation() {
    if (!conversationId) return;
    await api.patch(`/conversations/${conversationId}`, { status: "ARCHIVED" });
  }

  if (!conversationId) return <div className="customer-panel empty-hint">Keine Auswahl.</div>;

  return (
    <div className="customer-panel">
      {drafts.map((draft) => (
        <div key={draft.id} className="draft-review-card">
          <div className="draft-title">Folgende Kundendaten wurden aus dem Gespräch erkannt.</div>
          <table className="draft-fields">
            <tbody>
              {Object.entries(draft.extractedData).map(([key, value]) =>
                key === "confidence" || value === undefined || value === null || value === "" ? null : (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>{String(value)}</td>
                    <td className="confidence">
                      {draft.confidence?.[key] !== undefined ? `${Math.round(draft.confidence[key] * 100)}%` : ""}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
          <div className="draft-actions">
            <button onClick={() => confirmDraft(draft)}>Bestätigen</button>
            <button onClick={() => rejectDraft(draft)} className="secondary">
              Ablehnen
            </button>
          </div>
        </div>
      ))}

      {customer && (
        <div className="customer-details">
          <h3>
            {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.companyName || "Unbenannter Kontakt"}
          </h3>
          <div className="status-badge">{customer.status}</div>
          <dl>
            <dt>Telefon</dt>
            <dd>{customer.phoneNumber ?? "—"}</dd>
            <dt>E-Mail</dt>
            <dd>{customer.email ?? "—"}</dd>
            <dt>Adresse</dt>
            <dd>
              {customer.street ?? "—"}
              {customer.city ? `, ${customer.city}` : ""}
            </dd>
          </dl>

          {customer.consent && (
            <div className="consent-block">
              <h4>Einwilligungen</h4>
              <ul>
                <li>WhatsApp: {customer.consent.whatsappAllowed ? "✓" : "✗"}</li>
                <li>KI-Verarbeitung: {customer.consent.aiProcessingAllowed ? "✓" : "✗"}</li>
                <li>Bildverarbeitung: {customer.consent.imageProcessingAllowed ? "✓" : "✗"}</li>
              </ul>
            </div>
          )}

          {customer.tasks?.filter((t: any) => t.status === "OPEN").length > 0 && (
            <div className="panel-section">
              <h4>Offene Aufgaben</h4>
              <ul>
                {customer.tasks
                  .filter((t: any) => t.status === "OPEN")
                  .map((t: any) => (
                    <li key={t.id}>{t.title}</li>
                  ))}
              </ul>
            </div>
          )}

          {customer.inquiries?.length > 0 && (
            <div className="panel-section">
              <h4>Anfragen</h4>
              <ul>
                {customer.inquiries.map((i: any) => (
                  <li key={i.id}>
                    {i.desiredService ?? "Leistung unbekannt"} — {i.status}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {customer.quotes?.length > 0 && (
            <div className="panel-section">
              <h4>Angebote</h4>
              <ul>
                {customer.quotes.map((q: any) => (
                  <li key={q.id}>
                    {q.quoteNumber} — {q.status}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {customer.invoices?.length > 0 && (
            <div className="panel-section">
              <h4>Rechnungen</h4>
              <ul>
                {customer.invoices.map((inv: any) => (
                  <li key={inv.id}>
                    {inv.invoiceNumber} — {inv.status}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="panel-section quick-actions">
        <h4>Schnellaktionen</h4>
        <div className="quick-action-grid">
          {QUICK_ACTIONS.map((label) =>
            label === "Unterhaltung archivieren" ? (
              <button key={label} onClick={archiveConversation}>
                {label}
              </button>
            ) : (
              <button key={label} title="Verknüpft mit Auftrags-/Angebotsverwaltung (folgt)" disabled>
                {label}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
