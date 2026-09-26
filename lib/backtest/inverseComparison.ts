import { buildBacktestEngineResult, type BacktestTrade, type BacktestEquityPoint } from './engine';

interface InverseComparableResult {
  initialCapital?: number;
  statisticsBasis?: { sourceBarMinutes: number; equity?: 'closed_trade_balance' | 'bar_close_mark_to_market' };
  totalReturn: number;
  winRate: number;
  maxDrawdown: number;
  profitFactor: number | null;
  trades: BacktestTrade[];
  equityCurve: BacktestEquityPoint[];
}

/**
 * When the base result is marked to market at bar closes (runStrategy's markedBalances,
 * net of estimated exit slippage and commission), mirror that marked equity for the
 * inverse so both drawdowns are on the same basis. Each bar's inverse balance is the
 * base's open + realised dollar P&L flipped: inverseCapital - (baseEquity - baseCapital).
 * On exit bars the base mark is the realised balance, so the mirrored mark equals the
 * inverse's closed-trade balance. Returns undefined for closed-trade-only bases.
 */
export function mirrorMarkedBalances(base: InverseComparableResult, initialCapital: number): Map<string, number> | undefined {
  if (base.statisticsBasis?.equity !== 'bar_close_mark_to_market' || base.equityCurve.length === 0) return undefined;
  const baseCapital = base.initialCapital != null && Number.isFinite(base.initialCapital) && base.initialCapital > 0
    ? base.initialCapital : initialCapital;
  return new Map(base.equityCurve.map(point => [point.date, initialCapital - (point.equity - baseCapital)]));
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
  // Same equity basis as the base: bar-close marked when the base is marked, closed trades otherwise.
  const markedBalances = mirrorMarkedBalances(base, initialCapital);
  const inverse = buildBacktestEngineResult(trades, base.equityCurve.map(point => point.date), initialCapital, { sourceBarMinutes: base.statisticsBasis?.sourceBarMinutes, markedBalances });
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
    /** Equity basis used for BOTH drawdowns (the Delta compares like with like). */
    drawdownBasis: inverse.statisticsBasis?.equity ?? 'closed_trade_balance',
    delta: {
      totalReturn: round(inverse.totalReturn - base.totalReturn),
      winRate: round(inverse.winRate - base.winRate),
      maxDrawdown: round(inverse.maxDrawdown - base.maxDrawdown),
      profitFactor: inverse.profitFactor != null && base.profitFactor != null
        ? round(inverse.profitFactor - base.profitFactor) : null,
    },
  };
}
