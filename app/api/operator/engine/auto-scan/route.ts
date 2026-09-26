/**
 * POST /api/operator/engine/auto-scan — trigger the shared saved admin scan
 * GET  /api/operator/engine/auto-scan — saved radar for a watchlist
 *
 * The nine admin-radar-equity-* Render crons POST here. Each POST now starts the shared scan job
 * (lib/admin/sharedScan.ts) for the watchlist's market across the whole admin universe; symbols
 * checked within the last ADMIN_SCAN_MAX_AGE_MIN minutes are not fetched again, so staggered crons no
 * longer re-fetch the same names, and a POST that arrives while a run is in progress is a no-op.
 * The radar is read from admin_scan_results (persisted), not from process memory, so it survives
 * restarts and is the same on every instance.
 *
 * Body: { watchlist: string, timeframe?: string }
 * @internal PRIVATE — operator auth required
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { requireAdmin, verifyCronAuth } from '@/lib/adminAuth';
import type { RadarOpportunity } from '@/types/operator';
import { DEFAULT_WATCHLISTS } from '@/lib/operator/watchlists';
import { detachRun, readSavedScan, savedScanStaleAfterSec, startSharedScan, type StartSharedScanResult } from '@/lib/admin/sharedScan';
import { loadRecentRadarChanges } from '@/lib/admin/sharedScanStore';

export const runtime = 'nodejs';
export const maxDuration = 60;

const DEFAULT_WATCHLIST = 'us-mega-cap';
const DEFAULT_TIMEFRAME = '15m';

/** Scan requests handled by this process (display only). */
let totalScans = 0;

/* ── Auth helper ────────────────────────────────────────────── */

async function checkAuth(req: NextRequest): Promise<boolean> {
  // Cron-driven server scan (Render cron) — no browser tab required.
  if (verifyCronAuth(req)) return true;
  const adminAuth = (await requireAdmin(req)).ok;
  if (adminAuth) return true;
  const session = await getSessionFromCookie();
  return !!(session && isOperator(session.cid, session.workspaceId));
}

/* ── Saved state for a watchlist ────────────────────────────── */

async function savedState(watchlistKey: string, timeframe: string) {
  const wl = DEFAULT_WATCHLISTS[watchlistKey] ?? DEFAULT_WATCHLISTS[DEFAULT_WATCHLIST];
  const view = await readSavedScan({ market: wl.market as 'EQUITIES' | 'CRYPTO', timeframe, symbols: wl.symbols });
  const staleAfter = savedScanStaleAfterSec();
  const wlSymbols = new Set(wl.symbols.map((s) => s.toUpperCase()));
  const liveRadar: RadarOpportunity[] = view.rows
    .filter((r) => r.status === 'ok' && r.ageSec != null && r.ageSec <= staleAfter)
    .flatMap((r) => r.radar)
    .sort((a, b) => b.confidenceScore - a.confidenceScore);
  const radarHistory = view.available
    ? (await loadRecentRadarChanges(timeframe, 400).catch(() => [])).filter((c) => wlSymbols.has(c.symbol)).slice(-200)
    : [];
  const lastRun = view.lastRun;
  return {
    active: !!view.running,
    watchlistKey,
    timeframe,
    lastScanAt: view.newestScannedAt,
    lastScanDurationMs: lastRun?.startedAt && lastRun.finishedAt ? Date.parse(lastRun.finishedAt) - Date.parse(lastRun.startedAt) : 0,
    symbolsScanned: view.rows.filter((r) => r.scannedAt).length,
    totalScans,
    liveRadar,
    radarHistory,
    errors: view.rows.filter((r) => r.status !== 'ok').map((r) => ({ symbol: r.symbol, error: r.error ?? r.status })),
    savedScan: {
      available: view.available,
      message: view.message ?? null,
      ageSec: view.ageSec,
      ageLabel: view.ageLabel,
      oldestScannedAt: view.oldestScannedAt,
      lastRun,
      running: view.running,
    },
    watchlistInfo: wl,
    availableWatchlists: Object.entries(DEFAULT_WATCHLISTS).map(([key, w]) => ({
      key,
      name: w.name,
      market: w.market,
      symbolCount: w.symbols.length,
    })),
  };
}

/* ── GET: saved radar ───────────────────────────────────────── */

export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  const watchlistKey = req.nextUrl.searchParams.get('watchlist') || DEFAULT_WATCHLIST;
  const timeframe = req.nextUrl.searchParams.get('timeframe') || DEFAULT_TIMEFRAME;
  return NextResponse.json({ ok: true, data: await savedState(watchlistKey, timeframe) });
}

/* ── POST: start the shared scan ────────────────────────────── */

export async function POST(req: NextRequest) {
  const isCron = verifyCronAuth(req);
  if (!isCron && !(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const watchlistKey = typeof body.watchlist === 'string' ? body.watchlist : DEFAULT_WATCHLIST;
    const timeframe = typeof body.timeframe === 'string' && body.timeframe ? body.timeframe : DEFAULT_TIMEFRAME;

    const wl = DEFAULT_WATCHLISTS[watchlistKey];
    if (!wl) {
      return NextResponse.json({
        error: 'Unknown watchlist',
        availableWatchlists: Object.keys(DEFAULT_WATCHLISTS),
      }, { status: 400 });
    }

    const start: StartSharedScanResult = await startSharedScan({
      market: wl.market as 'EQUITIES' | 'CRYPTO',
      timeframe,
      trigger: isCron ? 'radar' : 'page',
    });
    if (!start.started && start.reason === 'error') {
      return NextResponse.json({ error: 'Auto-scan failed', detail: start.message }, { status: 500 });
    }
    detachRun(start);
    totalScans++;

    const data = await savedState(watchlistKey, timeframe);
    return NextResponse.json({
      ok: true,
      data: {
        ...data,
        scanResult: {
          requestId: start.started ? start.runId : null,
          started: start.started,
          skipped: start.started ? null : start.reason,
          message: start.started ? 'Shared scan started; results are saved as each symbol completes.' : start.message,
          symbolsScanned: data.symbolsScanned,
          radarCount: data.liveRadar.length,
          errorCount: data.errors.length,
          durationMs: data.lastScanDurationMs,
        },
      },
    });
  } catch (err: unknown) {
    console.error('[operator:auto-scan] Error:', err);
    return NextResponse.json(
      { error: 'Auto-scan failed', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
