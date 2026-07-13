import crypto from "crypto";
import { env } from "../config/env";

// Verifies the X-Hub-Signature-256 header Meta sends on every webhook POST,
// per https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
export function verifyMetaSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!env.whatsapp.appSecret) return false;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", env.whatsapp.appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  if (expectedBuf.length !== providedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, providedBuf);
}
