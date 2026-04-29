import { describe, expect, it } from "vitest";
import {
  computeDataTruth,
  dataTruthColor,
  dataTruthLabel,
  scaledFreshnessThresholds,
  timeframeToSeconds,
} from "../../lib/engines/dataTruth";

describe("timeframeToSeconds", () => {
  it("parses common timeframe labels", () => {
    expect(timeframeToSeconds("1m")).toBe(60);
    expect(timeframeToSeconds("5m")).toBe(300);
    expect(timeframeToSeconds("15m")).toBe(900);
    expect(timeframeToSeconds("1h")).toBe(3600);
    expect(timeframeToSeconds("4h")).toBe(14400);
    expect(timeframeToSeconds("1d")).toBe(86400);
    expect(timeframeToSeconds("1w")).toBe(604800);
    expect(timeframeToSeconds("30s")).toBe(30);
  });

  it("defaults bare numbers to minutes", () => {
    expect(timeframeToSeconds("15")).toBe(900);
  });

  it("returns null for invalid input", () => {
    expect(timeframeToSeconds("")).toBeNull();
    expect(timeframeToSeconds("abc")).toBeNull();
    expect(timeframeToSeconds("0m")).toBeNull();
    expect(timeframeToSeconds(null)).toBeNull();
    expect(timeframeToSeconds(undefined)).toBeNull();
  });
});

describe("scaledFreshnessThresholds", () => {
  it("returns defaults when timeframe is unknown", () => {
    const t = scaledFreshnessThresholds(undefined);
    expect(t.liveSec).toBe(60);
    expect(t.staleSec).toBe(300);
  });

  it("scales stale threshold up for long timeframes", () => {
    const t = scaledFreshnessThresholds("1h"); // 3600s * 0.5 = 1800
    expect(t.staleSec).toBe(1800);
    expect(t.liveSec).toBe(900); // 3600 * 0.25
  });

  it("never falls below the minimum live/stale bounds", () => {
    const t = scaledFreshnessThresholds("1m"); // 60s
    expect(t.liveSec).toBeGreaterThanOrEqual(60);
    expect(t.staleSec).toBeGreaterThanOrEqual(300);
  });
});

describe("computeDataTruth — status decision tree", () => {
  it("flags ERROR when source errors are present", () => {
    const t = computeDataTruth({ marketDataAgeSec: 5, sourceErrors: ["upstream 503"] });
    expect(t.status).toBe("ERROR");
    expect(t.trustScore).toBe(0);
  });

  it("respects upstream override for SIMULATED", () => {
    const t = computeDataTruth({ marketDataAgeSec: 1, upstreamState: "SIMULATED" });
    expect(t.status).toBe("SIMULATED");
  });

  it("returns SIMULATED when isSimulated is true", () => {
    const t = computeDataTruth({ marketDataAgeSec: 1, isSimulated: true });
    expect(t.status).toBe("SIMULATED");
    expect(t.trustScore).toBeLessThan(50);
  });

  it("returns MISSING when 4+ critical fields are missing", () => {
    const t = computeDataTruth({ missingFields: ["a", "b", "c", "d"] });
    expect(t.status).toBe("MISSING");
  });

  it("returns DEGRADED for partial missing fields", () => {
    const t = computeDataTruth({ marketDataAgeSec: 30, missingFields: ["volume"] });
    expect(t.status).toBe("DEGRADED");
  });

  it("returns LIVE for fresh data within the live window", () => {
    const t = computeDataTruth({ marketDataAgeSec: 10, timeframe: "5m" });
    expect(t.status).toBe("LIVE");
    expect(t.trustScore).toBeGreaterThanOrEqual(85);
  });

  it("returns DELAYED when between live and stale thresholds", () => {
    const t = computeDataTruth({ marketDataAgeSec: 200, timeframe: "5m" });
    expect(t.status).toBe("DELAYED");
  });

  it("returns STALE beyond the stale threshold", () => {
    const t = computeDataTruth({ marketDataAgeSec: 1200, timeframe: "5m" });
    expect(t.status).toBe("STALE");
  });

  it("downgrades to CACHED when otherwise fresh but cache-served", () => {
    const t = computeDataTruth({ marketDataAgeSec: 5, isCached: true });
    expect(t.status).toBe("CACHED");
  });
});

describe("computeDataTruth — timeframe-aware freshness (Phase 1.5 audit fix)", () => {
  it("does not mark a 60s-old verdict on a 1h timeframe as DELAYED", () => {
    const t = computeDataTruth({ marketDataAgeSec: 60, timeframe: "1h" });
    expect(t.status).toBe("LIVE");
  });

  it("marks a 60s-old verdict on a 1m timeframe as LIVE (boundary equal)", () => {
    const t = computeDataTruth({ marketDataAgeSec: 60, timeframe: "1m" });
    expect(t.status).toBe("LIVE");
  });

  it("a 5m old verdict on a 1m timeframe is STALE", () => {
    const t = computeDataTruth({ marketDataAgeSec: 600, timeframe: "1m" });
    expect(t.status).toBe("STALE");
  });

  it("a 5m old verdict on a 1d timeframe is still LIVE", () => {
    const t = computeDataTruth({ marketDataAgeSec: 300, timeframe: "1d" });
    expect(t.status).toBe("LIVE");
  });
});

describe("ui helpers", () => {
  it("returns a color and label for every status", () => {
    const statuses = ["LIVE", "CACHED", "DELAYED", "STALE", "DEGRADED", "MISSING", "ERROR", "SIMULATED"] as const;
    for (const s of statuses) {
      expect(dataTruthColor(s)).toMatch(/^#[0-9A-F]{6}$/);
      expect(dataTruthLabel(s).length).toBeGreaterThan(0);
    }
  });
});
