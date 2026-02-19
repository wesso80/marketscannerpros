export interface InverseComparableTrade {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
  holdingPeriodDays: number;
}

export interface InverseComparableEquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

export interface InverseComparableResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  cagr: number;
  volatility: number;
  sortinoRatio: number;
  calmarRatio: number;
  timeInMarket: number;
  bestTrade: InverseComparableTrade | null;
  worstTrade: InverseComparableTrade | null;
  equityCurve: InverseComparableEquityPoint[];
  trades: InverseComparableTrade[];
}

export interface InverseComparisonSnapshot<T extends InverseComparableResult> {
  inverse: T;
  delta: {
    totalReturn: number;
    winRate: number;
    maxDrawdown: number;
    profitFactor: number;
  };
}

const toFinite = (value: number): number => (Number.isFinite(value) ? value : 0);

const round = (value: number, digits = 4): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const invertTrade = (trade: InverseComparableTrade): InverseComparableTrade => ({
  ...trade,
  side: trade.side === 'LONG' ? 'SHORT' : 'LONG',
  return: round(-toFinite(trade.return)),
  returnPercent: round(-toFinite(trade.returnPercent)),
});

const buildInverseEquityCurve = (trades: InverseComparableTrade[]): InverseComparableEquityPoint[] => {
  let equity = 100;
  let peak = 100;

  return trades.map((trade, index) => {
    const returnPercent = toFinite(trade.returnPercent);
    equity *= 1 + returnPercent / 100;
    peak = Math.max(peak, equity);
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;

    return {
      date: trade.exitDate || trade.entryDate || `trade-${index + 1}`,
      equity: round(equity, 6),
      drawdown: round(drawdown),
    };
  });
};

export function buildInverseBacktestResult<T extends InverseComparableResult>(base: T): T {
  const trades = base.trades.map(invertTrade);
  const totalTrades = trades.length;

  let winningTrades = 0;
  let losingTrades = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let totalReturn = 0;
  let positiveReturnSum = 0;
  let negativeReturnSum = 0;

  let bestTrade: InverseComparableTrade | null = null;
  let worstTrade: InverseComparableTrade | null = null;

  for (const trade of trades) {
    const returnValue = toFinite(trade.return);
    const returnPercent = toFinite(trade.returnPercent);

    totalReturn += returnPercent;

    if (returnPercent > 0) {
      winningTrades += 1;
      positiveReturnSum += returnPercent;
    } else if (returnPercent < 0) {
      losingTrades += 1;
      negativeReturnSum += returnPercent;
    }

    if (returnValue > 0) {
      grossProfit += returnValue;
    } else if (returnValue < 0) {
      grossLoss += Math.abs(returnValue);
    }

    if (!bestTrade || returnPercent > bestTrade.returnPercent) {
      bestTrade = trade;
    }
    if (!worstTrade || returnPercent < worstTrade.returnPercent) {
      worstTrade = trade;
    }
  }

  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
  const avgWin = winningTrades > 0 ? positiveReturnSum / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? negativeReturnSum / losingTrades : 0;
  const maxDrawdown = trades.length > 0
    ? Math.max(...buildInverseEquityCurve(trades).map((point) => point.drawdown))
    : 0;

  const inverse: T = {
    ...base,
    trades,
    equityCurve: buildInverseEquityCurve(trades),
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: round(winRate),
    totalReturn: round(totalReturn),
    maxDrawdown: round(maxDrawdown),
    profitFactor: round(grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 99 : 0),
    avgWin: round(avgWin),
    avgLoss: round(avgLoss),
    bestTrade,
    worstTrade,
    sharpeRatio: round(-toFinite(base.sharpeRatio)),
    cagr: round(-toFinite(base.cagr)),
    sortinoRatio: round(-toFinite(base.sortinoRatio)),
    calmarRatio: round(-toFinite(base.calmarRatio)),
    volatility: round(toFinite(base.volatility)),
    timeInMarket: round(toFinite(base.timeInMarket)),
  };

  return inverse;
}

export function buildInverseComparisonSnapshot<T extends InverseComparableResult>(base: T): InverseComparisonSnapshot<T> {
  const inverse = buildInverseBacktestResult(base);

  return {
    inverse,
    delta: {
      totalReturn: round(inverse.totalReturn - toFinite(base.totalReturn)),
      winRate: round(inverse.winRate - toFinite(base.winRate)),
      maxDrawdown: round(inverse.maxDrawdown - toFinite(base.maxDrawdown)),
      profitFactor: round(inverse.profitFactor - toFinite(base.profitFactor)),
    },
  };
}
