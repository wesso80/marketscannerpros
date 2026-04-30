import { describe, it, expect } from "vitest";
import { computeOptionsIntelligence } from "../../lib/engines/optionsIntelligence";

describe("optionsIntelligence engine", () => {
  it("should compute options pressure from volatility proxy", async () => {
    const result = await computeOptionsIntelligence({
      symbol: "AAPL",
      assetClass: "equity",
      currentPrice: 150,
      indicators: { bbwpPercentile: 85, atr: 2.5, rvol: 1.2 },
      crossMarketConfidenceProxy: 0.75,
    });

    expect(result.symbol).toBe("AAPL");
    expect(result.optionsPressureScore).toBeGreaterThan(70);
    expect(result.unusualActivityScore).toBeGreaterThan(60);
    expect(result.ivCondition).toBe("HIGH");
    expect(result.putCallVolumeRatio).toBeGreaterThan(1);
    expect(result.missingInputs).toContain("Real options chain data not available");
  });

  it("should detect elevated IV conditions", async () => {
    const result = await computeOptionsIntelligence({
      symbol: "TSLA",
      assetClass: "equity",
      currentPrice: 250,
      indicators: { bbwpPercentile: 92 },
    });

    expect(result.ivCondition).toBe("VERY_HIGH");
    expect(result.volatilitySmile).toBe(true);
  });

  it("should identify strike zones with pressure signals", async () => {
    const result = await computeOptionsIntelligence({
      symbol: "MSFT",
      assetClass: "equity",
      currentPrice: 350,
      indicators: { bbwpPercentile: 75 },
    });

    expect(result.dominantStrikeZone).not.toBeNull();
    expect(result.strikeZones.length).toBeGreaterThan(0);
    expect(result.strikeZones[0].zone).toBe("ATM");
  });

  it("should compute gamma flip risk when unusual activity high", async () => {
    const result = await computeOptionsIntelligence({
      symbol: "SPY",
      assetClass: "equity",
      currentPrice: 450,
      indicators: { bbwpPercentile: 88 },
    });

    expect(result.gammaFlipRisk).toBeGreaterThan(50);
    expect(result.gammaFlipLevel).toBeDefined();
    expect(result.dealerPressureEstimate).toBeDefined();
  });

  it("should return safe defaults for missing data", async () => {
    const result = await computeOptionsIntelligence({
      symbol: "TEST",
      assetClass: "crypto",
      currentPrice: 42000,
    });

    expect(result.symbol).toBe("TEST");
    expect(result.dataTruth.status).toBe("MISSING");
    expect(result.fallbackScore).toBeDefined();
    expect(result.missingInputs.length).toBeGreaterThan(0);
  });

  it("should identify put-call bias from pressure", async () => {
    const result = await computeOptionsIntelligence({
      symbol: "NVDA",
      assetClass: "equity",
      currentPrice: 500,
      indicators: { bbwpPercentile: 80 },
      crossMarketConfidenceProxy: 0.85,
    });

    // High confidence + high IV should suggest bearish put bias
    expect(result.skewBias).toBe("BEARISH_PUT");
  });

  it("should report expi ration structure", async () => {
    const result = await computeOptionsIntelligence({
      symbol: "QQQ",
      assetClass: "equity",
      currentPrice: 350,
    });

    expect(result.expirationClusters.length).toBeGreaterThan(0);
    expect(result.expirationClusters[0].daysToExpiry).toBeGreaterThan(0);
    expect(result.dominantExpiration).toBeDefined();
  });
});
