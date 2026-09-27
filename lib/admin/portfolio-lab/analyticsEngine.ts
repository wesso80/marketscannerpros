/**
 * lib/admin/portfolio-lab/analyticsEngine.ts
 *
 * ARCA Quant Analytics Engine.
 *
 * Pure functions over already-fetched data — no DB or network calls in
 * this file. Drives the /admin/portfolio-lab/analytics surface and any
 * consumer that wants principled performance / risk diagnostics.
 *
 *   computeAnalytics({...}) -> AnalyticsResult
 *
 * Coverage:
 *   - Headline: CAGR, Sharpe, Sortino, Calmar, Ulcer, Pain, drawdown
 *   - Daily P&L stats (best/worst day, avg up-day / down-day, hit rate)
 *   - Trade quality: win rate, expectancy (with normal-CI95), payoff,
 *     profit factor, average win/loss R, R-distribution histogram
 *   - Holding periods (winners vs losers)
 *   - Exit reason breakdown
 *   - Kelly: overall + per playbook, capped at maxSingleTradeRiskPct
 *   - Risk of ruin (Vince-style geometric approximation; estimate)
 *   - Confidence calibration buckets (arcaConfidence vs realised win rate)
 *   - Open book stress: if-all-stops-hit, if-all-TP1-hit, concentration,
 *     notional by class, top-3 position concentration
 *   - Benchmark: beta, R², information ratio, tracking error,
 *     up-capture / down-capture, excess CAGR
 *   - Rolling drawdown + rolling 30d Sharpe series
 *   - Streaks (longest win / loss / current)
 *   - Data-health flags ("not enough trades", "no benchmark data", etc.)
 *
 * NO broker execution path. NO claim of live trade routing. This module
 * reads paper data and produces statistics — nothing more.
 */

import { MIN_RETURN_OBSERVATIONS, MIN_RUIN_TRADES, lastValuesByUtcDay, completedDailyReturns, latestContinuousReturns, dailyRiskAdjusted } from "./statisticalEvidence";

import type {
  ArcaPortfolioSnapshot,
  ArcaPosition,
  ArcaTrade,
} from "./types";

// ─────────────────────────────────────────────────────────── inputs / outputs

export interface BenchmarkSnap {
  snapshotAt: string;
  benchmarkSymbol: string;
  benchmarkValue: number;
  benchmarkReturnPct: number | null;
  arcaReturnPct: number | null;
  relativePerformancePct: number | null;
}

export interface AnalyticsInput {
  startingBalance: number;
  currentEquity: number;
  inceptionAt: string;          // ISO of portfolio creation
  snapshots: ArcaPortfolioSnapshot[];   // DESC from store
  trades: ArcaTrade[];                  // DESC from store
  positions: ArcaPosition[];            // open
  benchmarkSnaps: BenchmarkSnap[];      // DESC, may be empty
  benchmarkSymbol: string;              // e.g. "SPY"
  riskPerTradePct: number;              // from settings, used for risk-of-ruin sizing
  maxSingleTradeRiskPct: number;        // for Kelly cap
}

export interface HeadlineMetrics {
  totalReturnPct: number;
  cagrPct: number | null;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  ulcerIndex: number | null;
  painRatio: number | null;
  maxDrawdownPct: number;
  currentDrawdownPct: number;
  annualisedVolPct: number | null;
  daysActive: number;
  basedOnSnapshotDays: number;
}

export interface DailyStats {
  bestDayPct: number | null;
  worstDayPct: number | null;
  avgUpDayPct: number | null;
  avgDownDayPct: number | null;
  positiveDayPct: number | null;
  dayCount: number;
}

export interface RBin {
  bin: string;              // e.g. "[-2R, -1R)"
  lo: number;               // inclusive
  hi: number;               // exclusive (Infinity for the last)
  count: number;
  sumPnl: number;
}

export interface ExitReasonBreakdown {
  reason: string;
  count: number;
  pnl: number;
  avgR: number | null;
}

export interface HoldingPeriodStats {
  winnersHours: number | null;
  losersHours: number | null;
  breakevenHours: number | null;
  overallHours: number | null;
}

export interface KellyResult {
  trades: number;
  winRate: number | null;        // 0..1
  payoffRatio: number | null;    // avgWin / |avgLoss| in R
  kellyFraction: number | null;  // 0..1; null when undefined
  cappedFractionPct: number;     // 0..maxSingleTradeRiskPct, capped at Kelly*100 if positive, else 0
  recommendation: string;
}

export interface PerPlaybookKelly extends KellyResult {
  playbookId: string;
  totalPnl: number;
  avgWinR: number | null;
  avgLossR: number | null;
}

export interface RiskOfRuin {
  estimatePct: number | null;
  sampleSize: number;
  minimumSample: number;
  reason: string | null;
  method: "vince_geometric";
  edgePerR: number | null;
  bankrollInR: number;
}

export interface CalibrationBucket {
  bucket: string;
  midpoint: number;
  trades: number;
  wins: number;
  losses: number;
  observedWinRatePct: number | null;
  expectedWinRatePct: number;       // midpoint
  deltaPct: number | null;          // observed - expected
}

export interface StressResult {
  openPositions: number;
  openRiskDollars: number;
  openRiskPct: number;
  totalNotional: number;
  notionalByClass: Record<string, number>;
  notionalPctByClass: Record<string, number>;
  maxSinglePositionPctOfEquity: number;
  top3ConcentrationPctOfEquity: number;
  ifAllStopsHitDollars: number;
  ifAllTp1HitDollars: number;
  netPlannedRR: number | null;     // tp1 reward / stop risk weighted by position
}

export interface BenchmarkMetrics {
  symbol: string;
  pairs: number;
  minimumPairs: number;
  periodStart: string | null;
  periodEnd: string | null;
  reason: string | null;
  beta: number | null;
  r2: number | null;
  trackingErrorPctAnn: number | null;
  informationRatio: number | null;
  upCapture: number | null;
  downCapture: number | null;
  arcaCagrPct: number | null;
  benchmarkCagrPct: number | null;
  excessCagrPct: number | null;
}

export interface RollingPoint {
  date: string;
  equity: number;
  drawdownPct: number;
  rollingSharpe: number | null;
}

export interface StreakStats {
  longestWin: number;
  longestLoss: number;
  currentWin: number;
  currentLoss: number;
  longestProfitableSession: number;   // most consecutive profitable days
  longestLosingSession: number;
}

export interface AnalyticsResult {
  asOf: string;
  daysActive: number;

  headline: HeadlineMetrics;
  daily: DailyStats;
  tradeQuality: {
    closedTrades: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRatePct: number | null;
    avgWinR: number | null;
    avgLossR: number | null;
    avgR: number | null;
    expectancyR: number | null;
    expectancyCi95R: [number, number] | null;
    payoffRatio: number | null;
    profitFactor: number | null;
    largestWin: number;
    largestLoss: number;
  };
  rDistribution: RBin[];
  exitReasons: ExitReasonBreakdown[];
  holdingPeriods: HoldingPeriodStats;
  kelly: {
    overall: KellyResult;
    byPlaybook: PerPlaybookKelly[];
  };
  riskOfRuin: RiskOfRuin;
  calibration: CalibrationBucket[];
  stress: StressResult;
  benchmark: BenchmarkMetrics | null;
  rolling: { window: number; series: RollingPoint[] };
  streaks: StreakStats;
  health: {
    sufficientTrades: boolean;
    sufficientSnapshots: boolean;
    benchmarkAligned: boolean;
    warnings: string[];
  };
}

// ─────────────────────────────────────────────────────────── main entry

export function computeAnalytics(input: AnalyticsInput): AnalyticsResult {
  const asOf = new Date().toISOString();
  const inception = new Date(input.inceptionAt);
  const now = new Date();
  const daysActive = Math.max(0, Math.floor((now.getTime() - inception.getTime()) / 86_400_000));

  // Chronological snapshots (oldest first)
  const snaps = [...input.snapshots].reverse();

  // ── daily-bucketed equity series for return / drawdown / Sharpe ──
  const byDay = lastValuesByUtcDay(snaps.map(s => ({ at: s.snapshotAt, value: s.totalEquity })));
  const dayKeys = Array.from(byDay.keys()).sort();
  const dailyEquity = dayKeys.map((k) => byDay.get(k)!);
  const returnSeries = completedDailyReturns(dayKeys, dailyEquity);
  const dailyReturns = returnSeries.filter((r): r is number => r != null);
  const continuousReturns = latestContinuousReturns(dayKeys, returnSeries);

  // ── headline metrics ──
  const headline = computeHeadline(input, dailyEquity, continuousReturns, daysActive);

  // ── daily stats ──
  const daily = computeDailyStats(dailyReturns);

  // ── trade-quality core ──
  const tq = computeTradeQuality(input.trades);

  // ── R distribution ──
  const rDistribution = computeRDistribution(input.trades);

  // ── exit reasons ──
  const exitReasons = computeExitReasons(input.trades);

  // ── holding periods ──
  const holdingPeriods = computeHoldingPeriods(input.trades);

  // ── Kelly: overall + per playbook ──
  const overallKelly = kellyFromTrades(input.trades, input.maxSingleTradeRiskPct);
  const byPlaybook = perPlaybookKelly(input.trades, input.maxSingleTradeRiskPct);

  // ── risk of ruin (estimate) ──
  const ruinTrades = input.trades.filter(t => t.rMultiple != null && Number.isFinite(t.rMultiple)
    && ((t.outcome === "WIN" && t.rMultiple > 0) || (t.outcome === "LOSS" && t.rMultiple < 0)));
  const ruinStats = computeTradeQuality(ruinTrades);
  const riskOfRuin = computeRiskOfRuin(ruinStats.winRatePct, ruinStats.payoffRatio, input.riskPerTradePct, ruinTrades.length);

  // ── confidence calibration ──
  const calibration = computeCalibration(input.trades);

  // ── open book stress ──
  const stress = computeStress(input.positions, input.currentEquity);

  // ── benchmark ──
  const benchmark = computeBenchmark(
    input.benchmarkSymbol,
    dayKeys,
    dailyEquity,
    input.benchmarkSnaps,
  );

  // ── rolling series ──
  const window = 30;
  const rollingSeries = computeRollingSeries(dayKeys, dailyEquity, returnSeries, window);

  // ── streaks (trade + session) ──
  const streaks = computeStreaks(input.trades, returnSeries);

  // ── data-health flags ──
  const warnings: string[] = [];
  if (input.trades.length < 10) warnings.push("Fewer than 10 closed trades — trade-quality stats are noisy.");
  if (continuousReturns.length < MIN_RETURN_OBSERVATIONS) warnings.push(`Annualised risk metrics withheld: ${continuousReturns.length}/${MIN_RETURN_OBSERVATIONS} consecutive completed UTC-day returns. Intraday snapshots are not independent daily samples.`);
  if (riskOfRuin.reason) warnings.push(riskOfRuin.reason);
  if (benchmark?.reason) warnings.push(benchmark.reason);
  if (input.trades.filter((t) => t.arcaConfidence != null).length < 10) warnings.push("Fewer than 10 trades with arca_confidence — calibration unreliable.");

  return {
    asOf,
    daysActive,
    headline,
    daily,
    tradeQuality: tq,
    rDistribution,
    exitReasons,
    holdingPeriods,
    kelly: { overall: overallKelly, byPlaybook },
    riskOfRuin,
    calibration,
    stress,
    benchmark,
    rolling: { window, series: rollingSeries },
    streaks,
    health: {
      sufficientTrades: input.trades.length >= 10,
      sufficientSnapshots: continuousReturns.length >= MIN_RETURN_OBSERVATIONS,
      benchmarkAligned: benchmark != null && benchmark.pairs >= MIN_RETURN_OBSERVATIONS,
      warnings,
    },
  };
}

// ─────────────────────────────────────────────────────────── headline

function computeHeadline(
  input: AnalyticsInput,
  dailyEquity: number[],
  dailyReturns: number[],
  daysActive: number,
): HeadlineMetrics {
  const { startingBalance, currentEquity } = input;
  const totalReturnPct = startingBalance > 0 ? ((currentEquity - startingBalance) / startingBalance) * 100 : 0;

  // CAGR — only meaningful after ~30 days.
  const cagrPct =
    daysActive >= 30 && startingBalance > 0
      ? (Math.pow(currentEquity / startingBalance, 365 / daysActive) - 1) * 100
      : null;

  // Drawdown — peak-to-trough on the chronological daily-equity series,
  // anchored at startingBalance.
  let peak = startingBalance;
  let maxDdPct = 0;
  for (const eq of dailyEquity) {
    if (eq > peak) peak = eq;
    if (peak > 0) {
      const dd = ((peak - eq) / peak) * 100;
      if (dd > maxDdPct) maxDdPct = dd;
    }
  }
  const currentDdPct = peak > 0 ? ((peak - currentEquity) / peak) * 100 : 0;

  // Sharpe / Sortino / Ann Vol from daily returns.
  const { sharpe, sortino, annVol } = dailyRiskAdjusted(dailyReturns);

  // Ulcer Index = sqrt( mean( drawdown_t² ) ) on daily series.
  const ddSeries: number[] = [];
  let p = startingBalance;
  for (const eq of dailyEquity) {
    if (eq > p) p = eq;
    if (p > 0) ddSeries.push(((p - eq) / p) * 100);
  }
  const ulcer =
    ddSeries.length > 0 ? Math.sqrt(ddSeries.reduce((s, x) => s + x * x, 0) / ddSeries.length) : null;

  const calmar =
    cagrPct != null && maxDdPct > 0 ? cagrPct / maxDdPct : null;
  const painRatio =
    ulcer != null && ulcer > 0 ? totalReturnPct / ulcer : null;

  return {
    totalReturnPct: round2(totalReturnPct),
    cagrPct: cagrPct == null ? null : round2(cagrPct),
    sharpe: sharpe == null ? null : round3(sharpe),
    sortino: sortino == null ? null : round3(sortino),
    calmar: calmar == null ? null : round3(calmar),
    ulcerIndex: ulcer == null ? null : round3(ulcer),
    painRatio: painRatio == null ? null : round3(painRatio),
    maxDrawdownPct: round3(maxDdPct),
    currentDrawdownPct: round3(currentDdPct),
    annualisedVolPct: annVol == null ? null : round3(annVol),
    daysActive,
    basedOnSnapshotDays: dailyEquity.length,
  };
}


// ─────────────────────────────────────────────────────────── daily P&L stats

function computeDailyStats(daily: number[]): DailyStats {
  if (daily.length === 0) {
    return {
      bestDayPct: null, worstDayPct: null,
      avgUpDayPct: null, avgDownDayPct: null,
      positiveDayPct: null, dayCount: 0,
    };
  }
  const pct = daily.map((x) => x * 100);
  const ups = pct.filter((x) => x > 0);
  const downs = pct.filter((x) => x < 0);
  return {
    bestDayPct: round3(Math.max(...pct)),
    worstDayPct: round3(Math.min(...pct)),
    avgUpDayPct: ups.length ? round3(avg(ups)) : null,
    avgDownDayPct: downs.length ? round3(avg(downs)) : null,
    positiveDayPct: pct.length ? round2((ups.length / pct.length) * 100) : null,
    dayCount: pct.length,
  };
}

// ─────────────────────────────────────────────────────────── trade quality

function computeTradeQuality(trades: ArcaTrade[]): AnalyticsResult["tradeQuality"] {
  const closed = trades.length;
  const wins = trades.filter((t) => t.outcome === "WIN");
  const losses = trades.filter((t) => t.outcome === "LOSS");
  const breakeven = trades.filter((t) => t.outcome === "BREAKEVEN").length;
  const decisive = wins.length + losses.length;
  const winRatePct = decisive > 0 ? (wins.length / decisive) * 100 : null;

  const rs = trades.map((t) => t.rMultiple).filter((r): r is number => r != null && Number.isFinite(r));
  const winRs = wins.map((t) => t.rMultiple).filter((r): r is number => r != null);
  const lossRs = losses.map((t) => t.rMultiple).filter((r): r is number => r != null);
  const avgR = rs.length ? avg(rs) : null;
  const avgWinR = winRs.length ? avg(winRs) : null;
  const avgLossR = lossRs.length ? avg(lossRs) : null;

  const expectancyR =
    winRatePct != null && avgWinR != null && avgLossR != null
      ? (winRatePct / 100) * avgWinR + ((100 - winRatePct) / 100) * avgLossR
      : null;

  // Expectancy CI95 — normal approximation; null when too few samples.
  let expectancyCi95R: [number, number] | null = null;
  if (rs.length >= 10 && avgR != null) {
    const variance = rs.reduce((s, x) => s + (x - avgR) ** 2, 0) / (rs.length - 1);
    const sd = Math.sqrt(variance);
    const se = sd / Math.sqrt(rs.length);
    expectancyCi95R = [round3(avgR - 1.96 * se), round3(avgR + 1.96 * se)];
  }

  const payoffRatio =
    avgWinR != null && avgLossR != null && Math.abs(avgLossR) > 0
      ? Math.abs(avgWinR / avgLossR)
      : null;

  const grossWin = trades.filter((t) => t.realisedPnl > 0).reduce((s, t) => s + t.realisedPnl, 0);
  const grossLoss = Math.abs(trades.filter((t) => t.realisedPnl < 0).reduce((s, t) => s + t.realisedPnl, 0));
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? null : null;

  const largestWin = trades.reduce((m, t) => Math.max(m, t.realisedPnl), 0);
  const largestLoss = trades.reduce((m, t) => Math.min(m, t.realisedPnl), 0);

  return {
    closedTrades: closed,
    wins: wins.length,
    losses: losses.length,
    breakeven,
    winRatePct: winRatePct == null ? null : round2(winRatePct),
    avgWinR: avgWinR == null ? null : round3(avgWinR),
    avgLossR: avgLossR == null ? null : round3(avgLossR),
    avgR: avgR == null ? null : round3(avgR),
    expectancyR: expectancyR == null ? null : round3(expectancyR),
    expectancyCi95R,
    payoffRatio: payoffRatio == null ? null : round3(payoffRatio),
    profitFactor: profitFactor == null ? null : round3(profitFactor),
    largestWin: round2(largestWin),
    largestLoss: round2(largestLoss),
  };
}

// ─────────────────────────────────────────────────────────── R distribution

const R_BINS: Array<{ label: string; lo: number; hi: number }> = [
  { label: "<-3R", lo: -Infinity, hi: -3 },
  { label: "[-3R,-2R)", lo: -3, hi: -2 },
  { label: "[-2R,-1R)", lo: -2, hi: -1 },
  { label: "[-1R,0)", lo: -1, hi: 0 },
  { label: "[0,1R)", lo: 0, hi: 1 },
  { label: "[1R,2R)", lo: 1, hi: 2 },
  { label: "[2R,3R)", lo: 2, hi: 3 },
  { label: "≥3R", lo: 3, hi: Infinity },
];

function computeRDistribution(trades: ArcaTrade[]): RBin[] {
  const out: RBin[] = R_BINS.map((b) => ({ bin: b.label, lo: b.lo, hi: b.hi, count: 0, sumPnl: 0 }));
  for (const t of trades) {
    const r = t.rMultiple;
    if (r == null || !Number.isFinite(r)) continue;
    const idx = R_BINS.findIndex((b) => r >= b.lo && r < b.hi);
    if (idx === -1) continue;
    out[idx].count++;
    out[idx].sumPnl += t.realisedPnl;
  }
  return out.map((b) => ({ ...b, sumPnl: round2(b.sumPnl) }));
}

// ─────────────────────────────────────────────────────────── exit reasons

function computeExitReasons(trades: ArcaTrade[]): ExitReasonBreakdown[] {
  const map = new Map<string, { count: number; pnl: number; rs: number[] }>();
  for (const t of trades) {
    const e = map.get(t.exitReason) ?? { count: 0, pnl: 0, rs: [] };
    e.count++;
    e.pnl += t.realisedPnl;
    if (t.rMultiple != null) e.rs.push(t.rMultiple);
    map.set(t.exitReason, e);
  }
  return Array.from(map.entries())
    .map(([reason, v]) => ({
      reason,
      count: v.count,
      pnl: round2(v.pnl),
      avgR: v.rs.length ? round3(avg(v.rs)) : null,
    }))
    .sort((a, b) => b.count - a.count);
}

// ─────────────────────────────────────────────────────────── holding periods

function computeHoldingPeriods(trades: ArcaTrade[]): HoldingPeriodStats {
  const hours = (t: ArcaTrade): number => {
    const a = new Date(t.entryTime).getTime();
    const b = new Date(t.exitTime).getTime();
    return Math.max(0, (b - a) / 3_600_000);
  };
  const wHrs = trades.filter((t) => t.outcome === "WIN").map(hours);
  const lHrs = trades.filter((t) => t.outcome === "LOSS").map(hours);
  const bHrs = trades.filter((t) => t.outcome === "BREAKEVEN").map(hours);
  const allHrs = trades.map(hours);
  return {
    winnersHours: wHrs.length ? round3(avg(wHrs)) : null,
    losersHours: lHrs.length ? round3(avg(lHrs)) : null,
    breakevenHours: bHrs.length ? round3(avg(bHrs)) : null,
    overallHours: allHrs.length ? round3(avg(allHrs)) : null,
  };
}

// ─────────────────────────────────────────────────────────── Kelly

export function kellyFromStats(args: {
  winRatePct: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  trades: number;
  maxSingleTradeRiskPct: number;
}): KellyResult {
  const { winRatePct, avgWinR, avgLossR, trades, maxSingleTradeRiskPct } = args;
  if (winRatePct == null || avgWinR == null || avgLossR == null || avgLossR === 0) {
    return {
      trades,
      winRate: winRatePct == null ? null : winRatePct / 100,
      payoffRatio: null,
      kellyFraction: null,
      cappedFractionPct: 0,
      recommendation: trades < 10
        ? "Insufficient trades for a Kelly estimate (need ≥10)."
        : "Cannot compute Kelly: missing avg win/loss R.",
    };
  }
  const p = winRatePct / 100;
  const q = 1 - p;
  const b = Math.abs(avgWinR / avgLossR);
  if (!Number.isFinite(b) || b <= 0) {
    return {
      trades,
      winRate: p,
      payoffRatio: null,
      kellyFraction: null,
      cappedFractionPct: 0,
      recommendation: "Cannot compute Kelly: payoff ratio invalid.",
    };
  }
  const kelly = (b * p - q) / b;
  const kellyPct = kelly * 100;
  const cappedPct = Math.max(0, Math.min(maxSingleTradeRiskPct, kellyPct));
  let recommendation: string;
  if (kelly <= 0) {
    recommendation = "Negative edge — Kelly says do not size up. Review playbook.";
  } else if (trades < 10) {
    recommendation = `Kelly ${kellyPct.toFixed(2)}% (low confidence: <10 trades). Hold to fractional Kelly until sample grows.`;
  } else if (kellyPct > maxSingleTradeRiskPct) {
    recommendation = `Kelly ${kellyPct.toFixed(2)}% exceeds max single-trade cap ${maxSingleTradeRiskPct}% — risk-capped.`;
  } else {
    recommendation = `Within cap. ½-Kelly ≈ ${(kellyPct / 2).toFixed(2)}% is the conservative size.`;
  }
  return {
    trades,
    winRate: p,
    payoffRatio: round3(b),
    kellyFraction: round3(kelly),
    cappedFractionPct: round3(cappedPct),
    recommendation,
  };
}

function kellyFromTrades(trades: ArcaTrade[], cap: number): KellyResult {
  const wins = trades.filter((t) => t.outcome === "WIN");
  const losses = trades.filter((t) => t.outcome === "LOSS");
  const decisive = wins.length + losses.length;
  const winRatePct = decisive > 0 ? (wins.length / decisive) * 100 : null;
  const winRs = wins.map((t) => t.rMultiple).filter((r): r is number => r != null);
  const lossRs = losses.map((t) => t.rMultiple).filter((r): r is number => r != null);
  return kellyFromStats({
    winRatePct,
    avgWinR: winRs.length ? avg(winRs) : null,
    avgLossR: lossRs.length ? avg(lossRs) : null,
    trades: trades.length,
    maxSingleTradeRiskPct: cap,
  });
}

function perPlaybookKelly(trades: ArcaTrade[], cap: number): PerPlaybookKelly[] {
  const groups = new Map<string, ArcaTrade[]>();
  for (const t of trades) {
    const pb = t.playbookId ?? "_unspecified";
    const arr = groups.get(pb) ?? [];
    arr.push(t);
    groups.set(pb, arr);
  }
  const out: PerPlaybookKelly[] = [];
  for (const [pb, list] of groups) {
    const wins = list.filter((t) => t.outcome === "WIN");
    const losses = list.filter((t) => t.outcome === "LOSS");
    const decisive = wins.length + losses.length;
    const winRatePct = decisive > 0 ? (wins.length / decisive) * 100 : null;
    const winRs = wins.map((t) => t.rMultiple).filter((r): r is number => r != null);
    const lossRs = losses.map((t) => t.rMultiple).filter((r): r is number => r != null);
    const avgWinR = winRs.length ? avg(winRs) : null;
    const avgLossR = lossRs.length ? avg(lossRs) : null;
    const k = kellyFromStats({ winRatePct, avgWinR, avgLossR, trades: list.length, maxSingleTradeRiskPct: cap });
    out.push({
      playbookId: pb,
      ...k,
      totalPnl: round2(list.reduce((s, t) => s + t.realisedPnl, 0)),
      avgWinR: avgWinR == null ? null : round3(avgWinR),
      avgLossR: avgLossR == null ? null : round3(avgLossR),
    });
  }
  return out.sort((a, b) => b.totalPnl - a.totalPnl);
}

// ─────────────────────────────────────────────────────────── risk of ruin

export function computeRiskOfRuin(
  winRatePct: number | null,
  payoffRatio: number | null,
  riskPerTradePct: number,
  sampleSize: number,
): RiskOfRuin {
  const bankrollInR = Number.isFinite(riskPerTradePct) && riskPerTradePct > 0 && riskPerTradePct <= 100 ? round2(100 / riskPerTradePct) : 0;
  const evidence = { sampleSize, minimumSample: MIN_RUIN_TRADES, reason: null as string | null };
  let reason: string | null = null;
  if (!Number.isInteger(sampleSize) || sampleSize < MIN_RUIN_TRADES) {
    reason = `Risk-of-ruin estimate unavailable: ${sampleSize}/${MIN_RUIN_TRADES} closed win/loss trades with valid R-multiples.`;
  } else if (winRatePct == null || payoffRatio == null || !Number.isFinite(winRatePct) || !Number.isFinite(payoffRatio)
      || winRatePct <= 0 || winRatePct >= 100 || payoffRatio <= 0 || bankrollInR <= 0) {
    reason = "Risk-of-ruin estimate unavailable: requires observed wins and losses, a finite payoff ratio, and valid risk per trade.";
  }
  if (reason) return { ...evidence, reason, estimatePct: null, method: "vince_geometric", edgePerR: null, bankrollInR };
  const p = winRatePct! / 100;
  const q = 1 - p;
  const b = payoffRatio!;
  const edgePerR = p * b - q;
  if (edgePerR <= 0) {
    return { ...evidence, estimatePct: 100, method: "vince_geometric", edgePerR: round3(edgePerR), bankrollInR };
  }
  // Practical Vince approximation: normalise edge against payoff so the
  // base of the geometric falls in (0,1), then raise to bankroll-in-R.
  const normalised = Math.min(0.999, edgePerR / Math.max(b, 1));
  const base = (1 - normalised) / (1 + normalised);
  const ror = Math.pow(base, bankrollInR) * 100;
  return {
    ...evidence,
    estimatePct: round3(Math.max(0, Math.min(100, ror))),
    method: "vince_geometric",
    edgePerR: round3(edgePerR),
    bankrollInR,
  };
}

// ─────────────────────────────────────────────────────────── calibration

function computeCalibration(trades: ArcaTrade[]): CalibrationBucket[] {
  const decisive = trades.filter(
    (t) => t.arcaConfidence != null && (t.outcome === "WIN" || t.outcome === "LOSS"),
  );
  if (decisive.length === 0) return [];
  const buckets: CalibrationBucket[] = [];
  for (let lo = 0; lo < 100; lo += 10) {
    const hi = lo + 10;
    const inBucket = decisive.filter((t) => (t.arcaConfidence ?? -1) >= lo && (t.arcaConfidence ?? -1) < (hi === 100 ? 101 : hi));
    if (inBucket.length === 0) continue;
    const wins = inBucket.filter((t) => t.outcome === "WIN").length;
    const losses = inBucket.filter((t) => t.outcome === "LOSS").length;
    const midpoint = lo + 5;
    const observed = inBucket.length > 0 ? (wins / inBucket.length) * 100 : null;
    buckets.push({
      bucket: `${lo}-${hi}`,
      midpoint,
      trades: inBucket.length,
      wins,
      losses,
      observedWinRatePct: observed == null ? null : round2(observed),
      expectedWinRatePct: midpoint,
      deltaPct: observed == null ? null : round2(observed - midpoint),
    });
  }
  return buckets;
}

// ─────────────────────────────────────────────────────────── stress

function computeStress(positions: ArcaPosition[], equity: number): StressResult {
  const safeEquity = equity > 0 ? equity : 1;
  let openRiskDollars = 0;
  let totalNotional = 0;
  let ifAllStops = 0;
  let ifAllTp1 = 0;
  const notionalByClass: Record<string, number> = {};
  const positionPcts: number[] = [];

  for (const p of positions) {
    const mark = p.currentPrice ?? p.averageEntry;
    const notional = mark * p.quantity;
    openRiskDollars += p.openRisk || 0;
    totalNotional += notional;
    notionalByClass[p.assetClass] = (notionalByClass[p.assetClass] ?? 0) + notional;
    positionPcts.push((notional / safeEquity) * 100);

    if (p.stopLoss != null) {
      // Loss when stop is hit = (entry - stop) × qty for long, opposite for short.
      const dir = p.side === "LONG" ? 1 : -1;
      ifAllStops += dir * (p.stopLoss - p.averageEntry) * p.quantity;
    }
    if (p.takeProfit1 != null) {
      const dir = p.side === "LONG" ? 1 : -1;
      ifAllTp1 += dir * (p.takeProfit1 - p.averageEntry) * p.quantity;
    }
  }

  const notionalPctByClass: Record<string, number> = {};
  for (const [k, v] of Object.entries(notionalByClass)) {
    notionalPctByClass[k] = round3((v / safeEquity) * 100);
  }

  positionPcts.sort((a, b) => b - a);
  const top3 = positionPcts.slice(0, 3).reduce((s, x) => s + x, 0);
  const maxSingle = positionPcts[0] ?? 0;

  const netPlannedRR = Math.abs(ifAllStops) > 0 ? Math.abs(ifAllTp1 / ifAllStops) : null;

  return {
    openPositions: positions.length,
    openRiskDollars: round2(openRiskDollars),
    openRiskPct: round3((openRiskDollars / safeEquity) * 100),
    totalNotional: round2(totalNotional),
    notionalByClass: round2Object(notionalByClass),
    notionalPctByClass,
    maxSinglePositionPctOfEquity: round3(maxSingle),
    top3ConcentrationPctOfEquity: round3(top3),
    ifAllStopsHitDollars: round2(ifAllStops),
    ifAllTp1HitDollars: round2(ifAllTp1),
    netPlannedRR: netPlannedRR == null ? null : round3(netPlannedRR),
  };
}

// ─────────────────────────────────────────────────────────── benchmark

function computeBenchmark(
  symbol: string, arcaDays: string[], arcaEquity: number[], benchSnaps: BenchmarkSnap[],
): BenchmarkMetrics {
  const today = new Date().toISOString().slice(0, 10);
  const byDay = lastValuesByUtcDay(benchSnaps.filter(s => s.benchmarkSymbol === symbol)
    .map(s => ({ at: s.snapshotAt, value: s.benchmarkValue })));
  const arcaByDay = new Map(arcaDays.map((day, i) => [day, arcaEquity[i]]));
  const dates = arcaDays.filter(day => day < today && byDay.has(day)).sort();
  const result: BenchmarkMetrics = {
    symbol, pairs: 0, minimumPairs: MIN_RETURN_OBSERVATIONS,
    periodStart: dates[0] ?? null, periodEnd: dates.at(-1) ?? null, reason: null,
    beta: null, r2: null, trackingErrorPctAnn: null, informationRatio: null,
    upCapture: null, downCapture: null, arcaCagrPct: null, benchmarkCagrPct: null, excessCagrPct: null,
  };
  const rp: number[] = [], rb: number[] = [];
  let regularCalendarDays = true;
  for (let i = 1; i < dates.length; i++) {
    const previousA = arcaByDay.get(dates[i - 1])!, previousB = byDay.get(dates[i - 1])!;
    if (previousA <= 0 || previousB <= 0) { regularCalendarDays = false; continue; }
    rp.push((arcaByDay.get(dates[i])! - previousA) / previousA);
    rb.push((byDay.get(dates[i])! - previousB) / previousB);
    if (Date.parse(dates[i]) - Date.parse(dates[i - 1]) !== 86_400_000) regularCalendarDays = false;
  }
  result.pairs = rp.length;
  if (rp.length < MIN_RETURN_OBSERVATIONS) {
    result.reason = `Benchmark statistics unavailable: ${rp.length}/${MIN_RETURN_OBSERVATIONS} matched return observations. Both series must use the same dates.`;
    return result;
  }
  const mp = avg(rp), mb = avg(rb);
  let cov = 0, varB = 0, varP = 0;
  for (let i = 0; i < rp.length; i++) {
    cov += (rp[i] - mp) * (rb[i] - mb);
    varB += (rb[i] - mb) ** 2; varP += (rp[i] - mp) ** 2;
  }
  const divisor = rp.length - 1;
  cov /= divisor; varB /= divisor; varP /= divisor;
  result.beta = varB > 0 ? round3(cov / varB) : null;
  result.r2 = varB > 0 && varP > 0 ? round3(cov ** 2 / (varB * varP)) : null;
  const active = rp.map((r, i) => r - rb[i]);
  const activeMean = avg(active);
  const activeSd = Math.sqrt(active.reduce((sum, r) => sum + (r - activeMean) ** 2, 0) / divisor);
  if (regularCalendarDays) {
    result.trackingErrorPctAnn = round3(activeSd * Math.sqrt(365) * 100);
    result.informationRatio = activeSd > 0 ? round3(activeMean / activeSd * Math.sqrt(365)) : null;
  } else {
    result.reason = "Annualised benchmark ratios withheld: matched observations include calendar gaps. Other statistics describe matched observation intervals.";
  }
  const capture = (positive: boolean) => {
    const indexes = rb.map((r, i) => ((positive ? r > 0 : r < 0) ? i : -1)).filter(i => i >= 0);
    const denominator = indexes.reduce((sum, i) => sum + rb[i], 0);
    return denominator !== 0 ? round3(indexes.reduce((sum, i) => sum + rp[i], 0) / denominator) : null;
  };
  result.upCapture = capture(true); result.downCapture = capture(false);
  // Both CAGRs use the same observed endpoints and elapsed calendar time.
  const first = dates[0], last = dates[dates.length - 1];
  const spanDays = (Date.parse(last) - Date.parse(first)) / 86_400_000;
  if (spanDays >= 30 && arcaByDay.get(first)! > 0 && byDay.get(first)! > 0) {
    result.arcaCagrPct = round2((Math.pow(arcaByDay.get(last)! / arcaByDay.get(first)!, 365 / spanDays) - 1) * 100);
    result.benchmarkCagrPct = round2((Math.pow(byDay.get(last)! / byDay.get(first)!, 365 / spanDays) - 1) * 100);
    result.excessCagrPct = round2(result.arcaCagrPct - result.benchmarkCagrPct);
  }
  return result;
}

// ─────────────────────────────────────────────────────────── rolling series

function computeRollingSeries(
  dayKeys: string[],
  dailyEquity: number[],
  dailyReturns: Array<number | null>,
  window: number,
): RollingPoint[] {
  // Compute peak/drawdown using equity and rolling Sharpe using returns.
  const out: RollingPoint[] = [];
  let peak = dailyEquity[0] ?? 0;
  for (let i = 0; i < dailyEquity.length; i++) {
    const eq = dailyEquity[i];
    if (eq > peak) peak = eq;
    const ddPct = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    let rs: number | null = null;
    if (i >= window) {
      const slice = dailyReturns.slice(i - window + 1, i + 1);
      if (slice.every((r): r is number => r != null)) {
        const value = dailyRiskAdjusted(slice).sharpe;
        rs = value == null ? null : round3(value);
      }
    }
    out.push({ date: dayKeys[i], equity: round2(eq), drawdownPct: round3(ddPct), rollingSharpe: rs });
  }
  return out;
}

// ─────────────────────────────────────────────────────────── streaks

function computeStreaks(trades: ArcaTrade[], dailyReturns: Array<number | null>): StreakStats {
  // listTrades is DESC; chronologise
  const chrono = [...trades].reverse();
  let lw = 0, ll = 0, cw = 0, cl = 0;
  let runW = 0, runL = 0;
  for (const t of chrono) {
    if (t.outcome === "WIN") { runW++; runL = 0; if (runW > lw) lw = runW; }
    else if (t.outcome === "LOSS") { runL++; runW = 0; if (runL > ll) ll = runL; }
    else { runW = 0; runL = 0; }
  }
  for (let i = chrono.length - 1; i >= 0; i--) {
    if (chrono[i].outcome === "WIN") cw++; else break;
  }
  for (let i = chrono.length - 1; i >= 0; i--) {
    if (chrono[i].outcome === "LOSS") cl++; else break;
  }

  // Session streaks from daily returns
  let lp = 0, lDown = 0, runUp = 0, runDown = 0;
  for (const r of dailyReturns) {
    if (r == null || r === 0) { runUp = 0; runDown = 0; continue; }
    if (r > 0) { runUp++; runDown = 0; if (runUp > lp) lp = runUp; }
    else if (r < 0) { runDown++; runUp = 0; if (runDown > lDown) lDown = runDown; }
  }
  return { longestWin: lw, longestLoss: ll, currentWin: cw, currentLoss: cl, longestProfitableSession: lp, longestLosingSession: lDown };
}

// ─────────────────────────────────────────────────────────── helpers

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
function round2Object(o: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) out[k] = round2(v);
  return out;
}
