import { NextRequest, NextResponse } from "next/server";
import { recordWebhookSuppression } from "@/lib/alerts/emailControls";
import { maskEmail } from "@/lib/maskEmail";
import { RESEND_WEBHOOK_EVENTS, verifyResendWebhookSignature, type ResendWebhookEventType } from "@/lib/resendWebhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isHandledEvent(type: string): type is ResendWebhookEventType {
  return (RESEND_WEBHOOK_EVENTS as readonly string[]).includes(type);
}

function bounceReason(data: Record<string, unknown>): string {
  const bounce = data.bounce;
  if (!bounce || typeof bounce !== "object") return "";
  const record = bounce as { message?: unknown; type?: unknown };
  const raw = typeof record.message === "string" && record.message.trim()
    ? record.message.trim()
    : typeof record.type === "string" && record.type.trim()
      ? record.type.trim()
      : "";
  return raw.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (match) => maskEmail(match));
}

export async function POST(req: NextRequest) {
  const secret = (process.env.RESEND_WEBHOOK_SECRET || "").trim();
  if (!secret) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const payload = await req.text();
  const verified = verifyResendWebhookSignature(payload, {
    id: req.headers.get("svix-id"),
    timestamp: req.headers.get("svix-timestamp"),
    signature: req.headers.get("svix-signature"),
  }, secret);

  if (!verified) {
    console.error("[resend-webhook] signature verification failed");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const record = event as { type?: unknown; data?: unknown };
  const type = typeof record.type === "string" ? record.type : "";
  if (!isHandledEvent(type)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const data = record.data && typeof record.data === "object" ? record.data as Record<string, unknown> : {};
  const emailId = typeof data.email_id === "string" ? data.email_id : "";
  const toRaw = Array.isArray(data.to) ? data.to[0] : data.to;
  const masked = typeof toRaw === "string" ? maskEmail(toRaw) : "***";
  const reason = bounceReason(data);

  console.log(`[resend-webhook] id=${emailId} type=${type} to=${masked}${reason ? ` reason=${reason}` : ""}`);
  if (type === "email.complained" || type === "email.bounced") {
    await recordWebhookSuppression(type, data);
  }
  return NextResponse.json({ ok: true });
}
