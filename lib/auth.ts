// lib/auth.ts
import crypto from "crypto";
import { cookies } from "next/headers";

if (!process.env.APP_SIGNING_SECRET) {
  throw new Error("APP_SIGNING_SECRET environment variable is required");
}

const APP_SIGNING_SECRET: string = process.env.APP_SIGNING_SECRET;

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
  // Deterministic, stable workspace id derived from Stripe customer id (UUID format)
  const hashBytes = crypto.createHash("sha256").update(customerId).digest();
  // Format as UUID: 8-4-4-4-12 characters
  return `${hashBytes.subarray(0, 4).toString('hex')}-${hashBytes.subarray(4, 6).toString('hex')}-${hashBytes.subarray(6, 8).toString('hex')}-${hashBytes.subarray(8, 10).toString('hex')}-${hashBytes.subarray(10, 16).toString('hex')}`;
}

export function signToken(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", APP_SIGNING_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function secret(){const s=process.env.APP_SIGNING_SECRET||process.env.NEXTAUTH_SECRET||"";if(!s)throw new Error("Missing signing secret");return s;}
export function verifyToken(t:string){
  if(!t||typeof t!=="string") throw new Error("No token");
  const [p,sig]=t.split("."); if(!p||!sig) throw new Error("Malformed");
  const expSig=crypto.createHmac("sha256",secret()).update(p).digest("base64url");
  if(expSig!==sig) throw new Error("Bad signature");
  const payload=JSON.parse(Buffer.from(p,"base64url").toString("utf8"));
  if(payload?.exp && Number(payload.exp) < Math.floor(Date.now()/1000)) throw new Error("Expired");
  return payload;
}
