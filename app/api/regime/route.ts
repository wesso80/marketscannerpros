import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import type { Regime } from '@/lib/risk-governor-hard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/regime
 * 
 * Unified regime endpoint — single source of truth for the entire platform.
 * Aggregates all regime signals into one canonical response that all tools can consume.
 * 
 * Returns:
 * - regime: canonical Regime type (TREND_UP, TREND_DOWN, RANGE_NEUTRAL, VOL_EXPANSION, VOL_CONTRACTION, RISK_OFF_STRESS)
 * - riskLevel: 'low' | 'moderate' | 'elevated' | 'extreme'
 * - permission: 'YES' | 'CONDITIONAL' | 'NO'
 * - sizing: 'full' | 'reduced' | 'probe' | 'none'
 * - signals: array of individual signal sources
 * - updatedAt: ISO timestamp
 */

type RiskLevel = 'low' | 'moderate' | 'elevated' | 'extreme';
type Permission = 'YES' | 'CONDITIONAL' | 'NO';
type Sizing = 'full' | 'reduced' | 'probe' | 'none';

interface RegimeSignal {
  source: string;
  regime: string;
  weight: number;
  stale: boolean;
}

interface UnifiedRegimeResponse {
  regime: Regime;
  riskLevel: RiskLevel;
  permission: Permission;
  sizing: Sizing;
  signals: RegimeSignal[];
  updatedAt: string;
}

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

function derivePermission(regime: Regime, riskLevel: RiskLevel): Permission {
  if (riskLevel === 'extreme') return 'NO';
  if (riskLevel === 'elevated' || regime === 'TREND_DOWN') return 'CONDITIONAL';
  return 'YES';
}

function deriveSizing(permission: Permission, riskLevel: RiskLevel): Sizing {
  if (permission === 'NO') return 'none';
  if (riskLevel === 'elevated') return 'probe';
  if (permission === 'CONDITIONAL') return 'reduced';
  return 'full';
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const signals: RegimeSignal[] = [];
    const now = Date.now();
    const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

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
        signals.push({
          source: 'operator_context',
          regime: regimeStr,
          weight: 3,
          stale: age > STALE_THRESHOLD_MS,
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
        signals.push({
          source: 'risk_governor',
          regime: row.risk_mode || 'neutral',
          weight: 2,
          stale: age > STALE_THRESHOLD_MS,
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
          signals.push({
            source: 'journal_drawdown',
            regime: 'risk_off',
            weight: 2,
            stale: false,
          });
        }
      }
    } catch { /* journal may not exist */ }

    // Compute weighted regime consensus
    let canonicalRegime: Regime = 'RANGE_NEUTRAL';
    if (signals.length > 0) {
      const regimeCounts: Record<Regime, number> = {
        'TREND_UP': 0, 'TREND_DOWN': 0, 'RANGE_NEUTRAL': 0,
        'VOL_EXPANSION': 0, 'VOL_CONTRACTION': 0, 'RISK_OFF_STRESS': 0,
      };
      for (const sig of signals) {
        const mapped = mapToCanonicalRegime(sig.regime);
        regimeCounts[mapped] += sig.weight;
      }
      const maxEntry = Object.entries(regimeCounts).reduce((a, b) => b[1] > a[1] ? b : a);
      canonicalRegime = maxEntry[0] as Regime;
    }

    const riskLevel = deriveRiskLevel(canonicalRegime, signals);
    const permission = derivePermission(canonicalRegime, riskLevel);
    const sizing = deriveSizing(permission, riskLevel);

    const response: UnifiedRegimeResponse = {
      regime: canonicalRegime,
      riskLevel,
      permission,
      sizing,
      signals,
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Unified regime error:', error);
    // Return safe defaults on error
    return NextResponse.json({
      regime: 'RANGE_NEUTRAL' as Regime,
      riskLevel: 'moderate' as RiskLevel,
      permission: 'CONDITIONAL' as Permission,
      sizing: 'reduced' as Sizing,
      signals: [],
      updatedAt: new Date().toISOString(),
      error: 'Failed to compute regime — using safe defaults',
    });
  }
}
