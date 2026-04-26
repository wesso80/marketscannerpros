import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, verifyCronAuth } from "@/lib/adminAuth";
import { sendAlertEmail } from "@/lib/email";
import { buildMorningBrief, renderMorningBriefEmail, saveMorningBriefSnapshot } from "@/lib/admin/morning-brief";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const isCron = verifyCronAuth(req);
  const isAdmin = isCron ? false : (await requireAdmin(req)).ok;

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const preview = Boolean(body.preview);
    const recipients = resolveRecipients(body.to);
    const brief = await buildMorningBrief({
      symbols: Array.isArray(body.symbols) ? body.symbols : undefined,
      market: body.market,
      timeframe: body.timeframe,
      scanLimit: body.scanLimit ?? (preview ? 20 : undefined),
    });
    if (!preview) {
      await saveMorningBriefSnapshot(brief, isCron ? "cron" : "email");
    }
    const html = renderMorningBriefEmail(brief);
    const subject = `${preview ? "[PREVIEW] " : ""}MSP Morning Brief: ${brief.deskState} - ${brief.topPlays.length} top play${brief.topPlays.length === 1 ? "" : "s"}`;

    const sent = await Promise.all(
      recipients.map((to) => sendAlertEmail({ to, subject, html })),
    );

    return NextResponse.json({ ok: true, preview, recipients, sent, brief });
  } catch (err: unknown) {
    console.error("[jobs:email-morning-brief] Error:", err);
    return NextResponse.json(
      { error: "Morning brief email failed", detail: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}

function resolveRecipients(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input.join(",")
    : typeof input === "string"
      ? input
      : process.env.ADMIN_DAILY_BRIEF_EMAILS || process.env.OPERATOR_BRIEF_EMAILS || "wesso@marketscannerpros.app";

  return raw
    .split(",")
    .map((email) => email.trim())
    .filter((email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
}