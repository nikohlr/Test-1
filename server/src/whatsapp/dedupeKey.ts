// Dedupe key: WhatsApp does not send one top-level event id, so we hash
// the delivered message/status ids to detect Meta's at-least-once retries
// of the *same* webhook delivery without depending on body byte-equality.
export function extractDedupeKey(body: any): string {
  const ids: string[] = [];
  for (const entry of body?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const m of change.value?.messages ?? []) ids.push(`m:${m.id}`);
      for (const s of change.value?.statuses ?? []) ids.push(`s:${s.id}:${s.status}`);
    }
  }
  return ids.length ? ids.join(",") : JSON.stringify(body).slice(0, 500);
}
