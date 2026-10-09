/**
 * Evidence Quality reflects missing context (rules: missing options data reduces Evidence Quality, never a proxy):
 * synthetic options, unknown catalyst / regime / news, no crypto derivatives context. The opportunity rank keeps its
 * data-trust cap. The options axis counts in the rank only with real options-chain data.
 */
import { describe, expect, it } from "vitest";
import { MISSING_CONTEXT_PENALTY, evidenceCompleteness, projectEdgePacket } from "../../lib/admin/edgePacket";
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

const realOptions = { dataTruth: { status: "LIVE", trustScore: 90 }, missingInputs: [] } as unknown as AdminResearchPacket["optionsIntelligence"];
const syntheticOptions = { dataTruth: { status: "MISSING", trustScore: 0 }, missingInputs: ["Real options chain data not available"], fallbackScore: 50 } as unknown as AdminResearchPacket["optionsIntelligence"];
const knownEarnings = { classification: "NO_EVENT_IN_WINDOW" } as unknown as AdminResearchPacket["earningsContext"];

describe("Evidence Quality and missing context", () => {
  it("equity with every piece of context present keeps the full data-trust score", () => {
    const ep = projectEdgePacket(basePacket({ optionsIntelligence: realOptions, earningsContext: knownEarnings }));
    expect(ep.missingFields).toEqual([]);
    expect(ep.evidenceQualityScore).toBe(80);
  });

  it("synthetic options, unknown earnings, unclassified regime and unknown news each lower it and are listed", () => {
    const p = basePacket({
      optionsIntelligence: syntheticOptions,
      earningsContext: { classification: "UNKNOWN" } as unknown as AdminResearchPacket["earningsContext"],
      newsContext: { status: "UNKNOWN", note: "" },
    });
    (p.snapshot as { regime: string }).regime = "UNCLASSIFIED";
    const ep = projectEdgePacket(p);
    expect(ep.missingFields).toEqual([
      "options: real chain data unavailable (synthetic placeholder ignored)",
      "catalyst: earnings/event schedule unknown",
      "regime: unclassified",
      "news: status unknown",
    ]);
    const factor = 1 - (MISSING_CONTEXT_PENALTY.options + MISSING_CONTEXT_PENALTY.catalyst + MISSING_CONTEXT_PENALTY.regime + MISSING_CONTEXT_PENALTY.news);
    expect(ep.evidenceQualityScore).toBe(Math.round(80 * factor));
    expect(ep.evidenceQualityScore).toBeLessThan(80);
  });

  it("a crypto symbol is marked as having no options chain and no derivatives context (spot data only)", () => {
    const { missing } = evidenceCompleteness(basePacket({ assetClass: "crypto", optionsIntelligence: realOptions }));
    expect(missing).toContain("options: no options chain for spot crypto");
    expect(missing).toContain("crypto derivatives: funding/OI context unavailable");
    expect(missing.some((m) => m.startsWith("catalyst"))).toBe(false);
  });

  it("lowering Evidence Quality for missing catalyst / news does not change the opportunity rank", () => {
    const full = projectEdgePacket(basePacket({ optionsIntelligence: syntheticOptions, earningsContext: knownEarnings }));
    const thin = projectEdgePacket(basePacket({ optionsIntelligence: syntheticOptions, newsContext: { status: "UNKNOWN", note: "" } }));
    expect(thin.evidenceQualityScore).toBeLessThan(full.evidenceQualityScore);
    expect(thin.opportunityRankScore).toBe(full.opportunityRankScore);
  });

  it("the options axis counts only with real options data; otherwise it is left out, not filled with 50", () => {
    const axes = (options: number) => ({ ...basePacket().internalResearchScore, axes: { ...basePacket().internalResearchScore.axes, options } }) as AdminResearchPacket["internalResearchScore"];
    const synthLow = projectEdgePacket(basePacket({ optionsIntelligence: syntheticOptions, internalResearchScore: axes(0) }));
    const synthHigh = projectEdgePacket(basePacket({ optionsIntelligence: syntheticOptions, internalResearchScore: axes(100) }));
    expect(synthLow.optionsScore).toBeNull();
    expect(synthHigh.opportunityRankScore).toBe(synthLow.opportunityRankScore); // proxy value has no effect
    const realLow = projectEdgePacket(basePacket({ optionsIntelligence: realOptions, internalResearchScore: axes(0) }));
    const realHigh = projectEdgePacket(basePacket({ optionsIntelligence: realOptions, internalResearchScore: axes(100) }));
    expect(realLow.optionsScore).toBe(0);
    expect(realHigh.opportunityRankScore).toBeGreaterThan(realLow.opportunityRankScore);
  });
});
