import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import type { Regime } from '@/lib/risk-governor-hard';
import { classifyMarketRegime, type MarketRegimeResult } from '@/lib/marketRegime';
import { loadRegimeOverlayInputs } from '@/lib/scoring/canonical/regimeOverlayData';

export const dynamic = 'force-dynamic';

/**
 * GET /api/regime
 *
 * Market regime for the whole platform.
 *
 * Basis, in order:
 *  1. market: VIX, SPY/QQQ trend and credit spreads already stored by the app
 *     (lib/marketRegime.ts). When available this decides the regime; account
 *     signals are still listed but marked `counted: false`.
 *  2. workspace: only when market data is unavailable, the account's own signals
 *     (operator context, risk governor snapshot, journal drawdown) are combined.
 *  3. neither: `available: false` with `regime: null` and a reason. There is no
 *     default regime.
 *
 * Returns (available): regime, riskLevel, permission (informational only),
 * basis, signals, asOf (time of the underlying data), updatedAt.
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

type UnifiedRegimeResponse =
  | {
    available: true;
    basis: 'market' | 'workspace';
    regime: Regime;
    riskLevel: RiskLevel;
    permission: Permission;
    signals: RegimeSignal[];
    asOf: string | null;
    updatedAt: string;
  }
  | {
    available: false;
    regime: null;
    riskLevel: null;
    permission: null;
    signals: RegimeSignal[];
    asOf: null;
    reason: string;
    updatedAt: string;
  };

function mapToCanonicalRegime(riskEnv: string): Regime {
  const n = (riskEnv || '').toLowerCase();
  if (n.includes('risk_off') || n.includes('stress') || n.includes('dislocation')) return 'RISK_OFF_STRESS';
  if (n.includes('trend_down') || n.includes('bear') || n.includes('bearish')) return 'TREND_DOWN';
  if (n.includes('trend_up') || n.includes('bull') || n.includes('bullish') || n.includes('risk_on') || n.includes('risk-on')) return 'TREND_UP';
  if (n.includes('expansion') || n.includes('high_vol') || n.includes('vol_expansion') || n.includes('volatile')) return 'VOL_EXPANSION';
  if (n.includes('compression') || n.includes('low_vol') || n.includes('vol_contraction')) return 'VOL_CONTRACTION';
  if (n.includes('range') || n.includes('neutral') || n.includes('chop') || n.includes('sideways')) return 'RANGE_NEUTRAL';
  return 'RANGE_NEUTRAL';
}

function deriveRiskLevel(regime: Regime, signals: RegimeSignal[]): RiskLevel {
  if (regime === 'RISK_OFF_STRESS') return 'extreme';
  if (regime === 'VOL_EXPANSION') return 'elevated';
  const staleCount = signals.filter(s => s.stale).length;
  if (staleCount > signals.length / 2) return 'elevated'; // too many stale signals
  if (regime === 'TREND_DOWN') return 'moderate';
  return 'low';
}

/**
 * Informational regime posture — NOT a trade gate (no scoring or authorization path may consume it).
 * Direction-neutral: a down-trend is not riskier than an up-trend for a strategy that can go short, so TREND_DOWN no
 * longer implies CONDITIONAL. Only the risk level (stress / volatility / drawdown signals) tightens it.
 */
function derivePermission(_regime: Regime, riskLevel: RiskLevel): Permission {
  if (riskLevel === 'extreme') return 'NO';
  if (riskLevel === 'elevated') return 'CONDITIONAL';
  return 'YES';
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const workspaceSignals: RegimeSignal[] = [];
    const now = Date.now();
    const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours
    const iso = (value: unknown) => {
      const d = value ? new Date(value as string) : null;
      return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
    };

    // Market data (shared, cached 15 minutes; reads only stored series).
    let market: MarketRegimeResult;
    try {
      market = classifyMarketRegime(await loadRegimeOverlayInputs(), now);
    } catch (err) {
      console.warn('[regime] market inputs unavailable:', err);
      market = { available: false, reason: 'Market data unavailable: stored VIX/SPY series could not be read.' };
    }

    // Signal 1: Operator context state (from DB — written by tools like Macro, Commodities, etc.)
    try {
      const rows = await q(
        `SELECT risk_environment, context_state, updated_at 
         FROM context_state 
         WHERE workspace_id = $1 
         ORDER BY updated_at DESC LIMIT 1`,
        [session.workspaceId]
      );
      if (rows.length > 0) {
        const row = rows[0];
        const age = now - new Date(row.updated_at).getTime();
        const regimeStr = row.risk_environment || row.context_state?.regime || 'neutral';
        workspaceSignals.push({
          source: 'operator_context',
          regime: regimeStr,
          weight: 3,
          stale: age > STALE_THRESHOLD_MS,
          kind: 'workspace',
          counted: true,
          asOf: iso(row.updated_at),
        });
      }
    } catch { /* context_state table may not exist */ }

    // Signal 2: Risk governor snapshot (from risk preferences/cookies — lightweight)
    try {
      const riskRows = await q(
        `SELECT risk_mode, data_health, updated_at 
         FROM risk_governor_snapshots 
         WHERE workspace_id = $1 
         ORDER BY updated_at DESC LIMIT 1`,
        [session.workspaceId]
      );
      if (riskRows.length > 0) {
        const row = riskRows[0];
        const age = now - new Date(row.updated_at).getTime();
        workspaceSignals.push({
          source: 'risk_governor',
          regime: row.risk_mode || 'neutral',
          weight: 2,
          stale: age > STALE_THRESHOLD_MS,
          kind: 'workspace',
          counted: true,
          asOf: iso(row.updated_at),
        });
      }
    } catch { /* table may not exist */ }

    // Signal 3: Recent journal performance (drawdown indicator)
    try {
      const journalRows = await q(
        `SELECT outcome, r_multiple FROM journal_entries 
         WHERE workspace_id = $1 AND created_at > NOW() - INTERVAL '7 days'
         ORDER BY created_at DESC LIMIT 20`,
        [session.workspaceId]
      );
      if (journalRows.length >= 3) {
        const losses = journalRows.filter((r: any) => r.outcome === 'loss' || (r.r_multiple && r.r_multiple < 0));
        const consecutiveLosses = journalRows.findIndex((r: any) => r.outcome !== 'loss' && !(r.r_multiple && r.r_multiple < 0));
        if (consecutiveLosses >= 3 || losses.length > journalRows.length * 0.7) {
          workspaceSignals.push({
            source: 'journal_drawdown',
            regime: 'risk_off',
            weight: 2,
            stale: false,
            kind: 'workspace',
            counted: true,
            asOf: null,
          });
        }
      }
    } catch { /* journal may not exist */ }

    const headers = { 'Cache-Control': 'private, max-age=15, stale-while-revalidate=30' };
    const updatedAt = new Date().toISOString();

    if (market.available) {
      // Market data decides the market regime; account signals are context only.
      const marketSignal: RegimeSignal = {
        source: 'market_data',
        regime: market.regime,
        weight: 1,
        stale: market.stale,
        kind: 'market',
        counted: true,
        asOf: market.asOf,
        detail: market.reasons.join('; '),
      };
      const signals = [marketSignal, ...workspaceSignals.map((sig) => ({ ...sig, counted: false }))];
      const riskLevel = deriveRiskLevel(market.regime, [marketSignal]);
      const response: UnifiedRegimeResponse = {
        available: true,
        basis: 'market',
        regime: market.regime,
        riskLevel,
        permission: derivePermission(market.regime, riskLevel),
        signals,
        asOf: market.asOf,
        updatedAt,
      };
      return NextResponse.json(response, { headers });
    }

    if (workspaceSignals.length > 0) {
      // No market data: fall back to this account's own signals (weighted consensus).
      const regimeCounts: Record<Regime, number> = {
        'TREND_UP': 0, 'TREND_DOWN': 0, 'RANGE_NEUTRAL': 0,
        'VOL_EXPANSION': 0, 'VOL_CONTRACTION': 0, 'RISK_OFF_STRESS': 0,
      };
      for (const sig of workspaceSignals) {
        regimeCounts[mapToCanonicalRegime(sig.regime)] += sig.weight;
      }
      const canonicalRegime = Object.entries(regimeCounts).reduce((a, b) => b[1] > a[1] ? b : a)[0] as Regime;
      const riskLevel = deriveRiskLevel(canonicalRegime, workspaceSignals);
      const dated = workspaceSignals.map((sig) => sig.asOf).filter((v): v is string => Boolean(v)).sort();
      const response: UnifiedRegimeResponse = {
        available: true,
        basis: 'workspace',
        regime: canonicalRegime,
        riskLevel,
        permission: derivePermission(canonicalRegime, riskLevel),
        signals: workspaceSignals,
        asOf: dated.length ? dated[dated.length - 1] : null,
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
      asOf: null,
      reason: `${market.reason} No account signals are available either.`,
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
      asOf: null,
      reason: 'Regime could not be computed.',
      updatedAt: new Date().toISOString(),
      error: 'Failed to compute regime',
    }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
