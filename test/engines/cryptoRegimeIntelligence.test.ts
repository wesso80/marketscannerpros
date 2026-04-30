import { describe, it, expect } from "vitest";
import { computeCryptoRegimeIntelligence } from "../../lib/engines/cryptoRegimeIntelligence";

describe("cryptoRegimeIntelligence engine", () => {
  it("should compute bullish regime when market cap up and BTC dominant", async () => {
    const result = await computeCryptoRegimeIntelligence({
      marketCapChange: 8,
      btcDominance: 55,
    });

    expect(result.globalRegime).toBe("BULL");
    expect(result.btcEthRelationship.leadership).toBe("BTC_LEADS");
    expect(result.liquidityCondition).toBe("AMPLE");
    expect(result.riskLevel).toBe("LOW");
  });

  it("should compute bearish regime when market cap down", async () => {
    const result = await computeCryptoRegimeIntelligence({
      marketCapChange: -12,
      btcDominance: 65,
    });

    expect(result.globalRegime).toBe("BEAR");
    expect(result.liquidityCondition).toBe("TIGHT");
    expect(result.riskLevel).toBe("ELEVATED");
    expect(result.communityTrendSignal).toBe("NEGATIVE");
  });

  it("should detect transition regime on large moves", async () => {
    const result = await computeCryptoRegimeIntelligence({
      marketCapChange: 15,
      btcDominance: 45,
    });

    expect(result.globalRegime).toBe("TRANSITION");
    expect(result.btcEthRelationship.leadership).toBe("BALANCED");
  });

  it("should compute range-bound regime for neutral conditions", async () => {
    const result = await computeCryptoRegimeIntelligence({
      marketCapChange: 0.5,
      btcDominance: 42,
    });

    expect(result.globalRegime).toBe("RANGE_BOUND");
    expect(result.liquidityCondition).toBe("NORMAL");
    expect(result.riskLevel).toBe("MODERATE");
  });

  it("should report derivatives pressure structure", async () => {
    const result = await computeCryptoRegimeIntelligence({
      marketCapChange: 5,
    });

    expect(result.derivativesPressure).toBeDefined();
    expect(result.derivativesPressure?.fundingRateAvg).toBeDefined();
    expect(result.derivativesPressure?.liquidationPressure).toBeDefined();
  });

  it("should identify category strength", async () => {
    const result = await computeCryptoRegimeIntelligence({
      marketCapChange: 3,
    });

    expect(result.categoryStrength.length).toBeGreaterThan(0);
    expect(result.categoryStrength[0].category).toBeDefined();
    expect(result.categoryStrength[0].strength).toMatch(/STRONG|NEUTRAL|WEAK/);
  });

  it("should report trending symbols", async () => {
    const result = await computeCryptoRegimeIntelligence();

    expect(result.trendingSymbols.length).toBeGreaterThan(0);
    expect(result.trendingSymbols[0].symbol).toBeDefined();
    expect(result.trendingSymbols[0].momentum).toMatch(/ACCELERATING|STABLE|DECELERATING/);
  });

  it("should mark missing inputs when data unavailable", async () => {
    const result = await computeCryptoRegimeIntelligence({});

    expect(result.missingInputs.length).toBeGreaterThan(0);
    expect(result.dataTruth.status).toBe("MISSING");
  });

  it("should compute volume to market cap ratio", async () => {
    const result = await computeCryptoRegimeIntelligence({
      marketCapChange: 2,
    });

    expect(result.volumeToMarketCapRatio).toBeGreaterThan(0);
    expect(result.volumeToMarketCapRatio).toBeLessThan(100);
    expect(result.volumeTrend).toMatch(/INCREASING|STABLE|DECREASING/);
  });

  it("should track BTC dominance trend", async () => {
    const result = await computeCryptoRegimeIntelligence({
      marketCapChange: 5,
      btcDominance: 60,
    });

    expect(result.btcEthRelationship.btcDominanceTrend).toMatch(/INCREASING|STABLE|DECREASING/);
  });
});
