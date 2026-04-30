import { describe, it, expect, beforeEach } from "vitest";
import {
  recordProviderSuccess,
  recordProviderFailure,
  recordFallbackUsed,
  getProviderMetrics,
  getAllProviderMetrics,
  getProviderHealthSummary,
  resetTelemetry,
} from "../../lib/admin/providerTelemetry";

describe("providerTelemetry", () => {
  beforeEach(() => {
    resetTelemetry();
  });

  it("should record successful requests", () => {
    recordProviderSuccess("ALPHA_VANTAGE", "BARS", 150, false);
    recordProviderSuccess("ALPHA_VANTAGE", "BARS", 200, true);

    const metrics = getProviderMetrics("ALPHA_VANTAGE", "BARS");
    expect(metrics.requestCount).toBe(2);
    expect(metrics.successCount).toBe(2);
    expect(metrics.cacheHitCount).toBe(1);
    expect(metrics.cacheMissCount).toBe(1);
    expect(metrics.successRate).toBe(100);
  });

  it("should record failed requests", () => {
    recordProviderSuccess("COINGECKO", "DERIVATIVES", 100, false);
    recordProviderFailure("COINGECKO", "DERIVATIVES", "TIMEOUT", 5000);

    const metrics = getProviderMetrics("COINGECKO", "DERIVATIVES");
    expect(metrics.requestCount).toBe(2);
    expect(metrics.successCount).toBe(1);
    expect(metrics.failureCount).toBe(1);
    expect(metrics.successRate).toBe(50);
  });

  it("should track rate limit hits", () => {
    recordProviderSuccess("ALPHA_VANTAGE", "SEARCH", 100, false);
    recordProviderFailure("ALPHA_VANTAGE", "SEARCH", "RATE_LIMIT", 1000);

    const metrics = getProviderMetrics("ALPHA_VANTAGE", "SEARCH");
    expect(metrics.rateLimitHitCount).toBe(1);
    expect(metrics.lastRateLimitAt).toBeDefined();
  });

  it("should track fallback usage", () => {
    recordProviderSuccess("NASDAQ", "FUNDAMENTALS", 200);
    recordFallbackUsed("NASDAQ", "FUNDAMENTALS");

    const metrics = getProviderMetrics("NASDAQ", "FUNDAMENTALS");
    expect(metrics.fallbackUsedCount).toBe(1);
  });

  it("should compute latency statistics", () => {
    recordProviderSuccess("ALPHA_VANTAGE", "BARS", 100, false);
    recordProviderSuccess("ALPHA_VANTAGE", "BARS", 200, false);
    recordProviderSuccess("ALPHA_VANTAGE", "BARS", 150, false);

    const metrics = getProviderMetrics("ALPHA_VANTAGE", "BARS");
    expect(metrics.latencyMs.min).toBe(100);
    expect(metrics.latencyMs.max).toBe(200);
    expect(metrics.latencyMs.mean).toBe(150);
  });

  it("should set last success and failure timestamps", () => {
    const beforeSuccess = new Date().toISOString();
    recordProviderSuccess("COINGECKO", "DERIVATIVES", 100);
    const afterSuccess = new Date().toISOString();

    let metrics = getProviderMetrics("COINGECKO", "DERIVATIVES");
    expect(metrics.lastSuccessAt).toBeDefined();
    expect(metrics.lastSuccessAt! >= beforeSuccess).toBe(true);
    expect(metrics.lastSuccessAt! <= afterSuccess).toBe(true);

    const beforeFailure = new Date().toISOString();
    recordProviderFailure("COINGECKO", "DERIVATIVES", "ERROR");
    const afterFailure = new Date().toISOString();

    metrics = getProviderMetrics("COINGECKO", "DERIVATIVES");
    expect(metrics.lastFailureAt).toBeDefined();
    expect(metrics.lastFailureAt! >= beforeFailure).toBe(true);
    expect(metrics.lastFailureAt! <= afterFailure).toBe(true);
  });

  it("should get all metrics sorted by provider", () => {
    recordProviderSuccess("ZEBRA", "ENDPOINT", 100);
    recordProviderSuccess("ALPHA", "ENDPOINT", 100);
    recordProviderSuccess("BETA", "ENDPOINT", 100);

    const allMetrics = getAllProviderMetrics();
    expect(allMetrics.length).toBeGreaterThanOrEqual(3);
    // Should be sorted alphabetically
    const providers = allMetrics.map((m) => m.provider);
    expect(providers.indexOf("ALPHA")).toBeLessThan(providers.indexOf("BETA"));
    expect(providers.indexOf("BETA")).toBeLessThan(providers.indexOf("ZEBRA"));
  });

  it("should compute provider health summary", () => {
    // Create a healthy provider
    recordProviderSuccess("ALPHA_VANTAGE", "BARS", 100);
    recordProviderSuccess("ALPHA_VANTAGE", "BARS", 120);
    recordProviderSuccess("ALPHA_VANTAGE", "BARS", 110);

    // Create a degraded provider
    recordProviderSuccess("COINGECKO", "DERIVATIVES", 100);
    recordProviderFailure("COINGECKO", "DERIVATIVES", "TIMEOUT");
    recordProviderFailure("COINGECKO", "DERIVATIVES", "TIMEOUT");

    const summary = getProviderHealthSummary();
    const avHealth = summary.find((s) => s.provider === "ALPHA_VANTAGE");
    const cgHealth = summary.find((s) => s.provider === "COINGECKO");

    expect(avHealth?.overallHealth).toBe("HEALTHY");
    expect(avHealth?.successRate).toBe(100);

    expect(cgHealth?.overallHealth).toBe("DEGRADED");
    expect(cgHealth?.successRate).toBeLessThan(100);
  });

  it("should mark provider UNHEALTHY on high failure rate", () => {
    // Create unhealthy scenario
    for (let i = 0; i < 20; i++) {
      recordProviderFailure("NASDAQ", "SEARCH", "ERROR");
    }
    recordProviderSuccess("NASDAQ", "SEARCH", 100);

    const summary = getProviderHealthSummary();
    const nasdaqHealth = summary.find((s) => s.provider === "NASDAQ");

    expect(nasdaqHealth?.overallHealth).toBe("UNHEALTHY");
    expect(nasdaqHealth?.successRate).toBeLessThan(80);
  });

  it("should mark provider UNHEALTHY on high rate limit rate", () => {
    // Create rate limit scenario
    for (let i = 0; i < 30; i++) {
      recordProviderFailure("ALPHA_VANTAGE", "BARS", "RATE_LIMIT");
    }
    recordProviderSuccess("ALPHA_VANTAGE", "BARS", 100);

    const summary = getProviderHealthSummary();
    const avHealth = summary.find((s) => s.provider === "ALPHA_VANTAGE");

    expect(avHealth?.overallHealth).toBe("UNHEALTHY");
    expect(avHealth?.rateLimitRate).toBeGreaterThan(20);
  });

  it("should reset all telemetry", () => {
    recordProviderSuccess("TEST", "ENDPOINT", 100);
    let metrics = getProviderMetrics("TEST", "ENDPOINT");
    expect(metrics.requestCount).toBe(1);

    resetTelemetry();

    const allMetrics = getAllProviderMetrics();
    expect(allMetrics.length).toBe(0);
  });

  it("should track multiple endpoint families per provider", () => {
    recordProviderSuccess("ALPHA_VANTAGE", "BARS", 100);
    recordProviderSuccess("ALPHA_VANTAGE", "QUOTE", 150);
    recordProviderSuccess("ALPHA_VANTAGE", "SEARCH", 120);

    const avMetrics = getAllProviderMetrics().filter((m) => m.provider === "ALPHA_VANTAGE");
    expect(avMetrics.length).toBe(3);
    expect(avMetrics.map((m) => m.endpointFamily)).toContain("BARS");
    expect(avMetrics.map((m) => m.endpointFamily)).toContain("QUOTE");
    expect(avMetrics.map((m) => m.endpointFamily)).toContain("SEARCH");
  });
});
