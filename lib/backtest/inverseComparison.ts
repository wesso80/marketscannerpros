import { buildBacktestEngineResult, type BacktestTrade, type BacktestEquityPoint } from './engine';

interface InverseComparableResult {
  initialCapital?: number;
  statisticsBasis?: { sourceBarMinutes: number };
  totalReturn: number;
  winRate: number;
  maxDrawdown: number;
  profitFactor: number | null;
  trades: BacktestTrade[];
  equityCurve: BacktestEquityPoint[];
}

/** A sign-flipped dollar-P&L sensitivity scenario, not a short execution replay. */
export function buildInverseBacktestResult(base: InverseComparableResult, initialCapital: number) {
  const trades = base.trades.map(trade => ({
    ...trade,
    side: trade.side === 'LONG' ? 'SHORT' as const : 'LONG' as const,
    direction: trade.side === 'LONG' ? 'short' as const : 'long' as const,
    return: -trade.return,
    returnPercent: -trade.returnPercent,
    mfe: undefined,
    mae: undefined,
  }));
  const inverse = buildBacktestEngineResult(trades, base.equityCurve.map(point => point.date), initialCapital, { sourceBarMinutes: base.statisticsBasis?.sourceBarMinutes });
  // Forward-run Kelly/Monte Carlo/validation are not inverse execution evidence.
  inverse.kelly = undefined;
  inverse.monteCarlo = undefined;
  return inverse;
}

export function buildInverseComparisonSnapshot(base: InverseComparableResult, initialCapital = base.initialCapital) {
  if (initialCapital == null || !Number.isFinite(initialCapital) || initialCapital <= 0) return null;
  const inverse = buildInverseBacktestResult(base, initialCapital);
  const round = (value: number) => Number(value.toFixed(4));
  return {
    inverse,
    delta: {
      totalReturn: round(inverse.totalReturn - base.totalReturn),
      winRate: round(inverse.winRate - base.winRate),
      maxDrawdown: round(inverse.maxDrawdown - base.maxDrawdown),
      profitFactor: inverse.profitFactor != null && base.profitFactor != null
        ? round(inverse.profitFactor - base.profitFactor) : null,
    },
  };
}
