/**
 * Provider Telemetry — Phase 10
 *
 * Tracks request success/failure/latency by provider and endpoint family.
 * Surfaces real provider health vs config-based health checks.
 */

export interface ProviderTelemetryMetrics {
  provider: string; // "ALPHA_VANTAGE", "COINGECKO", "NASDAQ", etc.
  endpointFamily: string; // "BARS", "SEARCH", "FUNDAMENTALS", "DERIVATIVES", etc.
  
  requestCount: number; // total requests
  successCount: number; // HTTP 200
  failureCount: number; // HTTP 4xx, 5xx, timeout, etc.
  rateLimitHitCount: number; // 429 responses
  fallbackUsedCount: number; // times fallback data was returned
  
  cacheHitCount: number;
  cacheMissCount: number;
  
  latencyMs: {
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
    mean: number;
  };
  
  lastSuccessAt?: string;
  lastFailureAt?: string;
  lastRateLimitAt?: string;
  
  successRate: number; // 0..100%
  responseTimeHealthy: boolean; // p95 < threshold
  
  updatedAt: string;
}

// In-memory telemetry store (for single-instance; scale to Redis for multi-instance)
let telemetryStore = new Map<string, ProviderTelemetryMetrics>();
let telemetryStartTime = Date.now();

function getKey(provider: string, family: string): string {
  return `${provider}:${family}`;
}

function defaultMetrics(provider: string, family: string): ProviderTelemetryMetrics {
  return {
    provider,
    endpointFamily: family,
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    rateLimitHitCount: 0,
    fallbackUsedCount: 0,
    cacheHitCount: 0,
    cacheMissCount: 0,
    latencyMs: {
      min: Infinity,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      mean: 0,
    },
    successRate: 0,
    responseTimeHealthy: true,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Record a successful request.
 */
export function recordProviderSuccess(
  provider: string,
  family: string,
  latencyMs: number,
  cacheHit: boolean = false,
): void {
  const key = getKey(provider, family);
  let metrics = telemetryStore.get(key) || defaultMetrics(provider, family);

  metrics.requestCount++;
  metrics.successCount++;
  cacheHit ? metrics.cacheHitCount++ : metrics.cacheMissCount++;

  // Update latency percentiles (simplified; a real implementation would track all samples)
  if (latencyMs < metrics.latencyMs.min) metrics.latencyMs.min = latencyMs;
  if (latencyMs > metrics.latencyMs.max) metrics.latencyMs.max = latencyMs;
  metrics.latencyMs.mean = (metrics.latencyMs.mean * (metrics.requestCount - 1) + latencyMs) / metrics.requestCount;
  metrics.latencyMs.p95 = Math.max(metrics.latencyMs.p95, latencyMs * 0.7); // rough approximation
  metrics.latencyMs.p99 = Math.max(metrics.latencyMs.p99, latencyMs * 0.9);

  metrics.successRate = (metrics.successCount / metrics.requestCount) * 100;
  metrics.lastSuccessAt = new Date().toISOString();
  metrics.responseTimeHealthy = metrics.latencyMs.p95 < 5000; // 5s threshold
  metrics.updatedAt = new Date().toISOString();

  telemetryStore.set(key, metrics);
}

/**
 * Record a failed request.
 */
export function recordProviderFailure(
  provider: string,
  family: string,
  reason: "RATE_LIMIT" | "TIMEOUT" | "ERROR" | "UNAVAILABLE",
  latencyMs?: number,
): void {
  const key = getKey(provider, family);
  let metrics = telemetryStore.get(key) || defaultMetrics(provider, family);

  metrics.requestCount++;
  metrics.failureCount++;
  if (reason === "RATE_LIMIT") metrics.rateLimitHitCount++;

  if (latencyMs) {
    if (latencyMs < metrics.latencyMs.min) metrics.latencyMs.min = latencyMs;
    if (latencyMs > metrics.latencyMs.max) metrics.latencyMs.max = latencyMs;
  }

  metrics.successRate = (metrics.successCount / metrics.requestCount) * 100;
  metrics.lastFailureAt = new Date().toISOString();
  if (reason === "RATE_LIMIT") metrics.lastRateLimitAt = new Date().toISOString();
  metrics.updatedAt = new Date().toISOString();

  telemetryStore.set(key, metrics);
}

/**
 * Record a fallback usage.
 */
export function recordFallbackUsed(provider: string, family: string): void {
  const key = getKey(provider, family);
  let metrics = telemetryStore.get(key) || defaultMetrics(provider, family);

  metrics.fallbackUsedCount++;
  metrics.updatedAt = new Date().toISOString();

  telemetryStore.set(key, metrics);
}

/**
 * Get telemetry for a provider/family.
 */
export function getProviderMetrics(provider: string, family: string): ProviderTelemetryMetrics {
  const key = getKey(provider, family);
  return telemetryStore.get(key) || defaultMetrics(provider, family);
}

/**
 * Get all telemetry.
 */
export function getAllProviderMetrics(): ProviderTelemetryMetrics[] {
  return Array.from(telemetryStore.values()).sort((a, b) => {
    const provCmp = a.provider.localeCompare(b.provider);
    return provCmp !== 0 ? provCmp : a.endpointFamily.localeCompare(b.endpointFamily);
  });
}

/**
 * Reset telemetry (for testing or admin maintenance).
 */
export function resetTelemetry(): void {
  telemetryStore.clear();
  telemetryStartTime = Date.now();
}

/**
 * Get uptime of telemetry collection (ms).
 */
export function getTelemetryUptime(): number {
  return Date.now() - telemetryStartTime;
}

/**
 * Compute health summary for all providers.
 */
export interface ProviderHealthSummary {
  provider: string;
  overallHealth: "HEALTHY" | "DEGRADED" | "UNHEALTHY";
  successRate: number;
  rateLimitRate: number;
  avgLatencyMs: number;
  familyMetrics: ProviderTelemetryMetrics[];
}

export function getProviderHealthSummary(): ProviderHealthSummary[] {
  const byProvider = new Map<string, ProviderTelemetryMetrics[]>();

  for (const metrics of telemetryStore.values()) {
    if (!byProvider.has(metrics.provider)) {
      byProvider.set(metrics.provider, []);
    }
    byProvider.get(metrics.provider)!.push(metrics);
  }

  const summaries: ProviderHealthSummary[] = [];

  for (const [provider, metrics] of byProvider.entries()) {
    const totalRequests = metrics.reduce((sum, m) => sum + m.requestCount, 0);
    const totalSuccess = metrics.reduce((sum, m) => sum + m.successCount, 0);
    const totalRateLimit = metrics.reduce((sum, m) => sum + m.rateLimitHitCount, 0);
    const avgLatency = metrics.reduce((sum, m) => sum + m.latencyMs.mean, 0) / metrics.length;

    const successRate = totalRequests > 0 ? (totalSuccess / totalRequests) * 100 : 0;
    const rateLimitRate = totalRequests > 0 ? (totalRateLimit / totalRequests) * 100 : 0;

    let overallHealth: "HEALTHY" | "DEGRADED" | "UNHEALTHY" = "HEALTHY";
    if (successRate < 95 || rateLimitRate > 5) overallHealth = "DEGRADED";
    if (successRate < 30 || rateLimitRate > 20) overallHealth = "UNHEALTHY";

    summaries.push({
      provider,
      overallHealth,
      successRate,
      rateLimitRate,
      avgLatencyMs: avgLatency,
      familyMetrics: metrics,
    });
  }

  return summaries;
}
