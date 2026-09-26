import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, verifyCronAuth } from "@/lib/adminAuth";
import { sendAlertEmail } from "@/lib/email";
import {
  buildMorningBrief,
  cronBriefAlreadySent,
  dailyMorningBriefId,
  renderMorningBriefEmail,
  saveMorningBriefSnapshot,
} from "@/lib/admin/morning-brief";
import { resolveAdminMarket } from "@/lib/admin/defaultAdminMarket";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Daily brief email (cron `daily-operator-morning-brief`, or admin "Send now"/preview).
 *
 * - Market defaults to EQUITIES (defaultAdminMarket) when the body sends no market, whatever the crypto/CoinGecko
 *   switches say; market "CRYPTO" builds the crypto brief.
 * - The brief is built from the shared saved admin scan (fast; no live per-symbol AV loop).
 * - Cron runs are idempotent per Sydney day + market + timeframe: once today's cron brief is saved (after the
 *   email went out), a curl retry gets `{ skipped: "already_sent" }` and sends nothing. A retry that arrives while
 *   the first run is still going on this instance gets `{ skipped: "in_progress" }`. Admin sends (not cron) are
 *   not blocked; `force: true` lets a cron call resend.
 */
const cronRunsInFlight = new Set<string>();

export async function POST(req: NextRequest) {
  const isCron = verifyCronAuth(req);
  const isAdmin = isCron ? false : (await requireAdmin(req)).ok;

  if (!isCron && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const preview = Boolean(body.preview);
  const market = resolveAdminMarket(body.market);
  const timeframe = typeof body.timeframe === "string" && body.timeframe ? body.timeframe : "15m";
  const dayKey = dailyMorningBriefId(market, timeframe);
  const guard = isCron && !preview && !body.force;

  if (guard) {
    if (cronRunsInFlight.has(dayKey)) {
      return NextResponse.json({ ok: true, skipped: "in_progress", briefId: dayKey }, { status: 202 });
    }
    try {
      if (await cronBriefAlreadySent(dayKey)) {
        return NextResponse.json({ ok: true, skipped: "already_sent", briefId: dayKey });
      }
    } catch (err) {
      console.warn("[jobs:email-morning-brief] idempotency check failed; continuing:", err);
    }
    cronRunsInFlight.add(dayKey);
  }

  try {
    const recipients = resolveRecipients(body.to);
    const brief = await buildMorningBrief({
      symbols: Array.isArray(body.symbols) ? body.symbols : undefined,
      market,
      timeframe,
      scanLimit: body.scanLimit ?? (preview ? 20 : undefined),
    });
    const html = renderMorningBriefEmail(brief);
    const subject = `${preview ? "[PREVIEW] " : ""}MSP Morning Brief: ${brief.deskState} - ${brief.topPlays.length} top play${brief.topPlays.length === 1 ? "" : "s"}`;

    const sent = await Promise.all(
      recipients.map((to) => sendAlertEmail({ to, subject, html })),
    );
    // Saved after sending, so a failed send can be retried; the saved cron row is the "sent today" marker.
    const saved = preview ? brief : await saveMorningBriefSnapshot(brief, isCron ? "cron" : "email");

    return NextResponse.json({ ok: true, preview, recipients, sent, brief: saved });
  } catch (err: unknown) {
    console.error("[jobs:email-morning-brief] Error:", err);
    return NextResponse.json(
      { error: "Morning brief email failed", detail: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  } finally {
    if (guard) cronRunsInFlight.delete(dayKey);
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
