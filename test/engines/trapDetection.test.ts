import { describe, expect, it } from "vitest";
import { detectTrapRisk } from "../../lib/engines/trapDetection";

const baseSnapshot = {
  symbol: "AAPL",
  indicators: { ema20: 100, ema50: 98, ema200: 95, vwap: 99, atr: 2, bbwpPercentile: 70, adx: 24, rvol: 1.2 },
  dve: { state: "TREND", direction: "UP", persistence: 60, breakoutReadiness: 55, trap: false, exhaustion: false },
  setupState: "WATCHING",
  triggerDistancePct: 0.4,
  bias: "LONG",
} as any;

describe("trapDetection", () => {
  it("returns low risk for clean baseline", () => {
    const res = detectTrapRisk({ snapshot: baseSnapshot, dataTruth: { status: "LIVE", trustScore: 90, ageSec: 1, thresholds: { liveSec: 60, staleSec: 300 }, notes: [] } });
    expect(res.trapRiskScore).toBeLessThan(25);
    expect(res.trapType.length).toBe(0);
  });

  it("flags stale-data false confidence", () => {
    const res = detectTrapRisk({ snapshot: baseSnapshot, dataTruth: { status: "STALE", trustScore: 40, ageSec: 999, thresholds: { liveSec: 60, staleSec: 300 }, notes: [] } });
    expect(res.trapType).toContain("STALE_DATA_FALSE_CONFIDENCE");
    expect(res.trapRiskScore).toBeGreaterThanOrEqual(16);
  });

  it("stacks multiple trap signals", () => {
    const res = detectTrapRisk({
      snapshot: {
        ...baseSnapshot,
        indicators: { ...baseSnapshot.indicators, rvol: 0.4, bbwpPercentile: 95 },
        dve: { ...baseSnapshot.dve, trap: true, exhaustion: true },
        setupState: "TRIGGERED",
        triggerDistancePct: 3.4,
      },
      dataTruth: { status: "DELAYED", trustScore: 65, ageSec: 160, thresholds: { liveSec: 60, staleSec: 300 }, notes: [] },
      hasNewsShock: true,
      optionsCrowdingScore: 75,
      higherTimeframeConflict: true,
      earningsWindowHours: 16,
    });

    expect(res.trapType).toContain("LATE_MOVE");
    expect(res.trapType).toContain("FALSE_BREAKOUT");
    expect(res.trapType).toContain("EARNINGS_TRAP");
    expect(res.trapRiskScore).toBeGreaterThan(50);
  });
});
