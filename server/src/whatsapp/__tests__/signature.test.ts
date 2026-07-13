import { describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import { verifyMetaSignature } from "../signature";

vi.mock("../../config/env", () => ({ env: { whatsapp: { appSecret: "test-secret" } } }));

function sign(body: Buffer, secret: string) {
  return `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyMetaSignature", () => {
  const body = Buffer.from(JSON.stringify({ hello: "world" }));

  it("accepts a correctly signed payload", () => {
    expect(verifyMetaSignature(body, sign(body, "test-secret"))).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    expect(verifyMetaSignature(body, sign(body, "wrong-secret"))).toBe(false);
  });

  it("rejects a tampered payload", () => {
    const tampered = Buffer.from(JSON.stringify({ hello: "world!" }));
    expect(verifyMetaSignature(tampered, sign(body, "test-secret"))).toBe(false);
  });

  it("rejects a missing signature header", () => {
    expect(verifyMetaSignature(body, undefined)).toBe(false);
  });

  it("rejects a malformed signature header", () => {
    expect(verifyMetaSignature(body, "not-a-valid-header")).toBe(false);
  });
});
