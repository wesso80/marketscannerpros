/**
 * Admin Truth Layer envelope.
 *
 * See .claude/ADMIN_TRUTH_LAYER.md.
 *
 * Every admin API response that carries market intelligence must be
 * wrapped in TruthEnvelope so the UI can render freshness, source,
 * and missing-data badges without inferring them.
 */

export type Freshness = 'real-time' | 'delayed' | 'stale' | 'unknown';
export type Confidence = 'high' | 'medium' | 'low';

export interface TruthEnvelope<T> {
  data: T;
  /** Provider/source identifier, e.g. "alpha-vantage:quote". */
  source: string;
  /** ISO timestamp when this data was fetched from the source. */
  fetchedAt: string;
  freshness: Freshness;
  /** True if any field in `data` is simulated, derived, or fallback. */
  simulated: boolean;
  /** Critical fields that the source did not provide. */
  missingFields: string[];
  confidence: Confidence;
  /** Human-readable reason for the assigned confidence level. */
  confidenceReason: string;
}

export interface TruthEnvelopeOptions {
  source: string;
  fetchedAt?: string;
  freshness?: Freshness;
  simulated?: boolean;
  missingFields?: string[];
  confidence?: Confidence;
  confidenceReason?: string;
}

/**
 * Wrap a payload in a TruthEnvelope with sane defaults.
 *
 * Defaults bias toward conservative disclosure: unknown freshness,
 * medium confidence. Callers are expected to override when they have
 * stronger guarantees.
 */
export function wrapTruth<T>(data: T, opts: TruthEnvelopeOptions): TruthEnvelope<T> {
  return {
    data,
    source: opts.source,
    fetchedAt: opts.fetchedAt ?? new Date().toISOString(),
    freshness: opts.freshness ?? 'unknown',
    simulated: opts.simulated ?? false,
    missingFields: opts.missingFields ?? [],
    confidence: opts.confidence ?? 'medium',
    confidenceReason: opts.confidenceReason ?? 'default',
  };
}

/**
 * Type guard for runtime auditors (e.g. CI checks that scan admin
 * responses to ensure every payload is truth-wrapped).
 */
export function isTruthEnvelope(value: unknown): value is TruthEnvelope<unknown> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    'data' in v &&
    typeof v.source === 'string' &&
    typeof v.fetchedAt === 'string' &&
    typeof v.freshness === 'string' &&
    typeof v.simulated === 'boolean' &&
    Array.isArray(v.missingFields) &&
    typeof v.confidence === 'string'
  );
}
