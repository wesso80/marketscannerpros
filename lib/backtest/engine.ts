import { balanceDay, computeBalanceStatistics, type BacktestStatisticsBasis } from './balanceStatistics';

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

export interface BacktestExecutionAssumptions {
  version: string;
  strategyId: string;
  timeframe: string;
  assetType: 'stock' | 'crypto';
  fillModel: {
    label: string;
    entryTiming: string;
    exitTiming: string;
    intrabarPriority: string;
    intrabarAmbiguity: string;
    endOfDataExit: string;
  };
  costs: {
    slippageBps: number;
    slippageApplied: boolean;
    spreadModel: string;
    commissionModel: string;
    feeModel: string;
    borrowCostsModel: string;
    marketImpactModel: string;
  };
  liquidity: {
    volumeData: string;
    sizeModel: string;
    partialFills: string;
    depthModel: string;
  };
  bias: Record<string, string>;
  sampleQuality: {
    label: string;
    totalTrades: number;
    bars: number;
    warning: string;
  };
  warnings: string[];
}

export interface BacktestEquityPoint {
  date: string;
  equity: number;
  drawdown: number;
}

export interface KellyCriterion {
  kellyFraction: number;    // binary payoff approximation; not an allocation recommendation
  halfKelly: number;        // conservative half-Kelly (commonly used)
  expectedEdge: number;     // sample mean dollar P&L per trade; not risk-normalised
}

export interface MonteCarloResult {
  simulations: number;
  method: 'iid_dollar_bootstrap';
  seed: number;
  medianReturn: number;     // median final return %
  p5Return: number;         // 5th percentile; not a worst-case bound
  p25Return: number;        // 25th percentile
  p75Return: number;        // 75th percentile
  p95Return: number;        // 95th percentile; not a best-case bound
  medianMaxDrawdown: number;
  p95MaxDrawdown: number;   // worst-case drawdown at 95th percentile
  ruinProbability: number;  // % of sims that hit > 50% drawdown
}

export interface BacktestEngineResult {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
  totalReturn: number;
  maxDrawdown: number;
  sharpeRatio: number | null;
  profitFactor: number | null;
  profitFactorLabel?: string;
  avgWin: number;
  avgLoss: number;
  cagr: number | null;
  volatility: number | null;
  sortinoRatio: number | null;
  calmarRatio: number | null;
  timeInMarket: number;
  bestTrade: BacktestTrade | null;
  worstTrade: BacktestTrade | null;
  equityCurve: BacktestEquityPoint[];
  trades: BacktestTrade[];
  validation?: BacktestValidation;
  dataCoverage?: BacktestDataCoverage;
  executionAssumptions?: BacktestExecutionAssumptions;
  diagnostics?: unknown;
  initialCapital?: number;
  statisticsBasis?: BacktestStatisticsBasis;
  kelly?: KellyCriterion;
  monteCarlo?: MonteCarloResult;
}

export function createEmptyBacktestResult(): BacktestEngineResult {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    breakevenTrades: 0,
    winRate: 0,
    totalReturn: 0,
    maxDrawdown: 0,
    sharpeRatio: null,
    profitFactor: null,
    profitFactorLabel: 'No completed trades',
    avgWin: 0,
    avgLoss: 0,
    cagr: null,
    volatility: null,
    sortinoRatio: null,
    calmarRatio: null,
    timeInMarket: 0,
    bestTrade: null,
    worstTrade: null,
    equityCurve: [],
    trades: [],
  };
}

const MONTE_CARLO_SEED = 20260427;

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function computeMergedTimeInMarket(trades: BacktestTrade[], dates: string[]): number {
  if (dates.length === 0 || trades.length === 0) return 0;

  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const intervals = trades
    .map((trade) => {
      const start = dateIndex.get(trade.entryDate);
      const end = dateIndex.get(trade.exitDate);
      if (start == null || end == null) return null;
      return { start: Math.min(start, end), end: Math.max(start, end) };
    })
    .filter((interval): interval is { start: number; end: number } => interval != null)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (intervals.length === 0) return 0;

  let coveredBars = 0;
  let currentStart = intervals[0].start;
  let currentEnd = intervals[0].end;

  for (const interval of intervals.slice(1)) {
    if (interval.start <= currentEnd + 1) {
      currentEnd = Math.max(currentEnd, interval.end);
      continue;
    }

    coveredBars += currentEnd - currentStart + 1;
    currentStart = interval.start;
    currentEnd = interval.end;
  }

  coveredBars += currentEnd - currentStart + 1;
  return Math.min(100, (coveredBars / dates.length) * 100);
}

export function buildBacktestEngineResult(trades: BacktestTrade[], dates: string[], initialCapital: number, options: { sourceBarMinutes?: number; markedBalances?: Map<string, number> } = {}): BacktestEngineResult {
  if (!Number.isFinite(initialCapital) || initialCapital <= 0) throw new Error('Initial capital must be positive');
  if (trades.length === 0) {
    return { ...createEmptyBacktestResult(), initialCapital, statisticsBasis: computeBalanceStatistics([], initialCapital, 0).statisticsBasis };
  }
  if (!dates.length || new Set(dates).size !== dates.length) throw new Error('Backtest timeline is empty or duplicated');
  dates = [...dates].sort();
  dates.forEach(balanceDay);
  const timeline = new Set(dates);
  for (const trade of trades) {
    if (!timeline.has(trade.exitDate)) throw new Error('Trade exit is missing from the backtest timeline');
    if (![trade.return, trade.returnPercent, trade.entry, trade.exit].every(Number.isFinite)) {
      throw new Error('Backtest trade contains a non-finite value');
    }
  }

  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.return > 0).length;
  const losingTrades = trades.filter(t => t.return < 0).length;
  const breakevenTrades = trades.filter(t => t.return === 0).length;
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

    if (options.markedBalances?.has(date)) equity = options.markedBalances.get(date)!;
    if (equity > peak) {
      peak = equity;
    }

    const drawdown = ((peak - equity) / peak) * 100;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }

    equityCurve.push({ date, equity, drawdown });
  });

  const balanceStatistics = computeBalanceStatistics(equityCurve, initialCapital, maxDrawdown, options.sourceBarMinutes, !!options.markedBalances);

  const grossProfit = trades.filter(t => t.return > 0).reduce((sum, t) => sum + t.return, 0);
  const grossLoss = Math.abs(trades.filter(t => t.return < 0).reduce((sum, t) => sum + t.return, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;
  const profitFactorLabel = profitFactor == null ? (grossProfit > 0 ? 'No losing trades in sample' : 'No gains or losses in sample') : undefined;

  const avgWin = winningTrades > 0
    ? trades.filter(t => t.return > 0).reduce((sum, t) => sum + t.return, 0) / winningTrades
    : 0;
  const avgLoss = losingTrades > 0
    ? trades.filter(t => t.return < 0).reduce((sum, t) => sum + t.return, 0) / losingTrades
    : 0;

  const timeInMarket = computeMergedTimeInMarket(trades, dates);

  const bestTrade = trades.reduce((best, t) => t.returnPercent > (best?.returnPercent ?? -Infinity) ? t : best, trades[0]);
  const worstTrade = trades.reduce((worst, t) => t.returnPercent < (worst?.returnPercent ?? Infinity) ? t : worst, trades[0]);

  // Kelly allocation is withheld: trades do not contain consistent risk budgets
  // or a verified payoff model. Mean dollar outcomes cannot establish % capital risk.
  // IID bootstrap of observed dollar outcomes, with replacement and fixed trade count.
  // No compounding, regime dependence, margin or execution model is implied.
  let monteCarlo: MonteCarloResult | undefined;
  if (trades.length >= 8) {
    const tradeReturns = trades.map(t => t.return);
    const numSims = 500;
    const random = seededRandom(MONTE_CARLO_SEED);
    const finalReturns: number[] = [];
    const maxDrawdowns: number[] = [];

    for (let s = 0; s < numSims; s++) {
      // Simulate equity path
      let eq = initialCapital;
      let pk = initialCapital;
      let md = 0;
      for (let i = 0; i < tradeReturns.length; i++) {
        eq += tradeReturns[Math.floor(random() * tradeReturns.length)];
        if (eq > pk) pk = eq;
        const dd = pk > 0 ? ((pk - eq) / pk) * 100 : 0;
        if (dd > md) md = dd;
      }
      finalReturns.push(((eq - initialCapital) / initialCapital) * 100);
      maxDrawdowns.push(md);
    }

    finalReturns.sort((a, b) => a - b);
    maxDrawdowns.sort((a, b) => a - b);

    const percentile = (arr: number[], p: number) => arr[Math.floor(arr.length * p / 100)] ?? 0;
    const ruinCount = maxDrawdowns.filter(d => d > 50).length;

    monteCarlo = {
      simulations: numSims,
      method: 'iid_dollar_bootstrap',
      seed: MONTE_CARLO_SEED,
      medianReturn: parseFloat(percentile(finalReturns, 50).toFixed(2)),
      p5Return: parseFloat(percentile(finalReturns, 5).toFixed(2)),
      p25Return: parseFloat(percentile(finalReturns, 25).toFixed(2)),
      p75Return: parseFloat(percentile(finalReturns, 75).toFixed(2)),
      p95Return: parseFloat(percentile(finalReturns, 95).toFixed(2)),
      medianMaxDrawdown: parseFloat(percentile(maxDrawdowns, 50).toFixed(2)),
      p95MaxDrawdown: parseFloat(percentile(maxDrawdowns, 95).toFixed(2)),
      ruinProbability: parseFloat(((ruinCount / numSims) * 100).toFixed(1)),
    };
  }

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    breakevenTrades,
    winRate: parseFloat(winRate.toFixed(2)),
    totalReturn: parseFloat(totalReturnPercent.toFixed(2)),
    maxDrawdown: parseFloat(maxDrawdown.toFixed(2)),
    ...balanceStatistics,
    initialCapital,
    profitFactor: profitFactor == null ? null : parseFloat(profitFactor.toFixed(2)),
    profitFactorLabel,
    avgWin: parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
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
    monteCarlo,
  };
}
