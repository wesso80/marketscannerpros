import { createHmac, timingSafeEqual } from "crypto";

const SECRET_PREFIX = "whsec_";
const TOLERANCE_SEC = 5 * 60;

export const RESEND_WEBHOOK_EVENTS = [
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.delivery_delayed",
] as const;

export type ResendWebhookEventType = (typeof RESEND_WEBHOOK_EVENTS)[number];

export type ResendWebhookHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

function webhookKey(secret: string): Buffer | null {
  const trimmed = secret.trim();
  if (!trimmed.startsWith(SECRET_PREFIX)) return null;
  const raw = trimmed.slice(SECRET_PREFIX.length);
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  return key.length ? key : null;
}

function signaturesMatch(expected: string, header: string): boolean {
  const expectedBuf = Buffer.from(expected);
  for (const part of header.split(" ")) {
    const comma = part.indexOf(",");
    if (comma === -1) continue;
    const version = part.slice(0, comma);
    const sig = part.slice(comma + 1);
    if (version !== "v1" || !sig) continue;
    const actual = Buffer.from(sig);
    if (actual.length === expectedBuf.length && timingSafeEqual(actual, expectedBuf)) return true;
  }
  return false;
}

/**
 * Svix signature check used by Resend webhooks.
 * Signed content is `${id}.${timestamp}.${rawBody}` with HMAC-SHA256 over the base64-decoded whsec_ secret.
 */
export function verifyResendWebhookSignature(
  payload: string,
  headers: ResendWebhookHeaders,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!secret.trim() || !headers.id || !headers.timestamp || !headers.signature) return false;
  if (!/^\d+$/.test(headers.timestamp)) return false;
  const timestamp = Number(headers.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(nowSec - timestamp) > TOLERANCE_SEC) return false;
  const key = webhookKey(secret);
  if (!key) return false;
  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${payload}`)
    .digest("base64");
  return signaturesMatch(expected, headers.signature.trim());
}
