/** Daily Packet macro freshness is judged by the OLDEST required daily series, not the newest of all. */
import { describe, it, expect } from "vitest";
import { assessMacroFreshness, REQUIRED_MACRO_SERIES } from "@/lib/dailyPacket/macroFreshness";

const NOW = Date.parse("2026-09-26T12:00:00Z");
const allFresh = () => Object.keys(REQUIRED_MACRO_SERIES).map((seriesKey) => ({ seriesKey, latestObservedOn: "2026-09-25" }));

describe("assessMacroFreshness", () => {
  it("is fresh when every required series is recent; lastUpdated is the oldest", () => {
    const rows = allFresh().map((r) => (r.seriesKey === "DXY" ? { ...r, latestObservedOn: "2026-09-19" } : r));
    const r = assessMacroFreshness(rows, NOW);
    expect(r.freshness).toBe("fresh"); // DXY (DTWEXBGS) lags ~a week and gets 10 days
    expect(r.lastUpdated).toBe("2026-09-19");
    expect(r.warning).toBeNull();
  });

  it("is stale when one required series is old even if others are fresh", () => {
    const rows = allFresh().map((r) => (r.seriesKey === "VIX" ? { ...r, latestObservedOn: "2026-09-10" } : r));
    const r = assessMacroFreshness(rows, NOW);
    expect(r.freshness).toBe("stale");
    expect(r.lastUpdated).toBe("2026-09-10");
    expect(r.stale.map((s) => s.seriesKey)).toEqual(["VIX"]);
    expect(r.notes).toContain("VIX");
    expect(r.warning).toMatch(/Macro data stale: VIX.*admin-macro-ingest/);
  });

  it("treats a missing required series as stale", () => {
    const rows = allFresh().filter((r) => r.seriesKey !== "CREDIT_HY_OAS");
    const r = assessMacroFreshness(rows, NOW);
    expect(r.freshness).toBe("stale");
    expect(r.notes).toContain("CREDIT_HY_OAS (missing)");
  });

  it("ignores derived and monthly series", () => {
    const rows = [...allFresh(), { seriesKey: "LIQ_TX", latestObservedOn: "2026-01-01" }, { seriesKey: "UNRATE", latestObservedOn: "2026-06-01" }, { seriesKey: "US_M2", latestObservedOn: null }];
    const r = assessMacroFreshness(rows, NOW);
    expect(r.freshness).toBe("fresh");
    expect(r.lastUpdated).toBe("2026-09-25");
  });

  it("a weekend gap does not flag daily series", () => {
    const rows = allFresh().map((r) => ({ ...r, latestObservedOn: "2026-09-25" }));
    expect(assessMacroFreshness(rows, Date.parse("2026-09-28T23:00:00Z")).freshness).toBe("fresh");
  });

  it("is unknown with no macro rows at all", () => {
    expect(assessMacroFreshness([], NOW)).toMatchObject({ freshness: "unknown", lastUpdated: null, warning: null });
  });
});
