/**
 * GET  /api/admin/morning-brief?market=EQUITIES — the newest SAVED brief for the authenticated workspace and market with its age. It never
 *      rebuilds or overwrites anything, except the very first time (no brief saved at all for the market), when it
 *      builds one from the shared saved scan and saves it as an admin brief.
 * POST /api/admin/morning-brief { market?, timeframe?, scanLimit? } — admin "Rebuild": overlap-protected (409)
 *      and rate-limited (429, ADMIN_BRIEF_REBUILD_MIN_INTERVAL_SEC, default 300 s). Built from the shared saved
 *      scan (no live per-symbol AV loop) and saved under "<day>:<market>:<tf>:admin:workspace:<id>", so the cron's saved and
 *      emailed brief is never replaced.
 * Market defaults to EQUITIES (defaultAdminMarket); market=CRYPTO builds the crypto brief.
 * While discovery-only is on, GET reads saved briefs only; custom builds, bootstrap and POST are paused.
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

import { adminDiscoveryOnly } from '@/lib/admin/discoveryOnly';
import { adminErrorText } from '@/lib/admin/errorResponse';
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Private workspace data must never be shared by a browser/proxy cache, including failures.
function json(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', 'private, no-store');
  return NextResponse.json(body, { ...init, headers });
}

function respond(saved: SavedMorningBrief, extra: Record<string, unknown> = {}) {
  const fromSaved = saved.brief.scanSource?.kind !== "live";
  return json({
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
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return json({ error: "Unauthorized" }, { status: 403 });
  }

  if (!admin.workspaceId) return json({ error: "Workspace required" }, { status: 403 });

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
      if (adminDiscoveryOnly()) return json({ ok: false, paused: true, error: 'Custom brief builds are paused. Open the saved brief without symbols.' }, { status: 409 });
      // Explicit custom list: live build, returned only (never saved over the day's brief).
      const brief = await buildMorningBrief({ workspaceId: admin.workspaceId, symbols, market, timeframe, scanLimit });
      return respond({ brief, source: "live", generatedAt: brief.generatedAt, ageSec: 0, ageLabel: "just now" }, { unsaved: true });
    }

    const latest = await loadLatestMorningBrief(market, timeframe, Date.now(), admin.workspaceId, { readOnly: adminDiscoveryOnly() });
    if (latest) return respond(latest, { readOnly: adminDiscoveryOnly() });
    if (adminDiscoveryOnly()) return json({
      ok: false, paused: true, error: 'No saved brief is available for this workspace and market. Building a new brief is paused.',
    }, { status: 404 });

    // First run for this market: nothing saved yet. Build once from the shared saved scan (fast, no AV loop).
    const brief = await buildMorningBrief({ workspaceId: admin.workspaceId, market, timeframe, scanLimit });
    const saved = await saveMorningBriefSnapshot(brief, "admin");
    return respond({ brief: saved, source: "admin", generatedAt: saved.generatedAt, ageSec: 0, ageLabel: "just now" }, { bootstrapped: true });
  } catch (err: unknown) {
    console.error("[admin:morning-brief] Error:", err);
    return json(
      { error: "Morning brief failed", detail: adminErrorText(err, '/api/admin/morning-brief') },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return json({ error: "Unauthorized" }, { status: 403 });
  }
  if (!admin.workspaceId) return json({ error: "Workspace required" }, { status: 403 });
  if (adminDiscoveryOnly()) return json({ ok: false, paused: true, error: 'Morning Brief rebuilds are paused.' }, { status: 409 });
  const body = await req.json().catch(() => ({}));
  const market = resolveAdminMarket(body?.market);
  const timeframe = typeof body?.timeframe === "string" && body.timeframe ? body.timeframe : "15m";
  const scanLimit = Number.isFinite(Number(body?.scanLimit)) ? Number(body.scanLimit) : undefined;
  const result = await requestMorningBriefRebuild({ workspaceId: admin.workspaceId, market, timeframe, scanLimit });
  if (!result.ok) {
    const headers = result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : undefined;
    return json(
      { ok: false, error: result.error, retryAfterSec: result.retryAfterSec ?? null },
      { status: result.status, headers },
    );
  }
  return respond(result.saved, { rebuilt: true });
}
