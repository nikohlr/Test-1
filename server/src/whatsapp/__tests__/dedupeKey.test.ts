import { describe, expect, it } from "vitest";
import { extractDedupeKey } from "../dedupeKey";

function messagePayload(id: string) {
  return {
    entry: [{ changes: [{ field: "messages", value: { messages: [{ id, from: "+491700000000", type: "text" }] } }] }],
  };
}

describe("extractDedupeKey", () => {
  it("produces the same key for the exact same delivery (Meta retry)", () => {
    const payload = messagePayload("wamid.ABC123");
    expect(extractDedupeKey(payload)).toBe(extractDedupeKey(payload));
  });

  it("produces different keys for different messages", () => {
    expect(extractDedupeKey(messagePayload("wamid.ABC123"))).not.toBe(extractDedupeKey(messagePayload("wamid.XYZ789")));
  });

  it("distinguishes status updates by status value", () => {
    const delivered = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "delivered" }] } }] }] };
    const read = { entry: [{ changes: [{ value: { statuses: [{ id: "wamid.1", status: "read" }] } }] }] };
    expect(extractDedupeKey(delivered)).not.toBe(extractDedupeKey(read));
  });

  it("falls back to a stable hash of the body when there are no message/status ids", () => {
    const payload = { entry: [] };
    expect(extractDedupeKey(payload)).toBe(extractDedupeKey(payload));
  });
});
