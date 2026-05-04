/**
 * lib/dataFreshness.ts
 *
 * Canonical data freshness contract for all market-data objects in the MSP platform.
 *
 * RULES (from data-integrity.md + alpha-vantage-usage.md + coingecko-usage.md):
 *  - Every market-data object passed into ARCA AI must carry a DataFreshness descriptor.
 *  - Stale, simulated, degraded, or unavailable data must NOT be presented as live truth.
 *  - The AI route uses this to enforce verdict downgrades before responding to the user.
 *  - Admin panels must surface these fields in their UI so operators can see data health.
 */

// ── Core type ──────────────────────────────────────────────────────────────────

export type DataFreshnessSource =
  | 'LIVE'        // Freshly fetched from provider, within TTL
  | 'CACHED'      // Served from cache, within TTL
  | 'DELAYED'     // Marked delayed by provider (e.g. 15-min delayed equity data)
  | 'DEGRADED'    // Provider returned a partial or quality-degraded response
  | 'SIMULATED'   // Demo/mock data — NOT real market data
  | 'UNAVAILABLE'; // Provider failed or data is missing entirely

export interface DataFreshness {
  /** Provider name — e.g. "alpha-vantage", "coingecko", "binance", "msp-scanner" */
  provider: string;
  /** Freshness classification from the source */
  source: DataFreshnessSource;
  /** ISO-8601 timestamp when the data was fetched from the upstream provider */
  fetchedAt?: string;
  /** ISO-8601 timestamp when the data was written to cache (if applicable) */
  cachedAt?: string;
  /** Cache TTL in seconds */
  ttlSeconds?: number;
  /** ISO-8601 timestamp when the cache entry expires */
  ttlExpiry?: string;
  /** true if data is outside its TTL window */
  stale: boolean;
  /** true if this is demo/mock data, not real market data */
  simulated: boolean;
  /** true if provider returned a partial or reduced-quality payload */
  degraded: boolean;
  /** Human-readable reason explaining any non-LIVE status */
  reason?: string;
}

// ── Factory helpers ────────────────────────────────────────────────────────────

export function makeLiveFreshness(provider: string, ttlSeconds?: number): DataFreshness {
  const now = new Date();
  return {
    provider,
    source: 'LIVE',
    fetchedAt: now.toISOString(),
    cachedAt: now.toISOString(),
    ttlSeconds,
    ttlExpiry: ttlSeconds ? new Date(now.getTime() + ttlSeconds * 1000).toISOString() : undefined,
    stale: false,
    simulated: false,
    degraded: false,
  };
}

export function makeCachedFreshness(
  provider: string,
  cachedAt: string,
  ttlSeconds: number,
): DataFreshness {
  const expiry = new Date(new Date(cachedAt).getTime() + ttlSeconds * 1000);
  const isStale = Date.now() > expiry.getTime();
  return {
    provider,
    source: isStale ? 'DELAYED' : 'CACHED',
    cachedAt,
    ttlSeconds,
    ttlExpiry: expiry.toISOString(),
    stale: isStale,
    simulated: false,
    degraded: false,
    reason: isStale ? `Cache expired at ${expiry.toISOString()}` : undefined,
  };
}

export function makeSimulatedFreshness(provider: string, reason?: string): DataFreshness {
  return {
    provider,
    source: 'SIMULATED',
    fetchedAt: new Date().toISOString(),
    stale: false,
    simulated: true,
    degraded: false,
    reason: reason ?? 'Demo/simulated data — not real market data',
  };
}

export function makeUnavailableFreshness(provider: string, reason?: string): DataFreshness {
  return {
    provider,
    source: 'UNAVAILABLE',
    stale: true,
    simulated: false,
    degraded: false,
    reason: reason ?? 'Data unavailable',
  };
}

export function makeDegradedFreshness(provider: string, reason?: string): DataFreshness {
  return {
    provider,
    source: 'DEGRADED',
    fetchedAt: new Date().toISOString(),
    stale: false,
    simulated: false,
    degraded: true,
    reason: reason ?? 'Partial or reduced-quality data returned by provider',
  };
}

// ── Aggregation helper ──────────────────────────────────────────────────────────

/**
 * Aggregate multiple freshness descriptors into a single summary.
 * Used by the AI route to build a unified freshness picture across all data sources.
 */
export interface FreshnessSummary {
  anyStale: boolean;
  anySimulated: boolean;
  anyDegraded: boolean;
  anyUnavailable: boolean;
  /** A flat list of human-readable warnings for context injection. */
  warnings: string[];
  /** Severity: 'clean' | 'conditional' | 'blocked' */
  severity: 'clean' | 'conditional' | 'blocked';
}

export function aggregateFreshness(sources: DataFreshness[]): FreshnessSummary {
  const warnings: string[] = [];
  let anyStale = false;
  let anySimulated = false;
  let anyDegraded = false;
  let anyUnavailable = false;

  for (const f of sources) {
    if (f.simulated) {
      anySimulated = true;
      warnings.push(`${f.provider}: SIMULATED — ${f.reason ?? 'demo data'}`);
    }
    if (f.stale) {
      anyStale = true;
      warnings.push(`${f.provider}: STALE — ${f.reason ?? 'cache expired'}`);
    }
    if (f.degraded) {
      anyDegraded = true;
      warnings.push(`${f.provider}: DEGRADED — ${f.reason ?? 'partial data'}`);
    }
    if (f.source === 'UNAVAILABLE') {
      anyUnavailable = true;
      warnings.push(`${f.provider}: UNAVAILABLE — ${f.reason ?? 'data missing'}`);
    }
  }

  // Severity rules for verdict enforcement
  let severity: FreshnessSummary['severity'] = 'clean';
  if (anySimulated || anyUnavailable) {
    // Simulated or fully missing data blocks a clean "CONDITIONS ALIGNED" verdict
    severity = 'blocked';
  } else if (anyStale || anyDegraded) {
    // Stale or degraded data forces CONDITIONAL verdict
    severity = 'conditional';
  }

  return { anyStale, anySimulated, anyDegraded, anyUnavailable, warnings, severity };
}

/**
 * Build a system-prompt injection string from a freshness summary.
 * Injected into ARCA prompt context so the model is explicitly aware of data quality.
 */
export function buildFreshnessPromptInjection(summary: FreshnessSummary): string {
  if (summary.warnings.length === 0 && summary.severity === 'clean') {
    return 'DATA FRESHNESS: All inputs are LIVE or within cache TTL. No staleness detected.';
  }

  const lines = [
    '⚠️  DATA FRESHNESS WARNINGS:',
    ...summary.warnings.map(w => `  - ${w}`),
    '',
    summary.severity === 'blocked'
      ? 'VERDICT RULE: One or more data sources are SIMULATED or UNAVAILABLE. ' +
        'You MUST NOT output "CONDITIONS ALIGNED". Maximum verdict is ⚠️ CONDITIONAL. ' +
        'Explicitly state which data source caused this downgrade.'
      : 'VERDICT RULE: One or more data sources are STALE or DEGRADED. ' +
        'Verdict MUST be ⚠️ CONDITIONAL — DATA QUALITY REDUCED. ' +
        'State which source is stale and what data may be missing as a result.',
  ];

  return lines.join('\n');
}
