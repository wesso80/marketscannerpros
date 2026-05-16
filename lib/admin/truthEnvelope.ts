/**
 * lib/admin/truthEnvelope.ts
 *
 * Shared truth-envelope adapter for admin AI responses.
 *
 * Multiple admin AI endpoints (sector-rotation, options-architect,
 * quant-screener, earnings-analyzer, etc.) return their payload via
 * `wrapTruth()` which flattens the truth fields (source, fetchedAt,
 * freshness, confidence...) onto the top level alongside `data`.
 *
 * Older pages expected a nested {data, meta} envelope. This helper
 * normalises both shapes into a single TruthEnvelope<T> contract so
 * pages can render without crashing on undefined `meta.confidence`.
 *
 * If you add a new admin AI consumer, prefer this helper + the
 * <TruthEnvelopeBadge> component over hand-rolling another `toEnvelope`.
 */

export interface TruthMeta {
  source: string;
  fetchedAt: string;
  freshness: string;
  simulated: boolean;
  missingFields: string[];
  confidence: string;
  confidenceReason: string;
}

export interface TruthEnvelope<TData = unknown> {
  data: TData;
  meta: TruthMeta;
}

/** Coerce any wrapTruth-flat or pre-nested response into a TruthEnvelope. */
export function toTruthEnvelope<TData = unknown>(raw: unknown): TruthEnvelope<TData> {
  const j = (raw ?? {}) as Record<string, unknown>;
  const nestedMeta = (j.meta ?? null) as Record<string, unknown> | null;
  const data = (j.data ?? {}) as TData;

  const pick = <T>(k: string, fallback: T): T => {
    if (nestedMeta && k in nestedMeta && nestedMeta[k] != null) return nestedMeta[k] as T;
    if (k in j && j[k] != null) return j[k] as T;
    return fallback;
  };

  return {
    data,
    meta: {
      source: pick('source', 'unknown'),
      fetchedAt: pick('fetchedAt', new Date().toISOString()),
      freshness: pick('freshness', 'unknown'),
      simulated: Boolean(pick('simulated', false)),
      missingFields: (() => {
        const v = pick<unknown>('missingFields', []);
        return Array.isArray(v) ? (v as string[]) : [];
      })(),
      confidence: pick('confidence', 'low'),
      confidenceReason: pick('confidenceReason', 'no_envelope'),
    },
  };
}
