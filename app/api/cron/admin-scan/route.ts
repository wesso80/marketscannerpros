/**
 * POST /api/cron/admin-scan — run the shared saved admin scan (lib/admin/sharedScan.ts).
 *
 * Body: { "market"?: "EQUITIES" | "CRYPTO" (default EQUITIES), "timeframe"?: string (default "15m") }
 * Auth: CRON_SECRET (x-cron-secret or Bearer). Returns immediately; the run continues in the background.
 * A run already in progress for the same market+timeframe is reported as skipped (HTTP 200, so curl's
 * --retry does not re-fire it). Intended as the single scheduled entry point once brad retires the nine
 * admin-radar-equity-* crons (they now call the same job, so nothing breaks while both exist).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/adminAuth";
import { detachRun, startSharedScan } from "@/lib/admin/sharedScan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!verifyCronAuth(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const market = String(body?.market || "EQUITIES").toUpperCase();
  if (market !== "EQUITIES" && market !== "CRYPTO") {
    return NextResponse.json({ ok: false, error: "market must be EQUITIES or CRYPTO" }, { status: 400 });
  }
  const timeframe = typeof body?.timeframe === "string" && body.timeframe ? body.timeframe : "15m";
  const result = await startSharedScan({ market, timeframe, trigger: "cron" });
  if (result.started) {
    detachRun(result);
    return NextResponse.json({ ok: true, started: true, runId: result.runId, symbolsRequested: result.symbolsRequested, market, timeframe });
  }
  if (result.reason === "error") return NextResponse.json({ ok: false, error: result.message }, { status: 500 });
  return NextResponse.json({ ok: true, started: false, skipped: result.reason, message: result.message, market, timeframe });
}
