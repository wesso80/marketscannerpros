export interface BacktestTrade {
  entryDate: string;
  exitDate: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  direction?: 'long' | 'short';
  entryTs?: string;
  exitTs?: string;
  entry: number;
  exit: number;
  return: number;
  returnPercent: number;
  mfe?: number;
  mae?: number;
  exitReason?: 'stop' | 'target' | 'timeout' | 'signal_flip' | 'manual' | 'end_of_data';
  holdingPeriodDays: number;
}

export interface BacktestValidation {
  status: 'validated' | 'invalidated' | 'mixed';
  direction: 'bullish' | 'bearish' | 'both';
  reason: string;
  suggestedAlternatives?: Array<{ strategyId: string; why: string }>;
}

export interface BacktestDataCoverage {
  requested: { startDate?: string; endDate?: string };
  applied: { startDate: string; endDate: string };
  minAvailable: string;
  maxAvailable: string;
  bars: number;
  provider: 'alpha_vantage' | 'binance' | 'coingecko';
  notes?: string;
}

export interface BacktestEquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

export interface BacktestEngineResult {
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
  bestTrade: BacktestTrade | null;
  worstTrade: BacktestTrade | null;
  equityCurve: BacktestEquityPoint[];
  trades: BacktestTrade[];
  validation?: BacktestValidation;
  dataCoverage?: BacktestDataCoverage;
  diagnostics?: unknown;
}

export function createEmptyBacktestResult(): BacktestEngineResult {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRate: 0,
    totalReturn: 0,
    maxDrawdown: 0,
    sharpeRatio: 0,
    profitFactor: 0,
    avgWin: 0,
    avgLoss: 0,
    cagr: 0,
    volatility: 0,
    sortinoRatio: 0,
    calmarRatio: 0,
    timeInMarket: 0,
    bestTrade: null,
    worstTrade: null,
    equityCurve: [],
    trades: [],
  };
}

export function buildBacktestEngineResult(trades: BacktestTrade[], dates: string[], initialCapital: number): BacktestEngineResult {
  if (trades.length === 0) {
    return createEmptyBacktestResult();
  }

  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.return > 0).length;
  const losingTrades = trades.filter(t => t.return <= 0).length;
  const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

  const totalReturn = trades.reduce((sum, t) => sum + t.return, 0);
  const totalReturnPercent = (totalReturn / initialCapital) * 100;

  let equity = initialCapital;
  let peak = initialCapital;
  let maxDrawdown = 0;
  const equityCurve: BacktestEquityPoint[] = [];

  const exitReturnsByDate = trades.reduce<Record<string, number>>((acc, trade) => {
    acc[trade.exitDate] = (acc[trade.exitDate] || 0) + trade.return;
    return acc;
  }, {});

  dates.forEach(date => {
    if (exitReturnsByDate[date] !== undefined) {
      equity += exitReturnsByDate[date];
    }

    if (equity > peak) {
      peak = equity;
    }

    const drawdown = ((peak - equity) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    equityCurve.push({ date, equity, drawdown });
  });

  const endingEquity = equityCurve[equityCurve.length - 1]?.equity || initialCapital;
  const tradingDays = equityCurve.length;

  const equityReturns = equityCurve.slice(1).map((point, idx) => {
    const prev = equityCurve[idx].equity;
    return ((point.equity - prev) / prev) * 100;
  });

  const avgReturn = equityReturns.reduce((a, b) => a + b, 0) / (equityReturns.length || 1);
  const stdDev = Math.sqrt(
    equityReturns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (equityReturns.length || 1)
  );
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0;

  const downsideReturns = equityReturns.filter(r => r < 0);
  const downsideStd = Math.sqrt(
    downsideReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / (downsideReturns.length || 1)
  );
  const sortinoRatio = downsideStd > 0 ? (avgReturn / downsideStd) * Math.sqrt(252) : 0;

  const cagr = tradingDays > 0 ? Math.pow(endingEquity / initialCapital, 252 / tradingDays) - 1 : 0;
  const volatility = stdDev * Math.sqrt(252);

  const grossProfit = trades.filter(t => t.return > 0).reduce((sum, t) => sum + t.return, 0);
  const grossLoss = Math.abs(trades.filter(t => t.return <= 0).reduce((sum, t) => sum + t.return, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? 999 : 0;

  const avgWin = winningTrades > 0
    ? trades.filter(t => t.return > 0).reduce((sum, t) => sum + t.return, 0) / winningTrades
    : 0;
  const avgLoss = losingTrades > 0
    ? trades.filter(t => t.return <= 0).reduce((sum, t) => sum + t.return, 0) / losingTrades
    : 0;

  const totalHoldingDays = trades.reduce((sum, t) => sum + t.holdingPeriodDays, 0);
  const timeInMarket = tradingDays > 0 ? (totalHoldingDays / tradingDays) * 100 : 0;
  const calmarRatio = maxDrawdown > 0 ? (cagr * 100) / maxDrawdown : 0;

  const bestTrade = trades.reduce((best, t) => t.returnPercent > (best?.returnPercent ?? -Infinity) ? t : best, trades[0]);
  const worstTrade = trades.reduce((worst, t) => t.returnPercent < (worst?.returnPercent ?? Infinity) ? t : worst, trades[0]);

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: parseFloat(winRate.toFixed(2)),
    totalReturn: parseFloat(totalReturnPercent.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    profitFactor: parseFloat(profitFactor.toFixed(2)),
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    cagr: parseFloat((cagr * 100).toFixed(2)),
    volatility: parseFloat(volatility.toFixed(2)),
    sortinoRatio: parseFloat(sortinoRatio.toFixed(2)),
    calmarRatio: parseFloat(calmarRatio.toFixed(2)),
    timeInMarket: parseFloat(timeInMarket.toFixed(2)),
    bestTrade: bestTrade ? {
      ...bestTrade,
      entry: parseFloat(bestTrade.entry.toFixed(2)),
      exit: parseFloat(bestTrade.exit.toFixed(2)),
      return: parseFloat(bestTrade.return.toFixed(2)),
      returnPercent: parseFloat(bestTrade.returnPercent.toFixed(2)),
    } : null,
    worstTrade: worstTrade ? {
      ...worstTrade,
      entry: parseFloat(worstTrade.entry.toFixed(2)),
      exit: parseFloat(worstTrade.exit.toFixed(2)),
      return: parseFloat(worstTrade.return.toFixed(2)),
      returnPercent: parseFloat(worstTrade.returnPercent.toFixed(2)),
    } : null,
    equityCurve: equityCurve.map(point => ({
      date: point.date,
      equity: parseFloat(point.equity.toFixed(2)),
      drawdown: parseFloat(point.drawdown.toFixed(2)),
    })),
    trades: trades.map(t => ({
      ...t,
      entry: parseFloat(t.entry.toFixed(2)),
      exit: parseFloat(t.exit.toFixed(2)),
      return: parseFloat(t.return.toFixed(2)),
      returnPercent: parseFloat(t.returnPercent.toFixed(2)),
    })),
  };
}
