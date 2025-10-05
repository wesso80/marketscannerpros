// lib/auth.ts
import crypto from "crypto";
import { cookies } from "next/headers";

const APP_SIGNING_SECRET = process.env.APP_SIGNING_SECRET!;

function verify(token: string) {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", APP_SIGNING_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload as { cid: string; tier: string; workspaceId: string; exp: number };
}

export function getSessionFromCookie() {
  const c = cookies().get("ms_auth")?.value;
  if (!c) return null;
  return verify(c);
}

export function hashWorkspaceId(customerId: string) {
  // Deterministic, stable workspace id derived from Stripe customer id
  const h = crypto.createHash("sha256").update(customerId).digest("hex").slice(0, 32);
  return `${h}`;
}

export function signToken(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", APP_SIGNING_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
