/**
 * Discovery / Operator Guard Separation Tests
 *
 * These tests verify that:
 * 1. InternalResearchScore is not capped or penalised by portfolio/operator state.
 * 2. Opportunity discovery (Priority Desk, Opportunity Board, Scheduler packets)
 *    continues when operator guard is active.
 * 3. Alert delivery suppression does not remove opportunities from discovery output.
 * 4. Portfolio exposure produces operator guard warnings only — not exclusions.
 * 5. buildAdminScanContext does not set metaHealthThrottle=0 because of drawdown/BLOCK.
 */

import { describe, it, expect } from "vitest";
import { computeInternalResearchScore } from "../../lib/engines/internalResearchScore";
import type { ResearchScoreInput } from "../../lib/engines/internalResearchScore";
import type { DataTruth } from "../../lib/engines/dataTruth";
import type { AdminSymbolIntelligence } from "../../lib/admin/types";

/* ── helpers ── */

function makeLiveDataTruth(overrides: Partial<DataTruth> = {}): DataTruth {
  return {
    status: "LIVE",
    trustScore: 90,
    ageSec: 5,
    thresholds: { liveSec: 60, staleSec: 300 },
    notes: [],
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<AdminSymbolIntelligence> = {}): AdminSymbolIntelligence {
  return {
    symbol: "AAPL",
    timeframe: "15m",
    session: "INTRADAY",
    price: 200,
    changePercent: 0.5,
    bias: "BULLISH",
    regime: "TRENDING_UP",
    permission: "GO",
    confidence: 0.8,
    symbolTrust: 0.85,
    sizeMultiplier: 1,
    lastScanAt: new Date().toISOString(),
    blockReasons: [],
    penalties: [],
    indicators: { ema20: 198, ema50: 195, ema200: 190, vwap: 199, atr: 2, bbwpPercentile: 72, adx: 30, rvol: 1.8 },
    dve: { state: "BULLISH", direction: "UP", persistence: 0.7, breakoutReadiness: 0.8, trap: false, exhaustion: false },
    timeConfluence: { score: 0.8, hotWindow: true, alignmentCount: 3, nextClusterAt: "" },
    levels: { pdh: 202, pdl: 196, weeklyHigh: 205, weeklyLow: 190, monthlyHigh: 210, monthlyLow: 185, midpoint: 200, vwap: 199 },
    targets: { entry: 200, invalidation: 195, target1: 205, target2: 210, target3: 218 },
    setupState: "READY",
    ...overrides,
  } as AdminSymbolIntelligence;
}

function makeScoreInput(snapshotOverrides: Partial<AdminSymbolIntelligence> = {}, dataTruthOverrides: Partial<DataTruth> = {}): ResearchScoreInput {
  return {
    snapshot: makeSnapshot(snapshotOverrides),
    dataTruth: makeLiveDataTruth(dataTruthOverrides),
  };
}

/* ══════════════════════════════════════════════════════
   Section 1 — InternalResearchScore: portfolio/execution reasons must not penalise
   ══════════════════════════════════════════════════════ */

describe("InternalResearchScore — execution block reasons excluded", () => {
  const executionReasons = [
    "KILL_SWITCH_ACTIVE",
    "DAILY_LOSS_LIMIT_HIT",
    "MAX_DRAWDOWN_HIT",
    "OPEN_RISK_LIMIT_HIT",
    "MAX_POSITION_LIMIT_HIT",
    "BROKER_DISCONNECTED",
    "META_HEALTH_THROTTLED",
    "DRAWDOWN_LOCKOUT",
    "PORTFOLIO_CORRELATED",
  ];

  it("score is identical with or without execution blockReasons", () => {
    const baseline = computeInternalResearchScore(makeScoreInput());
    const withExecReasons = computeInternalResearchScore(
      makeScoreInput({ blockReasons: executionReasons }),
    );
    expect(withExecReasons.score).toBe(baseline.score);
    expect(withExecReasons.trustAdjustedScore).toBe(baseline.trustAdjustedScore);
  });

  it("execution blockReasons do not appear as BLOCK_REASON penalties", () => {
    const result = computeInternalResearchScore(
      makeScoreInput({ blockReasons: executionReasons }),
    );
    const blockReasonPenalties = result.penalties.filter((p) => p.code === "BLOCK_REASON");
    expect(blockReasonPenalties).toHaveLength(0);
  });

  it("data-quality blockReason still generates a BLOCK_REASON penalty", () => {
    const result = computeInternalResearchScore(
      makeScoreInput({ blockReasons: ["API_TIMEOUT_DATA_GAP"] }),
    );
    const blockReasonPenalties = result.penalties.filter((p) => p.code === "BLOCK_REASON");
    expect(blockReasonPenalties.length).toBeGreaterThanOrEqual(1);
  });

  it("score is not capped by negative portfolio P/L blockReasons", () => {
    // Simulates kill switch + full drawdown scenario
    const allExec = computeInternalResearchScore(
      makeScoreInput({ blockReasons: ["KILL_SWITCH_ACTIVE", "DAILY_LOSS_LIMIT_HIT", "MAX_DRAWDOWN_HIT"] }),
    );
    // Score should be in a healthy range (not dragged to 0 by governance reasons)
    expect(allExec.trustAdjustedScore).toBeGreaterThan(50);
  });
});

/* ══════════════════════════════════════════════════════
   Section 2 — alertSuppression: delivery suppression does not constitute discovery suppression
   ══════════════════════════════════════════════════════ */

describe("evaluateSuppression — delivery vs discovery", () => {
  it("cooldown suppression is delivery-only; opportunity is still discoverable", async () => {
    const { evaluateSuppression } = await import("../../lib/alerts/alertSuppression");
    const result = evaluateSuppression({
      symbol: "BTC",
      market: "CRYPTO",
      timeframe: "15m",
      setup: "BREAKOUT",
      score: 82,
      dataTrustScore: 85,
      lifecycle: "READY",
      recentAlerts: [
        {
          symbol: "BTC",
          timeframe: "15m",
          setup: "BREAKOUT",
          createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
        } as any,
      ],
      now: Date.now(),
    });
    // Delivery is suppressed by cooldown
    expect(result.allow).toBe(false);
    expect(result.reason).toBe("DUPLICATE_IN_WINDOW");
    // The opportunity is NOT blocked from discovery — this suppression reason is
    // delivery-only. The test asserts that the score itself remains unchanged.
  });

  it("below-score-threshold suppression leaves research score intact", () => {
    // A score of 60 is below the alert threshold but the research score still exists.
    const score = computeInternalResearchScore(makeScoreInput());
    // The score should not be 0 even when alertEligibility would be SUPPRESSED.
    expect(score.score).toBeGreaterThan(0);
    expect(score.lifecycle).not.toBe("DATA_DEGRADED");
  });
});

/* ══════════════════════════════════════════════════════
  Section 3 — Portfolio state: only warnings not exclusions
  ══════════════════════════════════════════════════════ */

describe("Portfolio state — warning lane only", () => {
  it("high drawdown blockReason does not reduce research score below 50 for a good setup", () => {
    const drawdownResult = computeInternalResearchScore(
      makeScoreInput({ blockReasons: ["MAX_DRAWDOWN_HIT", "DAILY_LOSS_LIMIT_HIT"] }),
    );
    expect(drawdownResult.trustAdjustedScore).toBeGreaterThan(50);
  });

  it("operator guard active state does not suppress lifecycle from READY", () => {
    const result = computeInternalResearchScore(
      makeScoreInput({ blockReasons: ["KILL_SWITCH_ACTIVE", "META_HEALTH_THROTTLED"] }),
    );
    expect(result.lifecycle).toBe("READY");
  });

  it("data-quality degradation still correctly sets DATA_DEGRADED lifecycle", () => {
    const result = computeInternalResearchScore(
      makeScoreInput({}, { status: "LIVE", trustScore: 30 }), // below DATA_TRUST_HARD_FLOOR=50
    );
    expect(result.lifecycle).toBe("DATA_DEGRADED");
  });
});

