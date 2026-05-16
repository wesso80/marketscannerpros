import { describe, expect, it } from "vitest";
import {
  computeInformationEdge,
  clamp as edgeClamp,
} from "../../lib/admin/arca-brain/informationEdge";
import { classifyMistake } from "../../lib/admin/arca-brain/mistakeLabeler";

describe("arca-brain / informationEdge.computeInformationEdge", () => {
  it("labels everything-low as OBVIOUS_NOISE", () => {
    const r = computeInformationEdge({
      uniqueness: 10,
      earliness: 5,
      crowdingRisk: 95,
      obviousness: 95,
      hiddenPressure: 0,
      rewardRemaining: 5,
      signalRarity: 5,
      crossAssetConfirmation: 0,
      personalHistoricalEdge: 0,
    });
    expect(r.band).toBe("OBVIOUS_NOISE");
    expect(r.score).toBeLessThanOrEqual(25);
  });

  it("labels a clearly rare/asymmetric setup correctly", () => {
    const r = computeInformationEdge({
      uniqueness: 95,
      earliness: 90,
      crowdingRisk: 10,
      obviousness: 10,
      hiddenPressure: 85,
      rewardRemaining: 90,
      signalRarity: 95,
      crossAssetConfirmation: 80,
      personalHistoricalEdge: 90,
    });
    expect(["STRONG", "RARE_ASYMMETRIC"]).toContain(r.band);
    expect(r.score).toBeGreaterThan(50);
  });

  it("clamps to 0..100 always", () => {
    expect(edgeClamp(-50)).toBe(0);
    expect(edgeClamp(150)).toBe(100);
    expect(edgeClamp(Number.NaN)).toBe(0);
  });
});

describe("arca-brain / mistakeLabeler.classifyMistake", () => {
  const base = {
    id: "t1",
    workspaceId: "ws",
    portfolioId: "p1",
    symbol: "BTCUSD",
    side: "LONG" as const,
    entryPrice: 100,
    exitPrice: 95,
    stopLoss: 90,
    takeProfit: 120,
    rRealised: -0.5,
    pnlDollars: -50,
    exitReason: "stop_hit",
    playbookId: "breakout",
    holdMinutes: 60,
  };

  it("classifies a rule violation as BROKE_RULE / critical", () => {
    const out = classifyMistake({ ...base, brokeRule: true });
    expect(out.mistakeType).toBe("BROKE_RULE");
    expect(out.severity).toBe("critical");
  });

  it("classifies an over-sized loss as POSITION_TOO_LARGE", () => {
    const out = classifyMistake({ ...base, positionTooLarge: true });
    expect(out.mistakeType).toBe("POSITION_TOO_LARGE");
    expect(out.severity).toBe("high");
  });
});
