import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, verifyCronAuth } from "@/lib/adminAuth";
import { sendAlertEmail } from "@/lib/email";
import { buildDailyReview, renderDailyReviewEmail } from "@/lib/admin/morning-brief";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const isCron = verifyCronAuth(req);
  if (!isCron) {
    const admin = await requireAdmin(req);
    if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const review = await buildDailyReview();
    const html = renderDailyReviewEmail(review);
    const recipients = resolveRecipients(body.to);
    const subject = `MSP Daily Review: execution ${review.sessionScore.executionScore}/100, discipline ${review.sessionScore.disciplineScore}/100`;
    const sent = await Promise.all(recipients.map((to) => sendAlertEmail({ to, subject, html })));
    return NextResponse.json({ ok: true, recipients, sent, review });
  } catch (error) {
    console.error("[jobs:email-daily-review] Error:", error);
    return NextResponse.json(
      { error: "Daily review email failed", detail: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}

function resolveRecipients(input: unknown) {
  const explicit = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : [];
  const configured = explicit.length
    ? explicit
    : (process.env.ADMIN_DAILY_BRIEF_EMAILS || process.env.OPERATOR_BRIEF_EMAILS || "wesso@marketscannerpros.app").split(",");
  return configured.map((value) => value.trim()).filter(Boolean);
}
