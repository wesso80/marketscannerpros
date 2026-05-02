import type { FuturesSessionState } from '@/lib/terminal/futures/futuresSessionEngine';

export type ParticipationRegime = 'rth_dominant' | 'balanced' | 'overnight_dominant' | 'maintenance';

export type FuturesLiquidityParticipation = {
  symbol: string;
  regime: ParticipationRegime;
  liquidityScore: number;
  participationScore: number;
  confidence: 'low' | 'moderate';
  summary: string;
  notes: string[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function classify(session: FuturesSessionState): {
  regime: ParticipationRegime;
  liquidity: number;
  participation: number;
  summary: string;
} {
  switch (session.currentSession) {
    case 'rth':
      return {
        regime: 'rth_dominant',
        liquidity: 82,
        participation: 84,
        summary: 'RTH participation profile is typically strongest for depth and two-way flow.',
      };
    case 'pre_rth':
      return {
        regime: 'balanced',
        liquidity: 66,
        participation: 68,
        summary: 'Pre-RTH transition usually improves participation ahead of the cash open.',
      };
    case 'post_rth':
      return {
        regime: 'balanced',
        liquidity: 63,
        participation: 59,
        summary: 'Post-RTH often remains tradable but thins relative to peak session participation.',
      };
    case 'globex_overnight':
      return {
        regime: 'overnight_dominant',
        liquidity: 48,
        participation: 44,
        summary: 'Overnight Globex can be directional, with shallower participation than RTH.',
      };
    case 'maintenance_break':
      return {
        regime: 'maintenance',
        liquidity: 12,
        participation: 10,
        summary: 'Maintenance window: participation and executable depth can be materially reduced.',
      };
    case 'closed':
    default:
      return {
        regime: 'maintenance',
        liquidity: 5,
        participation: 4,
        summary: 'Closed window: no active regular participation profile is available.',
      };
  }
}

export function estimateFuturesLiquidityParticipation(
  symbol: string,
  session: FuturesSessionState,
): FuturesLiquidityParticipation {
  const base = classify(session);
  const isIndexFuture = /^\/(ES|MES|NQ|MNQ|YM|RTY|M2K)/.test(symbol.toUpperCase());
  const liquidityAdj = isIndexFuture ? 4 : 0;
  const participationAdj = isIndexFuture ? 3 : 0;

  return {
    symbol,
    regime: base.regime,
    liquidityScore: clamp(base.liquidity + liquidityAdj, 0, 100),
    participationScore: clamp(base.participation + participationAdj, 0, 100),
    confidence: 'low',
    summary: base.summary,
    notes: [
      'Session-context estimate only; not derived from live order book or tape.',
      'Use this panel as educational timing context, not execution guidance.',
    ],
  };
}
