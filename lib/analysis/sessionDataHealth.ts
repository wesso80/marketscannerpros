/**
 * Shared data-freshness and feed-health rule for the Session overview
 * (/tools/command-center) and the Market dashboard (/tools/dashboard). OV-3.
 *
 * Before: the Session overview called its data "current within expected provider
 * cadence" whenever 4 of 5 layers returned anything, without looking at a single
 * timestamp, and it graded Evidence HIGH while the dashboard listed degraded feeds.
 *
 * Rules:
 *  - A layer is "live" only when it reports a provider as-of time within its
 *    cadence. The API response time is not an as-of time.
 *  - No as-of time means recency is unknown. Older than cadence, or flagged stale
 *    by its source, means stale.
 *  - The combined freshness is the worst of the available layers.
 *  - Degraded feeds use one list builder (same wording on both pages), and any
 *    degraded feed caps Evidence below HIGH.
 */
import type { EvidenceQualityResult } from './evidenceQuality';
import type { FreshnessLevel } from './terminology';

export interface DataLayer {
  name: string;
  available: boolean;
  /** Provider as-of time of the data itself. Leave null when only a response time is known. */
  asOf?: string | null;
  /** Maximum age before the layer counts as stale. Omit to rely on `stale` only. */
  cadenceMinutes?: number;
  /** The source's own staleness flag. */
  stale?: boolean;
}

export function layerFreshness(layer: DataLayer, nowMs = Date.now()): FreshnessLevel {
  if (!layer.available) return 'missing';
  if (layer.stale) return 'stale';
  const asOfMs = Date.parse(layer.asOf ?? '');
  if (!Number.isFinite(asOfMs)) return 'unknown';
  if (layer.cadenceMinutes != null && nowMs - asOfMs > layer.cadenceMinutes * 60_000) return 'stale';
  return 'live';
}

export interface SessionFreshness {
  freshness: FreshnessLevel;
  /** Plain-language notes naming the layers that stop the data being called current. */
  notes: string[];
}

export function assessSessionFreshness(layers: DataLayer[], nowMs = Date.now()): SessionFreshness {
  const graded = layers.filter((l) => l.available).map((l) => ({ name: l.name, level: layerFreshness(l, nowMs) }));
  if (!graded.length) return { freshness: 'missing', notes: [] };
  const stale = graded.filter((g) => g.level === 'stale').map((g) => g.name);
  const unknown = graded.filter((g) => g.level === 'unknown').map((g) => g.name);
  const notes: string[] = [];
  if (stale.length) notes.push(`Stale or older than expected cadence: ${stale.join(', ')}.`);
  if (unknown.length) notes.push(`No provider as-of time from: ${unknown.join(', ')}, so recency can't be confirmed.`);
  return { freshness: stale.length ? 'stale' : unknown.length ? 'unknown' : 'live', notes };
}

export interface FeedHealthInput {
  /** Scanner ranked-queue health (Market dashboard only). */
  scanner?: { warnings: string[]; error: string | null; stale: boolean; ageMinutes: number | null };
  /** Feeds in display order; a truthy error marks the feed degraded. */
  feeds: Array<{ label: string; error: unknown }>;
  /** calendarDataWarning(...) output; pass null while the calendar is loading. */
  calendarWarning?: string | null;
}

/** The "Degraded feeds" list, with the same wording on every page. */
export function degradedFeedList(input: FeedHealthInput): string[] {
  const s = input.scanner;
  return [
    ...(s?.warnings ?? []),
    s?.error ? 'Scanner queue' : null,
    s?.stale ? `Scanner data stale (${s.ageMinutes != null ? `${s.ageMinutes}m old` : 'age unknown'})` : null,
    ...input.feeds.map((f) => (f.error ? f.label : null)),
    input.calendarWarning ?? null,
  ].filter((x): x is string => Boolean(x));
}

/** Evidence can't be HIGH while any feed it reads is degraded. */
export function applyFeedHealth(evidence: EvidenceQualityResult, degraded: string[]): EvidenceQualityResult {
  if (!degraded.length) return evidence;
  return {
    ...evidence,
    level: evidence.level === 'HIGH' ? 'MEDIUM' : evidence.level,
    reasons: [...evidence.reasons, `Degraded feeds: ${degraded.join(', ')}.`],
  };
}
