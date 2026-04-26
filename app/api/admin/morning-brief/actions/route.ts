import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { sendAlertEmail } from "@/lib/email";
import {
  buildBrokerFillSyncReport,
  buildDailyReview,
  buildMorningTradePlan,
  buildOpenRescore,
  renderDailyReviewEmail,
  saveMorningBriefSnapshot,
  saveMorningTradePlan,
  type MorningBrief,
} from "@/lib/admin/morning-brief";
import type { ScannerHit } from "@/lib/admin/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type MorningBriefAction = "run_prewake" | "trade_plan" | "open_rescore" | "broker_sync" | "review_email";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "") as MorningBriefAction;

    if (action === "run_prewake") {
      const token = process.env.CRON_SECRET || process.env.ADMIN_SECRET;
      if (!token) {
        return NextResponse.json({ error: "CRON_SECRET or ADMIN_SECRET is required to run prewake scan" }, { status: 500 });
      }
      const scanRes = await fetch(`${req.nextUrl.origin}/api/jobs/scan-universe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        cache: "no-store",
      });
      const result = await scanRes.json().catch(() => ({}));
      if (!scanRes.ok) {
        return NextResponse.json({ error: "Prewake scan failed", result }, { status: scanRes.status });
      }
      return NextResponse.json({ ok: true, action, result });
    }

    if (action === "trade_plan") {
      const brief = body.brief as MorningBrief | undefined;
      const play = body.play as ScannerHit | undefined;
      if (!brief?.briefId || !play?.symbol) {
        return NextResponse.json({ error: "brief and play are required" }, { status: 400 });
      }
      const plan = await buildMorningTradePlan(brief, play);
      await saveMorningTradePlan(plan);
      return NextResponse.json({ ok: true, action, plan });
    }

    if (action === "open_rescore") {
      const brief = body.brief as MorningBrief | undefined;
      if (!brief?.briefId) {
        return NextResponse.json({ error: "brief is required" }, { status: 400 });
      }
      const rescore = await buildOpenRescore(brief);
      await saveMorningBriefSnapshot(rescore.brief, "admin");
      return NextResponse.json({ ok: true, action, rescore });
    }

    if (action === "broker_sync") {
      const brokerSync = await buildBrokerFillSyncReport();
      return NextResponse.json({ ok: true, action, brokerSync });
    }

    if (action === "review_email") {
      const review = await buildDailyReview();
      const html = renderDailyReviewEmail(review);
      const recipients = resolveRecipients(body.to);
      const subject = `MSP Daily Review: execution ${review.sessionScore.executionScore}/100, discipline ${review.sessionScore.disciplineScore}/100`;
      const sent = await Promise.all(recipients.map((to) => sendAlertEmail({ to, subject, html })));
      return NextResponse.json({ ok: true, action, recipients, sent, review });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("[admin:morning-brief:actions] Error:", error);
    return NextResponse.json(
      { error: "Action failed", detail: error instanceof Error ? error.message : "Unknown error" },
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
