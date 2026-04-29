/**
 * Phase 4 — Symbol Research Terminal contract tests.
 *
 * These tests assert the *shape* contracts of the research artifact
 * that the symbol API attaches and the Save Research Case payload
 * the page submits. We don't hit the live engines — we hand-build
 * canonical inputs and verify the engines wire together cleanly.
 */

import { describe, expect, it } from "vitest";
import { computeDataTruth } from "../../lib/engines/dataTruth";
import { computeInternalResearchScore } from "../../lib/engines/internalResearchScore";
import { classifySetup } from "../../lib/engines/setupClassifier";
import type { AdminSymbolIntelligence } from "../../lib/admin/types";

function snap(): AdminSymbolIntelligence {
  return {
    symbol: "AAPL", timeframe: "15m", session: "RTH", price: 200, changePercent: 0,
    bias: "LONG", regime: "TREND_UP", permission: "GO", confidence: 0.7,
    symbolTrust: 0.6, sizeMultiplier: 1, lastScanAt: new Date().toISOString(),
    blockReasons: [], penalties: [],
    indicators: { ema20: 195, ema50: 190, ema200: 180, vwap: 198, atr: 2, bbwpPercentile: 50, adx: 28, rvol: 1.5 },
    dve: { state: "TREND", direction: "UP", persistence: 0.7, breakoutReadiness: 0.5, trap: false, exhaustion: false },
    timeConfluence: { score: 0.6, hotWindow: false, alignmentCount: 2, nextClusterAt: new Date().toISOString() },
    levels: { pdh: 205, pdl: 195, weeklyHigh: 210, weeklyLow: 190, monthlyHigh: 220, monthlyLow: 180, midpoint: 200, vwap: 198 },
    targets: { entry: 200, invalidation: 195, target1: 205, target2: 210, target3: 215 },
    evidence: {
      regimeFit: 0.7, structureQuality: 0.6, timeConfluence: 0.6,
      volatilityAlignment: 0.5, participationFlow: 0.55,
      crossMarketConfirmation: 0.5, eventSafety: 0.7,
      extensionSafety: 0.6, symbolTrust: 0.6, modelHealth: 0.7,
    },
  };
}

describe("Phase 4 — symbol research artifact composition", () => {
  it("produces a fully-formed research artifact for the canonical snapshot", () => {
    const snapshot = snap();
    const dataTruth = computeDataTruth({ marketDataAgeSec: 5, timeframe: "15m" });
    const score = computeInternalResearchScore({ snapshot, dataTruth });
    const setup = classifySetup(snapshot);

    // Artifact contract — every field needed by the verdict panel
    expect(setup.type).toBeDefined();
    expect(setup.label.length).toBeGreaterThan(0);
    expect(score.score).toBeGreaterThanOrEqual(0);
    expect(score.score).toBeLessThanOrEqual(100);
    expect(score.lifecycle).toBeDefined();
    expect(Object.keys(score.axes).length).toBe(9);
    expect(dataTruth.status).toBeDefined();
    expect(dataTruth.trustScore).toBeGreaterThanOrEqual(0);
  });

  it("research case payload survives JSON serialization round-trip", () => {
    const snapshot = snap();
    const dataTruth = computeDataTruth({ marketDataAgeSec: 5, timeframe: "15m" });
    const score = computeInternalResearchScore({ snapshot, dataTruth });
    const setup = classifySetup(snapshot);

    const payload = {
      symbol: snapshot.symbol,
      market: "EQUITIES",
      timeframe: snapshot.timeframe,
      bias: snapshot.bias,
      setupType: setup.type,
      score: score.score,
      lifecycle: score.lifecycle,
      dataTrustScore: dataTruth.trustScore,
      dataTruthStatus: dataTruth.status,
      thesis: "Trend continuation with RVOL > 1.5",
      whyNow: "Price holding above 20-EMA, ADX rising",
      invalidation: `Close beyond ${snapshot.targets.invalidation}`,
      evidenceAxes: score.axes,
      penalties: score.penalties,
      boosts: score.boosts,
    };

    const round = JSON.parse(JSON.stringify(payload));
    expect(round.symbol).toBe(snapshot.symbol);
    expect(round.evidenceAxes.trend).toBe(score.axes.trend);
    expect(Array.isArray(round.penalties)).toBe(true);
    expect(Array.isArray(round.boosts)).toBe(true);
  });

  it("DATA_DEGRADED snapshot still produces a valid (read-only) research artifact", () => {
    const snapshot = snap();
    // Force DATA_DEGRADED via stale data
    const dataTruth = computeDataTruth({ marketDataAgeSec: 999_999, timeframe: "1m" });
    const score = computeInternalResearchScore({ snapshot, dataTruth });
    expect(score.lifecycle).toBe("DATA_DEGRADED");
    expect(score.score).toBeLessThanOrEqual(35);
    // Still serializable for the cockpit
    expect(() => JSON.stringify(score)).not.toThrow();
  });
});
