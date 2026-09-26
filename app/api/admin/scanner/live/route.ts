/**
 * GET /api/admin/scanner/live — scanner feed for the admin Operator Terminal / Live Scanner.
 *
 * Serves the operator-engine hits saved by the shared admin scan (lib/admin/sharedScan.ts) instead of
 * running the engine live on every poll (~144 Alpha Vantage calls per minute with the terminal open).
 * "Rescan now" is POST /api/admin/scan (rate-limited, overlap-protected); it also logs the rescanned
 * pipelines to ai_signal_log, which this route used to do on every poll.
 *
 * Query params:
 *   ?symbols=ADA,SUI,MATIC,FET (comma-separated, optional filter)
 *   &market=CRYPTO (default) | EQUITIES
 *   &timeframe=15m (default)
 * The default universe follows the market (it used to be the crypto list even for EQUITIES, so crypto
 * tickers were looked up as US stocks).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin";
import type { ScannerHit, SystemHealth } from "@/lib/admin/types";
import { buildAdminScanContext } from "@/lib/admin/scan-context";
import { enrichHitsWithExpectancy } from "@/lib/admin/expectancy";
import { resolveAdminMarket } from "@/lib/admin/defaultAdminMarket";
import { readSavedScan, savedScanStaleAfterSec, scanStatusForResponse } from "@/lib/admin/sharedScan";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Auth gate
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    // Defaults to EQUITIES while crypto market data (OPERATOR_CG_FETCH_ENABLED) is off.
    const market = resolveAdminMarket(searchParams.get("market"));
    const timeframe = searchParams.get("timeframe") || "15m";
    const symbols = searchParams.get("symbols")
      ? searchParams.get("symbols")!.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : undefined;

    const [{ risk }, view] = await Promise.all([
      buildAdminScanContext(),
      readSavedScan({ market, timeframe, symbols }),
    ]);

    const staleAfter = savedScanStaleAfterSec();
    // Staleness from the saved packets (closed-market aware: last-session equity scans stay current while the
    // US market is shut), not raw wall-clock age.
    const staleBySymbol = new Map(view.packets.map((p) => [p.symbol.toUpperCase(), p.savedScan.stale]));
    const isCurrent = (r: (typeof view.rows)[number]) =>
      r.status === "ok" && (staleBySymbol.get(r.symbol.toUpperCase()) ?? (r.ageSec == null || r.ageSec > staleAfter)) === false;
    const current = view.rows.filter(isCurrent);
    const rawHits: ScannerHit[] = current
      .flatMap((r) => r.hits)
      .sort((a, b) => b.confidence - a.confidence);
    const hits = await enrichHitsWithExpectancy(rawHits.map((hit) => ({ ...hit, riskSource: risk.source })));
    const errors = view.rows
      .filter((r) => !isCurrent(r))
      .map((r) => ({ symbol: r.symbol, error: r.status !== "ok" ? r.error ?? r.status : `stale (${r.ageSec == null ? "never scanned" : `${Math.round(r.ageSec / 60)} min old`})` }));

    const health: SystemHealth = {
      feed: view.available && current.length > 0 ? "HEALTHY" : "DEGRADED",
      websocket: "DISCONNECTED",
      scanner: view.running ? "RUNNING" : "IDLE",
      cache: "OK",
      api: "LOW_LATENCY",
      lastScanAt: view.newestScannedAt ?? undefined,
      symbolsScanned: current.length,
      errorsCount: errors.length,
    };

    return NextResponse.json({
      hits,
      health,
      savedScan: scanStatusForResponse(view),
      meta: {
        symbolsScanned: current.length,
        errorsCount: errors.length,
        errors,
        timestamp: view.newestScannedAt,
        risk,
      },
      truth: wrapTruth({ hits }, { source: "admin:shared-saved-scan", freshness: current.length ? "delayed" : "stale", fetchedAt: view.newestScannedAt ?? undefined }),
    });
  } catch (err: unknown) {
    console.error("[admin:scanner:live] Error:", err);
    return NextResponse.json(
      { error: "Scan failed", detail: err instanceof Error ? err.message : "Unknown" },
      { status: 500 },
    );
  }
}
