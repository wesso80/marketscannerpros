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
  kellyFraction: number;    // optimal fraction of capital to risk per trade
  halfKelly: number;        // conservative half-Kelly (commonly used)
  expectedEdge: number;     // expected $ return per $1 risked
}

export interface MonteCarloResult {
  simulations: number;
  seed: number;
  medianReturn: number;     // median final return %
  p5Return: number;         // 5th percentile (worst-case)
  p25Return: number;        // 25th percentile
  p75Return: number;        // 75th percentile
  p95Return: number;        // 95th percentile (best-case)
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
  sharpeRatio: number;
  profitFactor: number | null;
  profitFactorLabel?: string;
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
  executionAssumptions?: BacktestExecutionAssumptions;
  diagnostics?: unknown;
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

export function buildBacktestEngineResult(trades: BacktestTrade[], dates: string[], initialCapital: number): BacktestEngineResult {
  if (trades.length === 0) {
    return createEmptyBacktestResult();
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
  const grossLoss = Math.abs(trades.filter(t => t.return < 0).reduce((sum, t) => sum + t.return, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0;
  const profitFactorLabel = profitFactor == null ? 'No losing trades in sample' : undefined;

  const avgWin = winningTrades > 0
    ? trades.filter(t => t.return > 0).reduce((sum, t) => sum + t.return, 0) / winningTrades
    : 0;
  const avgLoss = losingTrades > 0
    ? trades.filter(t => t.return < 0).reduce((sum, t) => sum + t.return, 0) / losingTrades
    : 0;

  const timeInMarket = computeMergedTimeInMarket(trades, dates);
  const calmarRatio = maxDrawdown > 0 ? (cagr * 100) / maxDrawdown : 0;

  const bestTrade = trades.reduce((best, t) => t.returnPercent > (best?.returnPercent ?? -Infinity) ? t : best, trades[0]);
  const worstTrade = trades.reduce((worst, t) => t.returnPercent < (worst?.returnPercent ?? Infinity) ? t : worst, trades[0]);

  // Kelly Criterion: f* = (W × B - L) / B  where W=win rate, L=loss rate, B=avg win / abs(avg loss)
  let kelly: KellyCriterion | undefined;
  if (winningTrades > 0 && losingTrades > 0 && avgLoss !== 0) {
    const W = winningTrades / totalTrades;
    const L = losingTrades / totalTrades;
    const B = Math.abs(avgWin / avgLoss);
    const kellyFraction = (W * B - L) / B;
    kelly = {
      kellyFraction: parseFloat(Math.max(0, kellyFraction).toFixed(4)),
      halfKelly: parseFloat(Math.max(0, kellyFraction / 2).toFixed(4)),
      expectedEdge: parseFloat((W * avgWin + L * avgLoss).toFixed(2)),
    };
  }

  // Monte Carlo Simulation: shuffle trade returns 500 times, track equity paths
  let monteCarlo: MonteCarloResult | undefined;
  if (trades.length >= 8) {
    const tradeReturns = trades.map(t => t.return);
    const numSims = 500;
    const random = seededRandom(MONTE_CARLO_SEED);
    const finalReturns: number[] = [];
    const maxDrawdowns: number[] = [];

    for (let s = 0; s < numSims; s++) {
      // Fisher-Yates shuffle of trade returns
      const shuffled = [...tradeReturns];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      // Simulate equity path
      let eq = initialCapital;
      let pk = initialCapital;
      let md = 0;
      for (const ret of shuffled) {
        eq += ret;
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
    sharpeRatio: parseFloat(sharpeRatio.toFixed(2)),
    profitFactor: profitFactor == null ? null : parseFloat(profitFactor.toFixed(2)),
    profitFactorLabel,
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
    kelly,
    monteCarlo,
  };
}
