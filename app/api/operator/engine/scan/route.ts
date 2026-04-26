/**
 * POST /api/operator/engine/scan — Run full Operator Engine scan pipeline
 * PRIVATE — requires operator authentication (ms_auth cookie OR admin secret).
 *
 * Returns:
 *   - radar: ranked opportunities
 *   - pipelines: full pipeline detail per candidate
 *   - snapshots: decision snapshots for replay §13.1
 *   - environmentMode: current engine mode §13.6
 *   - engineVersions: all engine versions §13.2
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { requireAdmin } from '@/lib/adminAuth';
import { runScan, createScanEnvelope } from '@/lib/operator/orchestrator';
import type { ScanRequest, ScanContext } from '@/lib/operator/orchestrator';
import type { Market } from '@/types/operator';
import { alphaVantageProvider } from '@/lib/operator/market-data';
import { opsAlert } from '@/lib/opsAlerting';
import { radarState } from '@/lib/operator/radar-state';

export const runtime = 'nodejs';

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

export async function POST(req: NextRequest) {
  // Auth gate: operators only
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  try {
    const body = await req.json();
    const symbols: string[] = Array.isArray(body.symbols)
      ? body.symbols.map((s: unknown) => String(s).trim().toUpperCase()).filter(Boolean).slice(0, 50)
      : [];

    if (symbols.length === 0) {
      return NextResponse.json({ error: 'symbols array is required' }, { status: 400 });
    }

    const market: Market = body.market || 'EQUITIES';
    const timeframe: string = body.timeframe || '1D';

    const scanRequest: ScanRequest = { symbols, market, timeframe };
    const context: ScanContext = { ...DEFAULT_CONTEXT, ...body.context };

    const result = await runScan(scanRequest, context, alphaVantageProvider);

    // Update shared radar state
    radarState.liveRadar = result.radar;
    radarState.lastScanAt = new Date().toISOString();

    // Fire ops alert for actionable signals
    const actionable = result.radar.filter(r => r.permission === 'ALLOW' || r.permission === 'ALLOW_REDUCED');
    if (actionable.length > 0) {
      opsAlert({
        title: 'Operator Scan — Actionable Signals',
        message: actionable.map(r => `${r.symbol} ${r.playbook} (${r.permission} @ ${(r.confidenceScore * 100).toFixed(1)}%)`).join('\n'),
        severity: 'info',
        source: 'operator-scan',
        metadata: {
          symbolsScanned: result.symbolsScanned,
          radarCount: result.radar.length,
          actionableCount: actionable.length,
          mode: result.environmentMode,
        },
        dedupeKey: `operator-scan:${symbols.sort().join(',')}`,
      }).catch(() => { /* never block on alert failure */ });
    }

    return NextResponse.json(createScanEnvelope(result));
  } catch (err: unknown) {
    console.error('[operator:engine:scan] Error:', err);
    return NextResponse.json(
      { error: 'Scan failed', detail: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
