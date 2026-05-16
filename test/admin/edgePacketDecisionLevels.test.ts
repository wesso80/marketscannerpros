/**
 * AdminEdgePacket decision-level projection tests.
 *
 * Verifies projectEdgePacket populates the explicit entry/stopLoss/
 * takeProfit/riskReward block per spec, with no fabrication when
 * targets are missing.
 */

import { describe, expect, it } from "vitest";
import { projectEdgePacket } from "../../lib/admin/edgePacket";
import type { AdminResearchPacket } from "../../lib/admin/getAdminResearchPacket";

function basePacket(overrides: Partial<AdminResearchPacket> = {}): AdminResearchPacket {
  return {
    packetId: "pkt-test-1",
    createdAt: new Date().toISOString(),
    symbol: "AAPL",
    market: "EQUITIES",
    assetClass: "equity",
    timeframe: "15m",
    quote: { price: 200, changePercent: 0, lastScanAt: new Date().toISOString() },
    snapshot: {
      symbol: "AAPL", timeframe: "15m", session: "RTH", price: 201, changePercent: 0,
      bias: "LONG", regime: "TREND_UP", permission: "GO", confidence: 0.7,
      symbolTrust: 0.6, sizeMultiplier: 1, lastScanAt: new Date().toISOString(),
      blockReasons: [], penalties: [],
      indicators: { ema20: 195, ema50: 190, ema200: 180, vwap: 198, atr: 2, bbwpPercentile: 50, adx: 28, rvol: 1.5 },
      dve: { state: "TREND", direction: "UP", persistence: 0.7, breakoutReadiness: 0.5, trap: false, exhaustion: false },
      timeConfluence: { score: 0.6, hotWindow: false, alignmentCount: 2, nextClusterAt: new Date().toISOString() },
      levels: { pdh: 205, pdl: 195, weeklyHigh: 210, weeklyLow: 190, monthlyHigh: 220, monthlyLow: 180, midpoint: 200, vwap: 198 },
      targets: { entry: 200, invalidation: 195, target1: 205, target2: 210, target3: 215 },
    } as unknown as AdminResearchPacket["snapshot"],
    dataTruth: { status: "LIVE", trustScore: 80 } as AdminResearchPacket["dataTruth"],
    internalResearchScore: {
      score: 65, lifecycle: "READY", dominantAxis: "trend",
      axes: { trend: 70, time: 60, volatility: 50, structure: 60, options: 50, flow: 55, regime: 60, news: 50, history: 60 },
      penalties: [], boosts: [],
    } as unknown as AdminResearchPacket["internalResearchScore"],
    rawResearchScore: 65, dataTrustScore: 80, trustAdjustedScore: 65, scoreDecayReason: "",
    setup: { type: "TREND_CONTINUATION", label: "Trend continuation", description: "" } as AdminResearchPacket["setup"],
    volatilityState: { state: "EXPANDING", persistence: 0.6, breakoutReadiness: 0.6, trap: false, exhaustion: false },
    timeConfluence: { score: 0.6, hotWindow: false, alignmentCount: 2, nextClusterAt: new Date().toISOString() },
    optionsIntelligence: { available: false } as AdminResearchPacket["optionsIntelligence"],
    macroContext: { regime: "NEUTRAL", note: "" },
    newsContext: { status: "CALM", note: "" },
    earningsContext: {} as AdminResearchPacket["earningsContext"],
    cryptoContext: { enabled: false, note: "n/a" },
    liquidityLevels: { pdh: 205, pdl: 195, weeklyHigh: 210, weeklyLow: 190, monthlyHigh: 220, monthlyLow: 180, vwap: 198 },
    journalLearningMatch: { matched: false, fit: 0, reason: "" },
    contradictionFlags: [],
    invalidationConditions: ["Close below 195"],
    nextResearchChecks: ["Confirm hold above VWAP"],
    trapDetection: { trapRiskScore: 20 } as AdminResearchPacket["trapDetection"],
    lifecycle: "READY", bias: "LONG",
    primaryReason: "Trend continuation",
    mainRisk: "Loss of momentum below VWAP",
    whatChanged: "ADX expanded above 25",
    alertEligibility: { eligible: true } as AdminResearchPacket["alertEligibility"],
    ...overrides,
  };
}

describe("projectEdgePacket — decision levels", () => {
  it("populates entry/stop/TP/RR from snapshot.targets for LONG bias", () => {
    const ep = projectEdgePacket(basePacket());
    expect(ep.entry.trigger).toBe(200);
    expect(ep.stopLoss.level).toBe(195);
    expect(ep.takeProfit.tp1).toBe(205);
    expect(ep.takeProfit.tp2).toBe(210);
    expect(ep.takeProfit.tp3).toBe(215);
    // Risk = 5, Reward to TP1 = 5 → 1.00R
    expect(ep.riskReward.rrToTp1).toBe(1);
    expect(ep.riskReward.rrToTp2).toBe(2);
    expect(ep.riskReward.rrToTp3).toBe(3);
    // LONG bias + price above trigger → aggressive entry = price
    expect(ep.entry.aggressiveEntry).toBe(201);
  });

  it("returns nulls (no fabrication) when targets are missing/zero", () => {
    const pkt = basePacket();
    pkt.snapshot.targets = { entry: 0, invalidation: 0, target1: 0, target2: 0, target3: 0 };
    const ep = projectEdgePacket(pkt);
    expect(ep.entry.trigger).toBeNull();
    expect(ep.stopLoss.level).toBeNull();
    expect(ep.takeProfit.tp1).toBeNull();
    expect(ep.riskReward.rrToTp1).toBeNull();
    expect(ep.entry.explanation).toMatch(/no structured entry/i);
  });

  it("computes RR symmetrically for SHORT bias", () => {
    const pkt = basePacket();
    pkt.snapshot.bias = "SHORT";
    pkt.snapshot.targets = { entry: 200, invalidation: 205, target1: 195, target2: 190, target3: 185 };
    pkt.snapshot.price = 199;
    const ep = projectEdgePacket(pkt);
    expect(ep.entry.trigger).toBe(200);
    expect(ep.stopLoss.level).toBe(205);
    expect(ep.takeProfit.tp1).toBe(195);
    // |200-205| = 5 risk, |195-200| = 5 reward → 1R
    expect(ep.riskReward.rrToTp1).toBe(1);
    expect(ep.riskReward.rrToTp3).toBe(3);
    // SHORT bias + price below trigger → aggressive entry = price
    expect(ep.entry.aggressiveEntry).toBe(199);
  });
});
