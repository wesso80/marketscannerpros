/**
 * test/admin/arcaPortfolioLabAnalytics.test.ts
 *
 * Math tests for analyticsEngine. Pure — no DB, no network.
 *
 * Coverage:
 *   - computeAnalytics happy path on a small synthetic book
 *   - headline metrics: total return, max drawdown, current drawdown,
 *     ulcer index, Calmar, pain ratio, Sharpe/Sortino/ann-vol
 *   - daily stats: best/worst day, positive-day rate
 *   - R-distribution bin boundaries (no double-counting)
 *   - holding-period averages
 *   - Kelly formula: positive edge, negative edge, payoff cap
 *   - per-playbook Kelly grouping
 *   - risk of ruin: negative edge → 100%, positive edge → in (0,100)
 *   - confidence calibration bucketing
 *   - stress: if-all-stops-hit and if-all-TP1-hit signs (long + short)
 *   - benchmark: beta ≈ 1 for paired series; up/down capture sanity
 *   - rolling drawdown peak-tracking
 */

import { describe, expect, it } from "vitest";
import {
  computeAnalytics,
  computeRiskOfRuin,
  kellyFromStats,
  type AnalyticsInput,
  type BenchmarkSnap,
} from "@/lib/admin/portfolio-lab/analyticsEngine";
import type {
  ArcaPortfolioSnapshot,
  ArcaPosition,
  ArcaTrade,
} from "@/lib/admin/portfolio-lab/types";

// ───────────────────────────── fixtures

function snap(over: Partial<ArcaPortfolioSnapshot>): ArcaPortfolioSnapshot {
  return {
    id: 1,
    workspaceId: "ws-1",
    portfolioId: "p-1",
    snapshotAt: "2026-05-10T00:00:00Z",
    cash: 200_000,
    totalEquity: 200_000,
    realisedPnl: 0,
    unrealisedPnl: 0,
    dailyPnl: null,
    drawdownPct: 0,
    exposureEquities: 0,
    exposureCrypto: 0,
    exposureCommodities: 0,
    exposureOptions: 0,
    exposureFutures: 0,
    openPositionsCount: 0,
    openRiskPct: 0,
    createdAt: "2026-05-10T00:00:00Z",
    ...over,
  };
}

function tradeFix(over: Partial<ArcaTrade>): ArcaTrade {
  return {
    id: "t",
    workspaceId: "ws-1",
    portfolioId: "p-1",
    positionId: null,
    symbol: "AAPL",
    assetClass: "equity",
    instrumentType: "spot",
    side: "LONG",
    entryPrice: 100,
    exitPrice: 110,
    quantity: 10,
    notionalValue: 1100,
    stopLoss: 95,
    takeProfit1: 110,
    takeProfit2: null,
    takeProfit3: null,
    entryTime: "2026-05-01T10:00:00Z",
    exitTime: "2026-05-01T18:00:00Z",
    realisedPnl: 100,
    rMultiple: 2,
    feesEstimate: 0,
    slippageEstimate: 0,
    outcome: "WIN",
    exitReason: "TAKE_PROFIT",
    playbookId: "TREND_CONTINUATION",
    sourceEdgePacketId: null,
    sourceMarketPacketId: null,
    arcaConfidence: 70,
    arcaReasonSummary: null,
    createdAt: "2026-05-01T18:00:00Z",
    ...over,
  };
}

function position(over: Partial<ArcaPosition>): ArcaPosition {
  return {
    id: "x",
    workspaceId: "ws-1",
    portfolioId: "p-1",
    symbol: "AAPL",
    assetClass: "equity",
    instrumentType: "spot",
    side: "LONG",
    quantity: 100,
    averageEntry: 100,
    currentPrice: 105,
    stopLoss: 95,
    takeProfit1: 115,
    takeProfit2: null,
    takeProfit3: null,
    realisedPnl: 0,
    unrealisedPnl: 500,
    openRisk: 500,
    currentRMultiple: 1,
    status: "OPEN",
    openedAt: "2026-05-05T10:00:00Z",
    lastMarkAt: "2026-05-15T15:00:00Z",
    closedAt: null,
    sourceOrderId: null,
    sourceEdgePacketId: null,
    playbookId: "TREND_CONTINUATION",
    ...over,
  };
}

function baseInput(over: Partial<AnalyticsInput> = {}): AnalyticsInput {
  return {
    startingBalance: 200_000,
    currentEquity: 200_000,
    inceptionAt: "2026-01-01T00:00:00Z",
    snapshots: [],
    trades: [],
    positions: [],
    benchmarkSnaps: [],
    benchmarkSymbol: "SPY",
    riskPerTradePct: 1,
    maxSingleTradeRiskPct: 1,
    ...over,
  };
}

// ───────────────────────────── headline / drawdown

describe("computeAnalytics — headline + drawdown", () => {
  it("returns sensible zeros on an empty book", () => {
    const r = computeAnalytics(baseInput());
    expect(r.headline.totalReturnPct).toBe(0);
    expect(r.headline.maxDrawdownPct).toBe(0);
    expect(r.tradeQuality.closedTrades).toBe(0);
    expect(r.benchmark).not.toBeNull();
    expect(r.benchmark?.pairs).toBe(0);
    expect(r.health.warnings.length).toBeGreaterThan(0);
  });

  it("computes total return + max DD + current DD from a 4-day snapshot run", () => {
    // store DESC; chronological: 200k → 210k (peak) → 195k (trough) → 200k
    const snapshots: ArcaPortfolioSnapshot[] = [
      snap({ id: 4, snapshotAt: "2026-05-04T20:00:00Z", totalEquity: 200_000 }),
      snap({ id: 3, snapshotAt: "2026-05-03T20:00:00Z", totalEquity: 195_000 }),
      snap({ id: 2, snapshotAt: "2026-05-02T20:00:00Z", totalEquity: 210_000 }),
      snap({ id: 1, snapshotAt: "2026-05-01T20:00:00Z", totalEquity: 200_000 }),
    ];
    const r = computeAnalytics(baseInput({ snapshots, currentEquity: 200_000 }));
    expect(r.headline.totalReturnPct).toBe(0);
    // peak 210k → trough 195k → 7.142...%
    expect(r.headline.maxDrawdownPct).toBeGreaterThan(7);
    expect(r.headline.maxDrawdownPct).toBeLessThan(8);
    // peak 210k → current 200k → ~4.76%
    expect(r.headline.currentDrawdownPct).toBeGreaterThan(4);
    expect(r.headline.currentDrawdownPct).toBeLessThan(5);
    expect(r.headline.ulcerIndex).not.toBeNull();
    expect(r.headline.ulcerIndex! > 0).toBe(true);
  });

  it("emits a non-null Sharpe when daily returns have variance", () => {
    // 6 days of alternating returns produce a non-null Sharpe.
    const snapshots: ArcaPortfolioSnapshot[] = [
      snap({ id: 6, snapshotAt: "2026-05-06T20:00:00Z", totalEquity: 204_000 }),
      snap({ id: 5, snapshotAt: "2026-05-05T20:00:00Z", totalEquity: 202_000 }),
      snap({ id: 4, snapshotAt: "2026-05-04T20:00:00Z", totalEquity: 205_000 }),
      snap({ id: 3, snapshotAt: "2026-05-03T20:00:00Z", totalEquity: 201_000 }),
      snap({ id: 2, snapshotAt: "2026-05-02T20:00:00Z", totalEquity: 203_000 }),
      snap({ id: 1, snapshotAt: "2026-05-01T20:00:00Z", totalEquity: 200_000 }),
    ];
    const r = computeAnalytics(baseInput({ snapshots, currentEquity: 204_000 }));
    expect(r.headline.sharpe).not.toBeNull();
    expect(r.headline.annualisedVolPct).not.toBeNull();
    expect(r.daily.dayCount).toBe(6);
    expect(r.daily.bestDayPct).not.toBeNull();
    expect(r.daily.positiveDayPct).not.toBeNull();
  });
});

// ───────────────────────────── R distribution + exit reasons

describe("R distribution + exit reasons", () => {
  it("bins trades without double-counting at boundaries", () => {
    const trades: ArcaTrade[] = [
      tradeFix({ id: "a", rMultiple: -4, realisedPnl: -400, outcome: "LOSS", exitReason: "STOP_LOSS" }),
      tradeFix({ id: "b", rMultiple: -1, realisedPnl: -100, outcome: "LOSS", exitReason: "STOP_LOSS" }), // [-1,0)
      tradeFix({ id: "c", rMultiple: 0, realisedPnl: 0, outcome: "BREAKEVEN", exitReason: "MANUAL_SIM_CLOSE" }), // [0,1)
      tradeFix({ id: "d", rMultiple: 1, realisedPnl: 100, outcome: "WIN", exitReason: "TAKE_PROFIT" }),  // [1,2)
      tradeFix({ id: "e", rMultiple: 3, realisedPnl: 300, outcome: "WIN", exitReason: "TAKE_PROFIT" }),  // ≥3
    ];
    const r = computeAnalytics(baseInput({ trades }));
    expect(r.rDistribution.find((b) => b.bin === "<-3R")!.count).toBe(1);
    expect(r.rDistribution.find((b) => b.bin === "[-1R,0)")!.count).toBe(1);
    expect(r.rDistribution.find((b) => b.bin === "[0,1R)")!.count).toBe(1);
    expect(r.rDistribution.find((b) => b.bin === "[1R,2R)")!.count).toBe(1);
    expect(r.rDistribution.find((b) => b.bin === "≥3R")!.count).toBe(1);
    const total = r.rDistribution.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(5);
  });

  it("groups exit reasons and aggregates pnl/avgR", () => {
    const trades: ArcaTrade[] = [
      tradeFix({ id: "a", rMultiple: 2, realisedPnl: 200, outcome: "WIN", exitReason: "TAKE_PROFIT" }),
      tradeFix({ id: "b", rMultiple: 1, realisedPnl: 100, outcome: "WIN", exitReason: "TAKE_PROFIT" }),
      tradeFix({ id: "c", rMultiple: -1, realisedPnl: -100, outcome: "LOSS", exitReason: "STOP_LOSS" }),
    ];
    const r = computeAnalytics(baseInput({ trades }));
    const tp = r.exitReasons.find((x) => x.reason === "TAKE_PROFIT")!;
    expect(tp.count).toBe(2);
    expect(tp.pnl).toBe(300);
    expect(tp.avgR).toBe(1.5);
    const sl = r.exitReasons.find((x) => x.reason === "STOP_LOSS")!;
    expect(sl.count).toBe(1);
    expect(sl.avgR).toBe(-1);
  });
});

// ───────────────────────────── holding periods

describe("holding periods", () => {
  it("averages hours separately for winners and losers", () => {
    const trades: ArcaTrade[] = [
      tradeFix({ id: "w1", outcome: "WIN",  entryTime: "2026-05-01T00:00:00Z", exitTime: "2026-05-01T02:00:00Z" }), // 2h
      tradeFix({ id: "w2", outcome: "WIN",  entryTime: "2026-05-01T00:00:00Z", exitTime: "2026-05-01T04:00:00Z" }), // 4h
      tradeFix({ id: "l1", outcome: "LOSS", entryTime: "2026-05-01T00:00:00Z", exitTime: "2026-05-01T01:00:00Z" }), // 1h
    ];
    const r = computeAnalytics(baseInput({ trades }));
    expect(r.holdingPeriods.winnersHours).toBe(3);
    expect(r.holdingPeriods.losersHours).toBe(1);
  });
});

// ───────────────────────────── Kelly

describe("Kelly", () => {
  it("returns kelly = 0.4 for 60%/1.0 payoff (positive edge)", () => {
    const k = kellyFromStats({ winRatePct: 60, avgWinR: 2, avgLossR: -2, trades: 30, maxSingleTradeRiskPct: 1 });
    // p=.6, q=.4, b=1 → kelly = (1*.6 - .4)/1 = 0.2
    expect(k.kellyFraction).toBeCloseTo(0.2, 3);
    expect(k.cappedFractionPct).toBe(1); // capped at maxSingleTradeRiskPct
  });

  it("returns negative Kelly and zero capped for negative-edge stats", () => {
    const k = kellyFromStats({ winRatePct: 40, avgWinR: 1, avgLossR: -1, trades: 30, maxSingleTradeRiskPct: 1 });
    expect(k.kellyFraction!).toBeLessThan(0);
    expect(k.cappedFractionPct).toBe(0);
    expect(k.recommendation.toLowerCase()).toContain("negative edge");
  });

  it("flags low-confidence under 10 trades", () => {
    const k = kellyFromStats({ winRatePct: 60, avgWinR: 2, avgLossR: -2, trades: 6, maxSingleTradeRiskPct: 1 });
    expect(k.recommendation.toLowerCase()).toContain("low confidence");
  });

  it("groups Kelly per playbook and sorts by total P&L desc", () => {
    const trades: ArcaTrade[] = [
      tradeFix({ id: "a", rMultiple: 2, realisedPnl: 200, outcome: "WIN", playbookId: "X" }),
      tradeFix({ id: "b", rMultiple: 2, realisedPnl: 200, outcome: "WIN", playbookId: "X" }),
      tradeFix({ id: "c", rMultiple: -1, realisedPnl: -100, outcome: "LOSS", playbookId: "X" }),
      tradeFix({ id: "d", rMultiple: 1, realisedPnl: 50, outcome: "WIN", playbookId: "Y" }),
    ];
    const r = computeAnalytics(baseInput({ trades }));
    expect(r.kelly.byPlaybook[0].playbookId).toBe("X");
    expect(r.kelly.byPlaybook[0].totalPnl).toBe(300);
    expect(r.kelly.byPlaybook[1].playbookId).toBe("Y");
  });
});

// ───────────────────────────── risk of ruin

describe("computeRiskOfRuin", () => {
  it("is 100% when edge is non-positive", () => {
    const r = computeRiskOfRuin(40, 1, 1);
    expect(r.estimatePct).toBe(100);
    expect(r.edgePerR! <= 0).toBe(true);
  });

  it("is between 0 and 100% for a thin positive edge", () => {
    // 51% / 1.0 payoff / 1% risk → edge per R = 0.02, bankroll = 100R.
    // Strong edges crush RoR toward 0 (correctly), so we test a thin edge.
    const r = computeRiskOfRuin(51, 1, 1);
    expect(r.estimatePct).toBeGreaterThan(0);
    expect(r.estimatePct).toBeLessThan(100);
    expect(r.bankrollInR).toBe(100);
  });

  it("decreases (or stays the same) as bankroll-in-R grows", () => {
    const a = computeRiskOfRuin(51, 1, 2).estimatePct;     // 50R bankroll
    const b = computeRiskOfRuin(51, 1, 1).estimatePct;     // 100R bankroll
    expect(b).toBeLessThanOrEqual(a);
  });
});

// ───────────────────────────── confidence calibration

describe("confidence calibration", () => {
  it("only considers WIN/LOSS trades with a confidence", () => {
    const trades: ArcaTrade[] = [
      // bucket 60-70 (midpoint 65)
      tradeFix({ id: "a", outcome: "WIN", arcaConfidence: 60 }),
      tradeFix({ id: "b", outcome: "WIN", arcaConfidence: 65 }),
      tradeFix({ id: "c", outcome: "LOSS", arcaConfidence: 69 }),
      // bucket 80-90 (midpoint 85)
      tradeFix({ id: "d", outcome: "WIN", arcaConfidence: 80 }),
      tradeFix({ id: "e", outcome: "WIN", arcaConfidence: 85 }),
      // ignored
      tradeFix({ id: "f", outcome: "BREAKEVEN", arcaConfidence: 50 }),
      tradeFix({ id: "g", outcome: "WIN", arcaConfidence: null }),
    ];
    const r = computeAnalytics(baseInput({ trades }));
    const b6070 = r.calibration.find((c) => c.bucket === "60-70")!;
    expect(b6070.trades).toBe(3);
    expect(b6070.wins).toBe(2);
    expect(b6070.observedWinRatePct).toBeCloseTo(66.67, 1);
    expect(b6070.expectedWinRatePct).toBe(65);
    const b8090 = r.calibration.find((c) => c.bucket === "80-90")!;
    expect(b8090.trades).toBe(2);
    expect(b8090.wins).toBe(2);
    expect(b8090.observedWinRatePct).toBe(100);
  });
});

// ───────────────────────────── stress

describe("open book stress", () => {
  it("sums if-all-stops-hit and if-all-tp1-hit dollars for longs and shorts", () => {
    // Long AAPL 100@100, stop 95, tp1 115, qty 100 → loss -500, gain +1500
    // Short MSFT 100@200, stop 210, tp1 180, qty 50 → loss = (210-200)*-50 = -500; gain = (180-200)*-50 = +1000
    const positions: ArcaPosition[] = [
      position({ id: "a", symbol: "AAPL", side: "LONG", quantity: 100, averageEntry: 100, currentPrice: 100, stopLoss: 95, takeProfit1: 115 }),
      position({ id: "b", symbol: "MSFT", side: "SHORT", quantity: 50, averageEntry: 200, currentPrice: 200, stopLoss: 210, takeProfit1: 180 }),
    ];
    const r = computeAnalytics(baseInput({ positions, currentEquity: 200_000 }));
    expect(r.stress.openPositions).toBe(2);
    expect(r.stress.ifAllStopsHitDollars).toBe(-1000);
    expect(r.stress.ifAllTp1HitDollars).toBe(2500);
    expect(r.stress.totalNotional).toBe(20_000); // AAPL 10k + MSFT 10k
    expect(r.stress.netPlannedRR).toBe(2.5);
  });

  it("computes concentration vs equity", () => {
    // One $20k position vs $100k equity = 20% single, 20% top-3
    const positions: ArcaPosition[] = [
      position({ symbol: "AAPL", side: "LONG", quantity: 200, averageEntry: 100, currentPrice: 100 }),
    ];
    const r = computeAnalytics(baseInput({ positions, currentEquity: 100_000 }));
    expect(r.stress.maxSinglePositionPctOfEquity).toBe(20);
    expect(r.stress.top3ConcentrationPctOfEquity).toBe(20);
  });
});

// ───────────────────────────── benchmark

describe("benchmark metrics", () => {
  it("computes beta ≈ 1 and IR ≈ 0 when ARCA mirrors the benchmark", () => {
    // Same return series for ARCA and benchmark, with REAL variance — a
    // monotone +1%/day series collapses variance and makes beta numerically
    // unstable. ARCA is proportional to benchmark (2000×), so daily returns
    // are identical → beta=1, R²=1, IR=0.
    const dates = ["05-01","05-02","05-03","05-04","05-05","05-06"];
    const benchSeries = [100, 105, 95, 110, 100, 108];
    const arcaSeries  = benchSeries.map((b) => b * 2000); // 200k, 210k, 190k…
    const snapshots: ArcaPortfolioSnapshot[] = dates.map((d, i) => snap({
      id: dates.length - i,
      snapshotAt: `2026-${d}T20:00:00Z`,
      totalEquity: arcaSeries[i],
    })).reverse();
    const benchSnaps: BenchmarkSnap[] = dates.map((d, i) => ({
      snapshotAt: `2026-${d}T20:00:00Z`,
      benchmarkSymbol: "SPY",
      benchmarkValue: benchSeries[i],
      benchmarkReturnPct: null,
      arcaReturnPct: null,
      relativePerformancePct: null,
    })).reverse();

    const r = computeAnalytics(baseInput({
      snapshots,
      benchmarkSnaps: benchSnaps,
      currentEquity: arcaSeries[arcaSeries.length - 1],
    }));
    expect(r.benchmark).not.toBeNull();
    expect(r.benchmark!.beta!).toBeGreaterThan(0.95);
    expect(r.benchmark!.beta!).toBeLessThan(1.05);
    expect(r.benchmark!.r2!).toBeGreaterThan(0.99);
    expect(Math.abs(r.benchmark!.informationRatio ?? 0)).toBeLessThan(0.01);
  });

  it("reports no pairs when there is no overlap", () => {
    const snapshots: ArcaPortfolioSnapshot[] = [
      snap({ id: 1, snapshotAt: "2026-05-01T20:00:00Z", totalEquity: 200_000 }),
    ];
    const benchSnaps: BenchmarkSnap[] = [
      { snapshotAt: "2026-04-01T20:00:00Z", benchmarkSymbol: "SPY", benchmarkValue: 100, benchmarkReturnPct: null, arcaReturnPct: null, relativePerformancePct: null },
    ];
    const r = computeAnalytics(baseInput({ snapshots, benchmarkSnaps: benchSnaps }));
    expect(r.benchmark!.pairs).toBe(0);
    expect(r.benchmark!.beta).toBeNull();
  });
});

// ───────────────────────────── rolling series

describe("rolling drawdown", () => {
  it("tracks peak across the chronological equity series", () => {
    const snapshots: ArcaPortfolioSnapshot[] = [
      snap({ id: 4, snapshotAt: "2026-05-04T20:00:00Z", totalEquity: 195_000 }),  // trough
      snap({ id: 3, snapshotAt: "2026-05-03T20:00:00Z", totalEquity: 210_000 }),  // peak
      snap({ id: 2, snapshotAt: "2026-05-02T20:00:00Z", totalEquity: 205_000 }),
      snap({ id: 1, snapshotAt: "2026-05-01T20:00:00Z", totalEquity: 200_000 }),
    ];
    const r = computeAnalytics(baseInput({ snapshots, currentEquity: 195_000 }));
    expect(r.rolling.series.length).toBe(4);
    // Last point should be at the trough → DD ≈ 7.14%
    const last = r.rolling.series[r.rolling.series.length - 1];
    expect(last.drawdownPct).toBeGreaterThan(7);
    expect(last.drawdownPct).toBeLessThan(8);
    // First point: equity == starting balance peak, DD = 0
    expect(r.rolling.series[0].drawdownPct).toBe(0);
  });
});
