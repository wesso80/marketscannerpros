import { describe, it, expect } from "vitest";
import { computeEarningsRisk, enrichEarningsWithEstimates } from "../../lib/engines/earningsRisk";

describe("earningsRisk engine", () => {
  it("should return UNKNOWN for crypto assets", async () => {
    const result = await computeEarningsRisk({
      symbol: "BTC",
      assetClass: "crypto",
    });

    expect(result.classification).toBe("UNKNOWN");
    expect(result.assetClass).toBe("crypto");
    expect(result.missingInputs).toContain("Earnings calendar not applicable for non-equities");
  });

  it("should return UNKNOWN for forex assets", async () => {
    const result = await computeEarningsRisk({
      symbol: "EURUSD",
      assetClass: "forex",
    });

    expect(result.classification).toBe("UNKNOWN");
  });

  it("should return UNKNOWN for index assets", async () => {
    const result = await computeEarningsRisk({
      symbol: "SPX",
      assetClass: "index",
    });

    expect(result.classification).toBe("UNKNOWN");
  });

  it("should return UNKNOWN for equities when calendar unavailable", async () => {
    const result = await computeEarningsRisk({
      symbol: "AAPL",
      assetClass: "equity",
    });

    expect(result.classification).toBe("UNKNOWN");
    expect(result.missingInputs).toContain("Earnings calendar endpoint not wired");
    expect(result.riskLevel).toBe("MEDIUM");
  });

  it("should mark data truth as unavailable", async () => {
    const result = await computeEarningsRisk({
      symbol: "TSLA",
      assetClass: "equity",
    });

    expect(result.dataTruth.status).toBe("MISSING");
    expect(result.dataTruth.trustScore).toBe(0);
  });

  it("should enrich with analyst estimates", async () => {
    const baseRisk = await computeEarningsRisk({
      symbol: "MSFT",
      assetClass: "equity",
    });

    expect(baseRisk.classification).toBe("UNKNOWN");

    // Current engine doesn't use estimates, so this is a placeholder for future
    const enriched = enrichEarningsWithEstimates(baseRisk, {
      expectedEPS: 2.5,
      consensusEPS: 2.4,
      revisionTrend: "UP",
    });

    expect(enriched.riskLevel).toBe("MEDIUM");
  });

  it("should elevate risk on downward estimate revisions", async () => {
    const baseRisk = await computeEarningsRisk({
      symbol: "GOOGL",
      assetClass: "equity",
    });

    // Manually elevate to simulate EARNINGS_SOON classification
    const earningSoonRisk = { ...baseRisk, classification: "EARNINGS_SOON" as const };

    const enriched = enrichEarningsWithEstimates(earningSoonRisk, {
      expectedEPS: 1.5,
      consensusEPS: 1.8,
      revisionTrend: "DOWN",
    });

    expect(enriched.riskLevel).toBe("HIGH");
  });

  it("should note when earnings unavailable", async () => {
    const result = await computeEarningsRisk({
      symbol: "NVDA",
      assetClass: "equity",
    });

    expect(result.note).toContain("unavailable from calendar data");
  });

  it("should default to conservative MEDIUM risk when unknown", async () => {
    const result = await computeEarningsRisk({
      symbol: "AMD",
      assetClass: "equity",
    });

    expect(result.riskLevel).toBe("MEDIUM");
    expect(result.earningsSeasonNow).toBe(false);
    expect(result.sectorEarningsActivity).toBe("OFF_SEASON");
  });

  it("should provide next event date when UNKNOWN", async () => {
    const result = await computeEarningsRisk({
      symbol: "INTC",
      assetClass: "equity",
    });

    expect(result.nextEventDate).toBeNull();
    expect(result.nextEventType).toBe("UNKNOWN");
  });
});
