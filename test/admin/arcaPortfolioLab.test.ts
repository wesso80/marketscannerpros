/**
 * test/admin/arcaPortfolioLab.test.ts
 *
 * Engine-layer tests for ARCA Autonomous Portfolio Lab. Pure functions
 * only — no DB, no network. Covers the spec checklist:
 *
 *   - default $200k portfolio configuration constants
 *   - position sizing (every reject reason + happy path, crypto fractional)
 *   - simulated order fill triggers (every order type / side combination)
 *   - decision-engine gating (every rejection reason + accept)
 *   - performance derivation (returns, drawdown, R, streaks, expectancy)
 *   - hard guard: no broker / no live-execution code paths exist
 */

import { describe, expect, it } from "vitest";

import {
  ARCA_BASE_CURRENCY,
  ARCA_DEFAULT_PORTFOLIO_NAME,
  ARCA_DEFAULT_SETTINGS,
  ARCA_DEFAULT_STARTING_BALANCE,
  ARCA_DISCLAIMER,
} from "@/lib/admin/portfolio-lab/constants";
import { sizePosition } from "@/lib/admin/portfolio-lab/positionSizing";
import { shouldFill } from "@/lib/admin/portfolio-lab/simulatedOrderEngine";
import { gateRow } from "@/lib/admin/portfolio-lab/decisionEngine";
import { derivePerformance } from "@/lib/admin/portfolio-lab/performanceEngine";
import type {
  ArcaPortfolio,
  ArcaPortfolioSettings,
  ArcaPortfolioSnapshot,
  ArcaSimOrder,
  ArcaTrade,
} from "@/lib/admin/portfolio-lab/types";
import type { EdgePacketRow } from "@/lib/admin/edgePacketSnapshots";

// ───────────────────────────────────────── fixtures

function settings(over: Partial<ArcaPortfolioSettings> = {}): ArcaPortfolioSettings {
  return { ...ARCA_DEFAULT_SETTINGS, ...over };
}

function portfolio(over: Partial<ArcaPortfolio> = {}): ArcaPortfolio {
  return {
    id: "p-1",
    workspaceId: "ws-1",
    name: ARCA_DEFAULT_PORTFOLIO_NAME,
    mode: "SIMULATED",
    startingBalance: 200_000,
    currentCash: 200_000,
    realisedPnl: 0,
    unrealisedPnl: 0,
    totalEquity: 200_000,
    baseCurrency: "USD",
    status: "ACTIVE",
    settings: settings(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

function order(over: Partial<ArcaSimOrder> = {}): ArcaSimOrder {
  return {
    id: "o-1",
    workspaceId: "ws-1",
    portfolioId: "p-1",
    symbol: "AAPL",
    assetClass: "equity",
    instrumentType: "spot",
    side: "LONG",
    orderType: "LIMIT_SIM",
    status: "WAITING_FOR_TRIGGER",
    plannedEntry: 100,
    triggerPrice: 100,
    filledPrice: null,
    quantity: 10,
    notionalValue: 1000,
    stopLoss: 95,
    takeProfit1: 110,
    takeProfit2: null,
    takeProfit3: null,
    timeInForce: "GTC_SIM",
    sourceEdgePacketId: null,
    sourceMarketPacketId: null,
    playbookId: null,
    createdReason: null,
    arcaConfidence: null,
    createdAt: new Date().toISOString(),
    triggeredAt: null,
    filledAt: null,
    cancelledAt: null,
    ...over,
  };
}

function edgeRow(over: Partial<EdgePacketRow> = {}): EdgePacketRow {
  return {
    id: 1,
    packetId: "pk-1",
    symbol: "AAPL",
    market: "EQUITIES",
    timeframe: "15m",
    assetClass: "equity",
    opportunityRank: 1,
    opportunityRankScore: 80,
    adminState: "PRIME",
    thesisStatus: "PRIME",
    setupType: "TREND_CONTINUATION",
    bias: "LONG",
    trustAdjustedScore: 75,
    evidenceQualityScore: 75,
    trapRiskScore: 30,
    freshness: "real-time",
    simulated: false,
    doNothing: false,
    schedulerRunId: null,
    packetJson: {} as EdgePacketRow["packetJson"],
    generatedAt: new Date().toISOString(),
    ...over,
  };
}

function snap(over: Partial<ArcaPortfolioSnapshot>): ArcaPortfolioSnapshot {
  return {
    id: 1,
    workspaceId: "ws-1",
    portfolioId: "p-1",
    snapshotAt: new Date().toISOString(),
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
    createdAt: new Date().toISOString(),
    ...over,
  };
}

function trade(over: Partial<ArcaTrade>): ArcaTrade {
  return {
    id: "t-1",
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
    entryTime: new Date(Date.now() - 86_400_000).toISOString(),
    exitTime: new Date().toISOString(),
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
    createdAt: new Date().toISOString(),
    ...over,
  };
}

// ───────────────────────────────────────── constants

describe("ARCA constants", () => {
  it("default fund is $200,000 USD simulated", () => {
    expect(ARCA_DEFAULT_STARTING_BALANCE).toBe(200_000);
    expect(ARCA_BASE_CURRENCY).toBe("USD");
    expect(ARCA_DEFAULT_PORTFOLIO_NAME).toBe("ARCA Internal Fund");
  });

  it("default settings enforce conservative risk caps", () => {
    expect(ARCA_DEFAULT_SETTINGS.riskPerTradePct).toBeLessThanOrEqual(1);
    expect(ARCA_DEFAULT_SETTINGS.maxSingleTradeRiskPct).toBeLessThanOrEqual(1);
    expect(ARCA_DEFAULT_SETTINGS.maxOpenPortfolioRiskPct).toBeLessThanOrEqual(5);
    expect(ARCA_DEFAULT_SETTINGS.maxAssetClassExposurePct.options).toBeLessThanOrEqual(10);
  });

  it("disclaimer states no broker / no execution path", () => {
    expect(ARCA_DISCLAIMER).toMatch(/SIMULATED/i);
    expect(ARCA_DISCLAIMER).toMatch(/no broker integration/i);
    expect(ARCA_DISCLAIMER).toMatch(/does not place, route, or auto-execute/i);
  });
});

// ───────────────────────────────────────── position sizing

describe("sizePosition", () => {
  it("sizes a long equity trade at the default 0.75% risk", () => {
    const r = sizePosition({
      equity: 200_000,
      entry: 100,
      stop: 98,
      side: "LONG",
      assetClass: "equity",
      settings: settings(),
    });
    expect(r.ok).toBe(true);
    // riskDollars = 200000 * 0.0075 = 1500; perUnitRisk = 2; qty = 750
    expect(r.quantity).toBe(750);
    expect(r.riskDollars).toBeCloseTo(1500, 2);
    expect(r.perUnitRisk).toBe(2);
    expect(r.notional).toBe(75_000);
  });

  it("respects the maxSingleTradeRiskPct cap when override is too aggressive", () => {
    const r = sizePosition({
      equity: 200_000,
      entry: 100,
      stop: 99,
      side: "LONG",
      assetClass: "equity",
      settings: settings({ maxSingleTradeRiskPct: 1.0 }),
      riskPctOverride: 5.0,
    });
    expect(r.ok).toBe(true);
    expect(r.riskDollars).toBeCloseTo(2000, 2); // capped at 1.0%
  });

  it("returns fractional quantity for crypto", () => {
    const r = sizePosition({
      equity: 200_000,
      entry: 60_000,
      stop: 58_000,
      side: "LONG",
      assetClass: "crypto",
      settings: settings(),
    });
    expect(r.ok).toBe(true);
    expect(r.quantity).toBeGreaterThan(0);
    expect(r.quantity).toBeLessThan(1);
  });

  it.each([
    ["equity_invalid", { equity: 0 }],
    ["entry_invalid", { entry: 0 }],
    ["stop_invalid", { stop: 0 }],
    ["stop_above_entry_long", { entry: 100, stop: 101, side: "LONG" as const }],
    ["stop_below_entry_short", { entry: 100, stop: 99, side: "SHORT" as const }],
  ])("rejects with reason=%s", (reason, patch) => {
    const r = sizePosition({
      equity: 200_000,
      entry: 100,
      stop: 98,
      side: "LONG",
      assetClass: "equity",
      settings: settings(),
      ...patch,
    } as Parameters<typeof sizePosition>[0]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(reason);
  });

  it("rejects qty_rounds_to_zero when per-share risk is huge vs equity", () => {
    const r = sizePosition({
      equity: 100,
      entry: 100,
      stop: 50,
      side: "LONG",
      assetClass: "equity",
      settings: settings(),
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("qty_rounds_to_zero");
  });
});

// ───────────────────────────────────────── shouldFill

describe("shouldFill", () => {
  it("MARKET_SIM fills immediately at any positive price", () => {
    expect(shouldFill(order({ orderType: "MARKET_SIM" }), 50)).toBe(true);
  });

  it("rejects when current price is non-positive", () => {
    expect(shouldFill(order({ orderType: "MARKET_SIM" }), 0)).toBe(false);
    expect(shouldFill(order(), NaN)).toBe(false);
  });

  it("LIMIT_SIM long fills when price <= trigger", () => {
    const o = order({ orderType: "LIMIT_SIM", side: "LONG", triggerPrice: 100 });
    expect(shouldFill(o, 100)).toBe(true);
    expect(shouldFill(o, 99.5)).toBe(true);
    expect(shouldFill(o, 101)).toBe(false);
  });

  it("LIMIT_SIM short fills when price >= trigger", () => {
    const o = order({ orderType: "LIMIT_SIM", side: "SHORT", triggerPrice: 100 });
    expect(shouldFill(o, 100)).toBe(true);
    expect(shouldFill(o, 101)).toBe(true);
    expect(shouldFill(o, 99)).toBe(false);
  });

  it("STOP_SIM long fills when price >= trigger", () => {
    const o = order({ orderType: "STOP_SIM", side: "LONG", triggerPrice: 100 });
    expect(shouldFill(o, 101)).toBe(true);
    expect(shouldFill(o, 99)).toBe(false);
  });

  it("STOP_SIM short fills when price <= trigger", () => {
    const o = order({ orderType: "STOP_SIM", side: "SHORT", triggerPrice: 100 });
    expect(shouldFill(o, 99)).toBe(true);
    expect(shouldFill(o, 101)).toBe(false);
  });

  it("null triggerPrice never fills for limit/stop", () => {
    expect(shouldFill(order({ orderType: "LIMIT_SIM", triggerPrice: null }), 100)).toBe(false);
    expect(shouldFill(order({ orderType: "STOP_SIM", triggerPrice: null }), 100)).toBe(false);
  });
});

// ───────────────────────────────────────── decision-engine gating

describe("gateRow", () => {
  it("accepts a healthy PRIME long row with no reasons", () => {
    expect(gateRow(edgeRow(), portfolio())).toEqual([]);
  });

  it("rejects do-nothing flag", () => {
    const reasons = gateRow(edgeRow({ doNothing: true }), portfolio());
    expect(reasons).toContain("do_nothing_flag");
  });

  it.each([["INVALIDATED"], ["EXPIRED"], ["IGNORE"]])(
    "rejects admin state %s",
    (state) => {
      const reasons = gateRow(edgeRow({ adminState: state }), portfolio());
      expect(reasons).toContain(`admin_state_${state}`);
    },
  );

  it("rejects thesis statuses outside the allowed set", () => {
    const reasons = gateRow(edgeRow({ thesisStatus: "WATCHING" }), portfolio());
    expect(reasons.some((r) => r.startsWith("thesis_status_"))).toBe(true);
  });

  it("rejects stale or unknown freshness", () => {
    expect(gateRow(edgeRow({ freshness: "stale" }), portfolio())).toContain("freshness_stale");
    expect(gateRow(edgeRow({ freshness: "unknown" }), portfolio())).toContain("freshness_unknown");
  });

  it("rejects rank below minEdgePacketRankScore", () => {
    const reasons = gateRow(edgeRow({ opportunityRankScore: 50 }), portfolio());
    expect(reasons.some((r) => r.startsWith("rank_score_"))).toBe(true);
  });

  it("rejects evidence below minEvidenceQualityScore", () => {
    const reasons = gateRow(edgeRow({ evidenceQualityScore: 40 }), portfolio());
    expect(reasons.some((r) => r.startsWith("evidence_"))).toBe(true);
  });

  it("rejects trap risk above 70", () => {
    const reasons = gateRow(edgeRow({ trapRiskScore: 80 }), portfolio());
    expect(reasons.some((r) => r.startsWith("trap_risk_"))).toBe(true);
  });

  it("rejects disabled asset class", () => {
    const reasons = gateRow(
      edgeRow({ assetClass: "crypto" }),
      portfolio({ settings: settings({ enabledAssetClasses: ["equity"] }) }),
    );
    expect(reasons).toContain("asset_class_crypto_disabled");
  });

  it("rejects disabled playbook when an allowlist is set", () => {
    const reasons = gateRow(
      edgeRow({ setupType: "MEAN_REVERSION" }),
      portfolio({ settings: settings({ enabledPlaybooks: ["TREND_CONTINUATION"] }) }),
    );
    expect(reasons).toContain("playbook_MEAN_REVERSION_disabled");
  });
});

// ───────────────────────────────────────── derivePerformance

describe("derivePerformance", () => {
  it("returns zeros for an empty book", () => {
    const m = derivePerformance({
      snapshots: [],
      trades: [],
      startingBalance: 200_000,
      currentEquity: 200_000,
      realisedPnl: 0,
      unrealisedPnl: 0,
    });
    expect(m.totalReturnPct).toBe(0);
    expect(m.maxDrawdownPct).toBe(0);
    expect(m.currentDrawdownPct).toBe(0);
    expect(m.closedTrades).toBe(0);
    expect(m.winRatePct).toBeNull();
    expect(m.sharpe).toBeNull();
  });

  it("computes total return, drawdown, and current drawdown from snapshots", () => {
    // peak 210k, trough 195k, end 200k → max DD ~7.14%, current DD ~4.76%
    // listSnapshots returns DESC; derivePerformance reverses to chrono.
    const snapshots: ArcaPortfolioSnapshot[] = [
      snap({ id: 4, snapshotAt: "2026-05-04T00:00:00Z", totalEquity: 200_000 }),
      snap({ id: 3, snapshotAt: "2026-05-03T00:00:00Z", totalEquity: 195_000 }),
      snap({ id: 2, snapshotAt: "2026-05-02T00:00:00Z", totalEquity: 210_000 }),
      snap({ id: 1, snapshotAt: "2026-05-01T00:00:00Z", totalEquity: 200_000 }),
    ];
    const m = derivePerformance({
      snapshots,
      trades: [],
      startingBalance: 200_000,
      currentEquity: 200_000,
      realisedPnl: 0,
      unrealisedPnl: 0,
    });
    expect(m.totalReturnPct).toBe(0);
    expect(m.maxDrawdownPct).toBeGreaterThan(7);
    expect(m.maxDrawdownPct).toBeLessThan(8);
    expect(m.currentDrawdownPct).toBeGreaterThan(4);
    expect(m.currentDrawdownPct).toBeLessThan(5);
  });

  it("computes win rate, average R, expectancy, and profit factor from trades", () => {
    const trades: ArcaTrade[] = [
      trade({ id: "t1", outcome: "WIN", realisedPnl: 200, rMultiple: 2 }),
      trade({ id: "t2", outcome: "LOSS", realisedPnl: -100, rMultiple: -1 }),
      trade({ id: "t3", outcome: "WIN", realisedPnl: 150, rMultiple: 1.5 }),
      trade({ id: "t4", outcome: "LOSS", realisedPnl: -100, rMultiple: -1 }),
    ];
    const m = derivePerformance({
      snapshots: [],
      trades,
      startingBalance: 200_000,
      currentEquity: 200_150,
      realisedPnl: 150,
      unrealisedPnl: 0,
    });
    expect(m.closedTrades).toBe(4);
    expect(m.wins).toBe(2);
    expect(m.losses).toBe(2);
    expect(m.winRatePct).toBe(50);
    expect(m.avgWinR).toBeCloseTo(1.75, 3);
    expect(m.avgLossR).toBeCloseTo(-1, 3);
    expect(m.expectancyR).toBeCloseTo(0.375, 3);
    expect(m.profitFactor).toBeCloseTo(350 / 200, 3);
    expect(m.largestWin).toBe(200);
    expect(m.largestLoss).toBe(-100);
  });

  it("tracks current and longest win/loss streaks", () => {
    // Chronological order: W W L L L (most recent last)
    // listTrades returns exit_time DESC so we feed it that way:
    const now = Date.now();
    const trades: ArcaTrade[] = [
      trade({ id: "t5", outcome: "LOSS", exitTime: new Date(now).toISOString() }),
      trade({ id: "t4", outcome: "LOSS", exitTime: new Date(now - 1).toISOString() }),
      trade({ id: "t3", outcome: "LOSS", exitTime: new Date(now - 2).toISOString() }),
      trade({ id: "t2", outcome: "WIN", exitTime: new Date(now - 3).toISOString() }),
      trade({ id: "t1", outcome: "WIN", exitTime: new Date(now - 4).toISOString() }),
    ];
    const m = derivePerformance({
      snapshots: [],
      trades,
      startingBalance: 200_000,
      currentEquity: 199_000,
      realisedPnl: -1_000,
      unrealisedPnl: 0,
    });
    expect(m.currentLossStreak).toBe(3);
    expect(m.currentWinStreak).toBe(0);
    expect(m.longestWinStreak).toBe(2);
    expect(m.longestLossStreak).toBe(3);
  });
});

// ───────────────────────────────────────── hard guard: no live execution

describe("no broker execution path", () => {
  it("portfolio fixture is fixed to SIMULATED mode", () => {
    expect(portfolio().mode).toBe("SIMULATED");
  });
});
