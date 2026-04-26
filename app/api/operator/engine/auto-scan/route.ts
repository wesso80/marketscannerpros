/**
 * POST /api/operator/engine/auto-scan — Run auto-scan against a named watchlist
 * GET  /api/operator/engine/auto-scan — Get current auto-scan state & latest results
 *
 * The auto-scan stores latest results in memory so the dashboard can poll.
 * Each POST triggers a full scan of the selected watchlist.
 *
 * Body: { watchlist: string, timeframe?: string }
 * @internal PRIVATE — operator auth required
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { requireAdmin } from '@/lib/adminAuth';
import { runScan, createScanEnvelope } from '@/lib/operator/orchestrator';
import type { ScanContext } from '@/lib/operator/orchestrator';
import type { Market, RadarOpportunity } from '@/types/operator';
import { alphaVantageProvider } from '@/lib/operator/market-data';
import { DEFAULT_WATCHLISTS } from '@/lib/operator/watchlists';
import { opsAlert } from '@/lib/opsAlerting';
import { radarState } from '@/lib/operator/radar-state';

export const runtime = 'nodejs';
export const maxDuration = 60;

/* ── In-memory auto-scan state ──────────────────────────────── */

interface AutoScanState {
  active: boolean;
  watchlistKey: string;
  timeframe: string;
  lastScanAt: string | null;
  lastScanDurationMs: number;
  symbolsScanned: number;
  totalScans: number;
  /** Cumulative radar — best opportunity per symbol, updated each scan */
  liveRadar: RadarOpportunity[];
  /** History of when symbols first appeared / disappeared */
  radarHistory: { timestamp: string; symbol: string; action: 'appeared' | 'dropped'; permission: string; confidence: number }[];
  errors: { symbol: string; error: string }[];
}

const autoState: AutoScanState = {
  active: false,
  watchlistKey: 'us-mega-cap',
  timeframe: '1D',
  lastScanAt: null,
  lastScanDurationMs: 0,
  symbolsScanned: 0,
  totalScans: 0,
  liveRadar: [],
  radarHistory: [],
  errors: [],
};

const DEFAULT_CONTEXT: ScanContext = {
  portfolioState: {
    equity: 100000,
    dailyPnl: 0,
    drawdownPct: 0,
    openRisk: 0,
    correlationRisk: 0,
    activePositions: 0,
    killSwitchActive: false,
  },
  riskPolicy: {
    maxDailyLossPct: 0.02,
    maxDrawdownPct: 0.06,
    maxOpenRiskPct: 0.05,
    maxCorrelationRisk: 0.7,
  },
  executionEnvironment: {
    brokerConnected: true,
    estimatedSlippageBps: 10,
    minLiquidityOk: true,
  },
  accountState: {
    buyingPower: 100000,
    accountRiskUnit: 0.01,
  },
  instrumentMeta: {},
  healthContext: {
    symbolTrustScore: 0.7,
    playbookHealthScore: 0.7,
    modelHealthScore: 0.7,
  },
  metaHealthThrottle: 1.0,
};

/* ── Auth helper ────────────────────────────────────────────── */

async function checkAuth(req: NextRequest): Promise<boolean> {
  const adminAuth = (await requireAdmin(req)).ok;
  if (adminAuth) return true;
  const session = await getSessionFromCookie();
  return !!(session && isOperator(session.cid, session.workspaceId));
}

/* ── GET: poll for latest state ─────────────────────────────── */

export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    data: {
      ...autoState,
      watchlistInfo: DEFAULT_WATCHLISTS[autoState.watchlistKey] ?? null,
      availableWatchlists: Object.entries(DEFAULT_WATCHLISTS).map(([key, wl]) => ({
        key,
        name: wl.name,
        market: wl.market,
        symbolCount: wl.symbols.length,
      })),
    },
  });
}

/* ── POST: trigger a scan cycle ─────────────────────────────── */

export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const watchlistKey = typeof body.watchlist === 'string' ? body.watchlist : autoState.watchlistKey;
    const timeframe = typeof body.timeframe === 'string' ? body.timeframe : autoState.timeframe;

    const wl = DEFAULT_WATCHLISTS[watchlistKey];
    if (!wl) {
      return NextResponse.json({
        error: 'Unknown watchlist',
        availableWatchlists: Object.keys(DEFAULT_WATCHLISTS),
      }, { status: 400 });
    }

    // Update state
    autoState.active = true;
    autoState.watchlistKey = watchlistKey;
    autoState.timeframe = timeframe;

    const start = Date.now();

    // Run the scan across all watchlist symbols
    const result = await runScan(
      { symbols: wl.symbols, market: wl.market, timeframe },
      DEFAULT_CONTEXT,
      alphaVantageProvider,
    );

    const duration = Date.now() - start;

    // Track radar changes (appeared / dropped)
    const prevSymbols = new Set(autoState.liveRadar.map(r => r.symbol));
    const newSymbols = new Set(result.radar.map(r => r.symbol));
    const now = new Date().toISOString();

    for (const r of result.radar) {
      if (!prevSymbols.has(r.symbol)) {
        autoState.radarHistory.push({
          timestamp: now,
          symbol: r.symbol,
          action: 'appeared',
          permission: r.permission,
          confidence: r.confidenceScore,
        });
      }
    }
    for (const prev of autoState.liveRadar) {
      if (!newSymbols.has(prev.symbol)) {
        autoState.radarHistory.push({
          timestamp: now,
          symbol: prev.symbol,
          action: 'dropped',
          permission: prev.permission,
          confidence: prev.confidenceScore,
        });
      }
    }

    // Keep history bounded
    if (autoState.radarHistory.length > 200) {
      autoState.radarHistory = autoState.radarHistory.slice(-200);
    }

    // Update state
    autoState.liveRadar = result.radar;
    autoState.errors = result.errors;
    autoState.lastScanAt = now;
    autoState.lastScanDurationMs = duration;
    autoState.symbolsScanned = result.symbolsScanned;
    autoState.totalScans++;

    // Sync to shared radar state for GET /api/operator/engine/radar
    radarState.liveRadar = result.radar;
    radarState.lastScanAt = now;

    // Fire ops alert for new radar appearances
    const newAppearances = autoState.radarHistory.filter(h => h.timestamp === now && h.action === 'appeared');
    if (newAppearances.length > 0) {
      opsAlert({
        title: `Auto-Scan — ${newAppearances.length} New Signal(s)`,
        message: newAppearances.map(a => `${a.symbol} (${a.permission} @ ${(a.confidence * 100).toFixed(1)}%)`).join('\n'),
        severity: 'info',
        source: 'auto-scan',
        metadata: {
          watchlist: watchlistKey,
          symbolsScanned: result.symbolsScanned,
          totalRadar: result.radar.length,
          durationMs: duration,
          scanNumber: autoState.totalScans,
        },
      }).catch(() => { /* never block on alert failure */ });
    }

    return NextResponse.json({
      ok: true,
      data: {
        ...autoState,
        watchlistInfo: wl,
        scanResult: {
          requestId: result.requestId,
          environmentMode: result.environmentMode,
          engineVersions: result.engineVersions,
          symbolsScanned: result.symbolsScanned,
          radarCount: result.radar.length,
          errorCount: result.errors.length,
          durationMs: duration,
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
