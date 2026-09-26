/**
 * GET  /api/admin/morning-brief?market=EQUITIES — the newest SAVED brief for the market with its age. It never
 *      rebuilds or overwrites anything, except the very first time (no brief saved at all for the market), when it
 *      builds one from the shared saved scan and saves it as an admin brief.
 * POST /api/admin/morning-brief { market?, timeframe?, scanLimit? } — admin "Rebuild": overlap-protected (409)
 *      and rate-limited (429, ADMIN_BRIEF_REBUILD_MIN_INTERVAL_SEC, default 300 s). Built from the shared saved
 *      scan (no live per-symbol AV loop) and saved under "<day>:<market>:<tf>:admin", so the cron's saved and
 *      emailed brief is never replaced.
 * Market defaults to EQUITIES (defaultAdminMarket); market=CRYPTO builds the crypto brief.
 * Legacy: GET with ?symbols=A,B builds a live brief for that custom list and returns it WITHOUT saving it.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  buildMorningBrief,
  loadLatestMorningBrief,
  requestMorningBriefRebuild,
  saveMorningBriefSnapshot,
  type SavedMorningBrief,
} from "@/lib/admin/morning-brief";
import { resolveAdminMarket } from "@/lib/admin/defaultAdminMarket";
import { wrapTruth } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function respond(saved: SavedMorningBrief, extra: Record<string, unknown> = {}) {
  const fromSaved = saved.brief.scanSource?.kind !== "live";
  return NextResponse.json({
    ok: true,
    brief: saved.brief,
    saved: { source: saved.source, generatedAt: saved.generatedAt, ageSec: saved.ageSec, ageLabel: saved.ageLabel },
    ...extra,
    truth: wrapTruth(
      { source: "admin:morning-brief", briefId: saved.brief.briefId },
      {
        source: "admin:morning-brief",
        freshness: saved.ageSec <= 900 ? "real-time" : saved.ageSec <= 6 * 3600 ? "delayed" : "stale",
        simulated: false,
        confidence: fromSaved ? "medium" : "high",
        confidenceReason: `Saved ${saved.source} brief from ${saved.ageLabel}${fromSaved ? ", built from the shared saved admin scan" : ""}.`,
      },
    ),
  });
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const market = resolveAdminMarket(searchParams.get("market"));
    const timeframe = searchParams.get("timeframe") || "15m";
    const scanLimit = Number(searchParams.get("scanLimit") || searchParams.get("limit") || 50);
    const symbols = searchParams.get("symbols")
      ?.split(",")
      .map((symbol) => symbol.trim().toUpperCase())
      .filter(Boolean);

    if (symbols?.length) {
      // Explicit custom list: live build, returned only (never saved over the day's brief).
      const brief = await buildMorningBrief({ symbols, market, timeframe, scanLimit });
      return respond({ brief, source: "live", generatedAt: brief.generatedAt, ageSec: 0, ageLabel: "just now" }, { unsaved: true });
    }

    const latest = await loadLatestMorningBrief(market, timeframe);
    if (latest) return respond(latest);

    // First run for this market: nothing saved yet. Build once from the shared saved scan (fast, no AV loop).
    const brief = await buildMorningBrief({ market, timeframe, scanLimit });
    const saved = await saveMorningBriefSnapshot(brief, "admin");
    return respond({ brief: saved, source: "admin", generatedAt: saved.generatedAt, ageSec: 0, ageLabel: "just now" }, { bootstrapped: true });
  } catch (err: unknown) {
    console.error("[admin:morning-brief] Error:", err);
    return NextResponse.json(
      { error: "Morning brief failed", detail: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const market = resolveAdminMarket(body?.market);
  const timeframe = typeof body?.timeframe === "string" && body.timeframe ? body.timeframe : "15m";
  const scanLimit = Number.isFinite(Number(body?.scanLimit)) ? Number(body.scanLimit) : undefined;
  const result = await requestMorningBriefRebuild({ market, timeframe, scanLimit });
  if (!result.ok) {
    const headers = result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : undefined;
    return NextResponse.json(
      { ok: false, error: result.error, retryAfterSec: result.retryAfterSec ?? null },
      { status: result.status, headers },
    );
  }
  return respond(result.saved, { rebuilt: true });
}
