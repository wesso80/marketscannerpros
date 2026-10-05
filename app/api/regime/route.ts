import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import type { Regime } from '@/lib/risk-governor-hard';
import { classifyMarketRegime, type MarketRegimeResult } from '@/lib/marketRegime';
import { loadRegimeOverlayInputs } from '@/lib/scoring/canonical/regimeOverlayData';
import { deriveDataQuality, derivePermission, deriveRiskLevel, type RegimeDataQuality } from '@/lib/regime/riskLevel';

export const dynamic = 'force-dynamic';

/**
 * GET /api/regime
 *
 * Market regime for the whole platform.
 *
 * The only regime source is stored market data (VIX, SPY/QQQ trend, credit
 * spreads in lib/marketRegime.ts). Account context from operator_state is a
 * separate `operatorContext` field. It never decides the regime, the risk
 * level, or the permission. When market data is unavailable the response stays
 * `available: false` with `regime: null`. There is no default regime.
 *
 * Returns (available): regime, riskLevel, permission (informational only),
 * dataQuality, basis, signals, asOf (time of the underlying data), updatedAt.
 * riskLevel and permission come from the values only; stale inputs are a
 * data-quality caution in `dataQuality` and never raise the risk level (OV-12).
 * The error path returns HTTP 503 with `available: false`.
 */

type RiskLevel = 'low' | 'moderate' | 'elevated' | 'extreme';
type Permission = 'YES' | 'CONDITIONAL' | 'NO';

interface RegimeSignal {
  source: string;
  regime: string;
  weight: number;
  stale: boolean;
  kind: 'market' | 'workspace';
  /** False when the signal is shown for context but did not decide the regime. */
  counted: boolean;
  asOf: string | null;
  detail?: string;
}

/** Account context from operator_state. Not a market regime. */
type OperatorContext = {
  riskEnvironment: string | null;
  asOf: string | null;
  stale: boolean;
};

type UnifiedRegimeResponse =
  | {
    available: true;
    basis: 'market';
    regime: Regime;
    riskLevel: RiskLevel;
    permission: Permission;
    /** Stale deciding inputs, as a caution. Does not affect riskLevel or permission. */
    dataQuality: RegimeDataQuality;
    signals: RegimeSignal[];
    /** Account context. Never used as the regime label. */
    operatorContext: OperatorContext | null;
    asOf: string | null;
    updatedAt: string;
  }
  | {
    available: false;
    regime: null;
    riskLevel: null;
    permission: null;
    signals: RegimeSignal[];
    operatorContext: OperatorContext | null;
    asOf: null;
    reason: string;
    updatedAt: string;
  };

function marketSignalFrom(market: Extract<MarketRegimeResult, { available: true }>): RegimeSignal {
  return {
    source: 'market_data',
    regime: market.regime,
    weight: 1,
    stale: market.stale,
    kind: 'market',
    counted: true,
    asOf: market.asOf,
    detail: market.reasons.join('; '),
  };
}

export async function GET(req: NextRequest) {
  const now = Date.now();
  let market: MarketRegimeResult;
  try {
    market = classifyMarketRegime(await loadRegimeOverlayInputs(), now);
  } catch (err) {
    console.warn('[regime] market inputs unavailable:', err);
    market = { available: false, reason: 'Market data unavailable: stored VIX/SPY series could not be read.' };
  }

  const session = await getSessionFromCookie();
  // Stored VIX/SPY regime is public. Account signals stay behind a session.
  if (!session?.workspaceId) {
    const updatedAt = new Date().toISOString();
    const headers = { 'Cache-Control': 'private, no-store' };
    if (market.available) {
      const marketSignal = marketSignalFrom(market);
      const riskLevel = deriveRiskLevel(market.regime);
      const response: UnifiedRegimeResponse = {
        available: true,
        basis: 'market',
        regime: market.regime,
        riskLevel,
        permission: derivePermission(riskLevel),
        dataQuality: deriveDataQuality([marketSignal]),
        signals: [marketSignal],
        operatorContext: null,
        asOf: market.asOf,
        updatedAt,
      };
      return NextResponse.json(response, { headers });
    }
    const response: UnifiedRegimeResponse = {
      available: false,
      regime: null,
      riskLevel: null,
      permission: null,
      signals: [],
      operatorContext: null,
      asOf: null,
      reason: market.reason,
      updatedAt,
    };
    return NextResponse.json(response, { headers });
  }

  try {
    const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours
    const iso = (value: unknown) => {
      const d = value ? new Date(value as string) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    };

    // Account context lives on operator_state. risk_environment is LOW / MODERATE / HIGH.
    // It is not a market regime and must not be mapped into one.
    let operatorContext: OperatorContext | null = null;
    try {
      const rows = await q<{ risk_environment: string | null; updated_at: string | null }>(
        `SELECT risk_environment, updated_at
         FROM operator_state
         WHERE workspace_id = $1
         ORDER BY updated_at DESC LIMIT 1`,
        [session.workspaceId]
      );
      if (rows.length > 0) {
        const row = rows[0];
        const age = now - new Date(row.updated_at ?? 0).getTime();
        const riskEnvironment = typeof row.risk_environment === 'string' && row.risk_environment.trim()
          ? row.risk_environment.trim()
          : null;
        operatorContext = {
          riskEnvironment,
          asOf: iso(row.updated_at),
          stale: !Number.isFinite(age) || age > STALE_THRESHOLD_MS,
        };
      }
    } catch { /* operator context is optional */ }

    const headers = { 'Cache-Control': 'private, no-store' };
    const updatedAt = new Date().toISOString();

    if (market.available) {
      const marketSignal = marketSignalFrom(market);
      const riskLevel = deriveRiskLevel(market.regime);
      const response: UnifiedRegimeResponse = {
        available: true,
        basis: 'market',
        regime: market.regime,
        riskLevel,
        permission: derivePermission(riskLevel),
        dataQuality: deriveDataQuality([marketSignal]),
        signals: [marketSignal],
        operatorContext,
        asOf: market.asOf,
        updatedAt,
      };
      return NextResponse.json(response, { headers });
    }

    const response: UnifiedRegimeResponse = {
      available: false,
      regime: null,
      riskLevel: null,
      permission: null,
      signals: [],
      operatorContext,
      asOf: null,
      reason: market.reason,
      updatedAt,
    };
    return NextResponse.json(response, { headers });
  } catch (error) {
    console.error('Unified regime error:', error);
    return NextResponse.json({
      available: false,
      regime: null,
      riskLevel: null,
      permission: null,
      signals: [],
      operatorContext: null,
      asOf: null,
      reason: 'Regime could not be computed.',
      updatedAt: new Date().toISOString(),
      error: 'Failed to compute regime',
    }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
