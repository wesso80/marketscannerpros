/**
 * GET  /api/admin/scan?market=EQUITIES&timeframe=15m — saved admin scan status (age, last run, running run).
 * POST /api/admin/scan  { market, timeframe?, symbols? } — manual "Rescan now".
 *
 * The rescan is overlap-protected (409 while a scan for that market+timeframe runs) and rate-limited
 * (429, one manual rescan per market per ADMIN_RESCAN_MIN_INTERVAL_SEC, default 300 s). It returns 202 at
 * once; pages poll their normal saved-result endpoints and see the new age label when it finishes.
 * Admin auth only. Research analytics — no execution.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { readSavedScan, requestManualRescan, scanStatusForResponse } from "@/lib/admin/sharedScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseMarket(v: unknown): "EQUITIES" | "CRYPTO" | null {
  const m = String(v || "EQUITIES").toUpperCase();
  return m === "EQUITIES" || m === "CRYPTO" ? m : null;
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const market = parseMarket(req.nextUrl.searchParams.get("market"));
  if (!market) return NextResponse.json({ error: "market must be EQUITIES or CRYPTO" }, { status: 400 });
  const timeframe = req.nextUrl.searchParams.get("timeframe") || "15m";
  const view = await readSavedScan({ market, timeframe });
  return NextResponse.json({ ok: true, scan: scanStatusForResponse(view) });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const market = parseMarket(body?.market);
  if (!market) return NextResponse.json({ error: "market must be EQUITIES or CRYPTO" }, { status: 400 });
  const timeframe = typeof body?.timeframe === "string" && body.timeframe ? body.timeframe : "15m";
  const symbols = Array.isArray(body?.symbols) ? body.symbols.map(String) : undefined;
  const result = await requestManualRescan({ market, timeframe, symbols });
  if (!result.ok) {
    const headers = result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : undefined;
    return NextResponse.json({ ok: false, error: result.error, retryAfterSec: result.retryAfterSec ?? null }, { status: result.status, headers });
  }
  return NextResponse.json({ ok: true, runId: result.runId, symbolsRequested: result.symbolsRequested, market, timeframe }, { status: 202 });
}
