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
  /** ISO time of the newest underlying record, when known. `fetchedAt` is only when it was read. */
  dataAsOf?: string | null;
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

export interface StoredTruthOptions {
  source: string;
  /** Newest underlying record time; null/undefined when the data carries no time. */
  dataAsOf?: string | Date | null;
  /** Records older than this are reported as stale. */
  staleAfterMinutes: number;
  simulated?: boolean;
  missingFields?: string[];
  now?: number;
}

/**
 * Truth metadata for stored data (database rows, saved packets). Freshness comes from the age of the newest record,
 * never from the time of the read: a stored row is at best "delayed", and "stale" past the threshold. With no record
 * time it is "unknown" and the observation time is listed as missing.
 */
export function storedTruth(opts: StoredTruthOptions): Omit<TruthEnvelope<never>, 'data'> {
  const now = opts.now ?? Date.now();
  const asOfMs = opts.dataAsOf == null ? NaN : new Date(opts.dataAsOf).getTime();
  const known = Number.isFinite(asOfMs);
  const ageMin = known ? Math.max(0, Math.round((now - asOfMs) / 60000)) : null;
  const freshness: Freshness = !known ? 'unknown' : ageMin! > opts.staleAfterMinutes ? 'stale' : 'delayed';
  const missing = [...(opts.missingFields ?? []), ...(known ? [] : ['observation time'])];
  return {
    source: opts.source,
    fetchedAt: new Date(now).toISOString(),
    dataAsOf: known ? new Date(asOfMs).toISOString() : null,
    freshness,
    simulated: opts.simulated ?? false,
    missingFields: missing,
    confidence: !known || freshness === 'stale' ? 'low' : 'medium',
    confidenceReason: !known
      ? 'Stored data without a record time.'
      : freshness === 'stale'
        ? `Newest record is ${ageMin} min old (stale after ${opts.staleAfterMinutes} min).`
        : `Stored data; newest record ${ageMin} min old.`,
  };
}
