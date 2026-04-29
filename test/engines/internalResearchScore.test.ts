import { describe, expect, it } from "vitest";
import { classifySetup } from "../../lib/engines/setupClassifier";
import { computeInternalResearchScore, deriveAxes } from "../../lib/engines/internalResearchScore";
import { computeDataTruth } from "../../lib/engines/dataTruth";
import type { AdminSymbolIntelligence } from "../../lib/admin/types";

function snap(overrides: Partial<AdminSymbolIntelligence> = {}): AdminSymbolIntelligence {
  const base: AdminSymbolIntelligence = {
    symbol: "AAPL",
    timeframe: "15m",
    session: "RTH",
    price: 200,
    changePercent: 0,
    bias: "LONG",
    regime: "TREND_UP",
    permission: "GO",
    confidence: 0.7,
    symbolTrust: 0.6,
    sizeMultiplier: 1,
    lastScanAt: new Date().toISOString(),
    blockReasons: [],
    penalties: [],
    indicators: {
      ema20: 195, ema50: 190, ema200: 180,
      vwap: 198, atr: 2, bbwpPercentile: 50, adx: 28, rvol: 1.5,
    },
    dve: {
      state: "TREND",
      direction: "UP",
      persistence: 0.7,
      breakoutReadiness: 0.5,
      trap: false,
      exhaustion: false,
    },
    timeConfluence: {
      score: 0.6,
      hotWindow: false,
      alignmentCount: 2,
      nextClusterAt: new Date().toISOString(),
    },
    levels: {
      pdh: 205, pdl: 195, weeklyHigh: 210, weeklyLow: 190,
      monthlyHigh: 220, monthlyLow: 180, midpoint: 200, vwap: 198,
    },
    targets: { entry: 200, invalidation: 195, target1: 205, target2: 210, target3: 215 },
    evidence: {
      regimeFit: 0.7, structureQuality: 0.6, timeConfluence: 0.6,
      volatilityAlignment: 0.5, participationFlow: 0.55,
      crossMarketConfirmation: 0.5, eventSafety: 0.7,
      extensionSafety: 0.6, symbolTrust: 0.6, modelHealth: 0.7,
    },
  };
  return { ...base, ...overrides };
}

describe("setupClassifier", () => {
  it("classifies a stacked-EMA bullish trend as TREND_CONTINUATION", () => {
    const s = classifySetup(snap());
    expect(s.type).toBe("TREND_CONTINUATION");
  });

  it("classifies low BBWP + readiness as SQUEEZE_EXPANSION", () => {
    const s = classifySetup(snap({
      indicators: { ...snap().indicators, bbwpPercentile: 5 },
      dve: { ...snap().dve, breakoutReadiness: 0.8 },
    }));
    expect(s.type).toBe("SQUEEZE_EXPANSION");
  });

  it("classifies low BBWP without readiness as VOLATILITY_CONTRACTION", () => {
    const s = classifySetup(snap({
      indicators: { ...snap().indicators, bbwpPercentile: 5 },
      dve: { ...snap().dve, breakoutReadiness: 0.2 },
    }));
    expect(s.type).toBe("VOLATILITY_CONTRACTION");
  });

  it("classifies DVE trap as FAILED_BREAKOUT", () => {
    const s = classifySetup(snap({
      dve: { ...snap().dve, trap: true },
    }));
    expect(s.type).toBe("FAILED_BREAKOUT");
  });

  it("classifies DVE exhaustion as EXHAUSTION_FADE", () => {
    const s = classifySetup(snap({
      dve: { ...snap().dve, exhaustion: true },
    }));
    expect(s.type).toBe("EXHAUSTION_FADE");
  });

  it("classifies high RVOL with directional bias as MOMENTUM_IGNITION", () => {
    const s = classifySetup(snap({
      indicators: { ...snap().indicators, rvol: 2.5, adx: 15, bbwpPercentile: 50 },
    }));
    expect(s.type).toBe("MOMENTUM_IGNITION");
  });

  it("returns NO_SETUP for malformed input", () => {
    const broken = snap({ price: NaN });
    const s = classifySetup(broken);
    expect(s.type).toBe("NO_SETUP");
  });
});

describe("internalResearchScore — axis cap", () => {
  it("no single axis contributes more than 25% of the composite", () => {
    // All axes max except one
    const axes = deriveAxes(snap({
      evidence: {
        regimeFit: 1, structureQuality: 0.1, timeConfluence: 0.1,
        volatilityAlignment: 0.1, participationFlow: 0.1,
        crossMarketConfirmation: 0.1, eventSafety: 0.1,
        extensionSafety: 0.1, symbolTrust: 0.1, modelHealth: 0.1,
      },
    }));
    expect(axes.trend).toBe(100);
    // Even with trend = 100, it can contribute at most 25 of the 100-point composite
    const truth = computeDataTruth({ marketDataAgeSec: 5, timeframe: "15m" });
    const r = computeInternalResearchScore({
      snapshot: snap({
        evidence: {
          regimeFit: 1, structureQuality: 0, timeConfluence: 0,
          volatilityAlignment: 0, participationFlow: 0,
          crossMarketConfirmation: 0, eventSafety: 0,
          extensionSafety: 0, symbolTrust: 0, modelHealth: 0,
        },
      }),
      dataTruth: truth,
    });
    expect(r.rawScore).toBeLessThanOrEqual(25);
  });
});

describe("internalResearchScore — data trust hard floor", () => {
  it("dataTrustScore below 50 forces lifecycle DATA_DEGRADED", () => {
    const truth = computeDataTruth({ marketDataAgeSec: 9999, timeframe: "1m" }); // STALE → low trust
    expect(truth.trustScore).toBeLessThan(50);
    const r = computeInternalResearchScore({ snapshot: snap(), dataTruth: truth });
    expect(r.lifecycle).toBe("DATA_DEGRADED");
    expect(r.score).toBeLessThanOrEqual(35);
  });

  it("dataTrustScore at/above 50 does NOT trigger DATA_DEGRADED on a good snapshot", () => {
    const truth = computeDataTruth({ marketDataAgeSec: 5, timeframe: "15m" });
    expect(truth.trustScore).toBeGreaterThanOrEqual(50);
    const r = computeInternalResearchScore({ snapshot: snap(), dataTruth: truth });
    expect(r.lifecycle).not.toBe("DATA_DEGRADED");
  });
});

describe("internalResearchScore — penalties / lifecycle", () => {
  it("flags TRAPPED when DVE trap is true", () => {
    const truth = computeDataTruth({ marketDataAgeSec: 5, timeframe: "15m" });
    const r = computeInternalResearchScore({
      snapshot: snap({ dve: { ...snap().dve, trap: true } }),
      dataTruth: truth,
    });
    expect(r.lifecycle).toBe("TRAPPED");
  });

  it("applies a stale-data penalty when status is STALE", () => {
    const truth = computeDataTruth({ marketDataAgeSec: 9999, timeframe: "15m" });
    const r = computeInternalResearchScore({ snapshot: snap(), dataTruth: truth });
    expect(r.penalties.some((p) => p.code === "DATA_STALE")).toBe(true);
  });

  it("applies block-reason penalties for the first 3 reasons only", () => {
    const truth = computeDataTruth({ marketDataAgeSec: 5, timeframe: "15m" });
    const r = computeInternalResearchScore({
      snapshot: snap({ blockReasons: ["a", "b", "c", "d", "e"] }),
      dataTruth: truth,
    });
    expect(r.penalties.filter((p) => p.code === "BLOCK_REASON").length).toBe(3);
  });

  it("returns scores in 0..100 range under all combinations", () => {
    const truth = computeDataTruth({ marketDataAgeSec: 5, timeframe: "15m" });
    const r = computeInternalResearchScore({
      snapshot: snap({ blockReasons: ["x"] }),
      dataTruth: truth,
    });
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("INVALIDATED setupState collapses lifecycle and applies penalty", () => {
    const truth = computeDataTruth({ marketDataAgeSec: 5, timeframe: "15m" });
    const r = computeInternalResearchScore({
      snapshot: snap({ setupState: "INVALIDATED" }),
      dataTruth: truth,
    });
    expect(r.lifecycle).toBe("INVALIDATED");
    expect(r.penalties.some((p) => p.code === "SETUP_INVALIDATED")).toBe(true);
  });
});

describe("internalResearchScore — boosts", () => {
  it("applies HIGH_DATA_TRUST boost when LIVE and trust >= 90", () => {
    const truth = computeDataTruth({ marketDataAgeSec: 0, timeframe: "1h" });
    const r = computeInternalResearchScore({ snapshot: snap(), dataTruth: truth });
    expect(r.boosts.some((b) => b.code === "HIGH_DATA_TRUST")).toBe(true);
  });

  it("applies TIME_CONFLUENCE boost when score high and hot window", () => {
    const truth = computeDataTruth({ marketDataAgeSec: 5, timeframe: "15m" });
    const r = computeInternalResearchScore({
      snapshot: snap({
        timeConfluence: { ...snap().timeConfluence, score: 0.8, hotWindow: true },
      }),
      dataTruth: truth,
    });
    expect(r.boosts.some((b) => b.code === "TIME_CONFLUENCE")).toBe(true);
  });
});
