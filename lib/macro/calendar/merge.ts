import { COUNTRIES } from './countries';
import { isUnmappedIndicator } from './indicators';
import { normalizeReferencePeriod } from './referencePeriod';
import { getZonedParts, zonedTimeToUtc } from './time';
import type { ProviderId, RawCalendarInput, SourceAuthority, TimingStatus } from './types';

/**
 * Cross-provider merge.
 *
 * Identity: canonicalIndicatorId + country + normalized referencePeriod.
 * Date/time proximity is only a *validation* step — two rows with the same
 * identity but releases more than MAX_IDENTITY_DRIFT apart are treated as
 * different events (and flagged), never merged on name similarity.
 * Rows whose reference period is unknown on either side fall back to identity
 * + same UTC day (±36h) — and only for registry-mapped indicators.
 *
 * Value precedence (per §8):
 *   timing     OFFICIAL > live provider (in precedence order) > CURATED
 *   actual     live providers only, in order
 *   consensus  live providers only, in order; never from curated; never TEForecast
 *   previous   live providers only, in order (revision preserved)
 */

const MAX_IDENTITY_DRIFT_MS = 3 * 24 * 60 * 60 * 1000;
const NO_PERIOD_WINDOW_MS = 36 * 60 * 60 * 1000;

const AUTHORITY_RANK: Record<SourceAuthority, number> = { OFFICIAL: 3, PROVIDER: 2, CURATED: 1 };
const TIMING_RANK: Record<TimingStatus, number> = { CONFIRMED: 3, TENTATIVE: 2, ESTIMATED: 1, UNKNOWN: 0 };

export interface Enriched {
  input: RawCalendarInput;
  releaseMs: number;
  period: string | null;
  rank: number;
}

export function releaseMsOf(input: RawCalendarInput): number {
  if (input.releaseTimeUtc) return Date.parse(input.releaseTimeUtc);
  return zonedTimeToUtc(input.localDate, input.localTime, COUNTRIES[input.countryCode].timezone).getTime();
}

function normalizedPeriodOf(input: RawCalendarInput, releaseMs: number): string | null {
  const local = getZonedParts(releaseMs, COUNTRIES[input.countryCode].timezone);
  return normalizeReferencePeriod(input.referencePeriod, { year: local.year, month: local.month });
}

function identityKey(e: Enriched): string {
  return `${e.input.countryCode}|${e.input.canonicalIndicatorId}|${e.period ?? '?'}`;
}

function timingScore(e: Enriched): number {
  // OFFICIAL beats provider regardless of provider order; within equal authority, better timing status, then provider order.
  return AUTHORITY_RANK[e.input.sourceAuthority ?? 'CURATED'] * 100 + TIMING_RANK[e.input.timingStatus ?? 'UNKNOWN'] * 10 - e.rank;
}

function firstLive<T>(group: Enriched[], pick: (i: RawCalendarInput) => T | null | undefined): { value: T | null; from: ProviderId | null } {
  for (const e of group) {
    if (e.input.providerId === 'curated') continue;
    const v = pick(e.input);
    if (v !== null && v !== undefined) return { value: v, from: e.input.providerId };
  }
  return { value: null, from: null };
}

function fmt(n: number | null): string {
  return n === null ? '--' : String(n);
}

/** Collapse one identity group into a single input, recording disagreements. */
export function mergeGroup(group: Enriched[]): RawCalendarInput {
  const sorted = [...group].sort((a, b) => a.rank - b.rank);
  const timingWinner = [...sorted].sort((a, b) => timingScore(b) - timingScore(a))[0];
  const disagreements: string[] = [];

  // Timing disagreement across contributors (> 5 minutes).
  for (const e of sorted) {
    if (e === timingWinner) continue;
    const drift = Math.abs(e.releaseMs - timingWinner.releaseMs);
    if (drift > 5 * 60_000) {
      disagreements.push(`timing: ${e.input.providerId} ${new Date(e.releaseMs).toISOString()} vs ${timingWinner.input.providerId} ${new Date(timingWinner.releaseMs).toISOString()} (${Math.round(drift / 60_000)}m)`);
    }
  }

  const actual = firstLive(sorted, (i) => i.actual);
  const consensus = firstLive(sorted, (i) => i.consensus);
  const providerForecast = firstLive(sorted, (i) => i.providerForecast);
  const previous = firstLive(sorted, (i) => i.previous);
  const revisedPrevious = firstLive(sorted, (i) => i.revisedPrevious);

  for (const e of sorted) {
    if (e.input.providerId === 'curated' || e.input.providerId === actual.from) continue;
    if (e.input.actual != null && actual.value !== null && e.input.actual !== actual.value) {
      disagreements.push(`actual: ${e.input.providerId} ${fmt(e.input.actual)} vs ${actual.from} ${fmt(actual.value)}`);
    }
    if (e.input.previous != null && previous.value !== null && e.input.previous !== previous.value && e.input.providerId !== previous.from) {
      disagreements.push(`previous: ${e.input.providerId} ${fmt(e.input.previous)} vs ${previous.from} ${fmt(previous.value)}`);
    }
    if (e.input.consensus != null && consensus.value !== null && e.input.consensus !== consensus.value && e.input.providerId !== consensus.from) {
      disagreements.push(`consensus: ${e.input.providerId} ${fmt(e.input.consensus)} vs ${consensus.from} ${fmt(consensus.value)}`);
    }
  }

  const contributors = [...new Set(sorted.map((e) => e.input.providerId))];
  const valueOwner = actual.from ?? consensus.from ?? timingWinner.input.providerId;
  const winner = timingWinner.input;
  const valueRow = sorted.find((e) => e.input.providerId === valueOwner)?.input ?? winner;

  return {
    ...winner,
    // Values always come from live providers (or stay null).
    actual: actual.value,
    consensus: consensus.value,
    providerForecast: providerForecast.value,
    previous: previous.value,
    revisedPrevious: revisedPrevious.value,
    lastUpdated: valueRow.lastUpdated ?? winner.lastUpdated,
    providerStatus: valueRow.providerStatus ?? winner.providerStatus,
    // Registry-mapped rows keep registry semantics; unmapped rows keep provider labels.
    eventName: isUnmappedIndicator(winner.canonicalIndicatorId) ? (winner.eventName ?? valueRow.eventName) : undefined,
    referencePeriod: timingWinner.period ?? winner.referencePeriod ?? valueRow.referencePeriod ?? null,
    contributors,
    disagreements,
  };
}

export interface MergeResult {
  merged: RawCalendarInput[];
  /** Same identity but releases too far apart to be one event. */
  identityConflicts: string[];
}

/**
 * @param inputs   rows from all providers
 * @param order    provider precedence (index 0 wins value conflicts among live providers)
 */
export function mergeInputs(inputs: RawCalendarInput[], order: ProviderId[]): MergeResult {
  const rankOf = (id: ProviderId) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  const enriched: Enriched[] = inputs.map((input) => {
    const releaseMs = releaseMsOf(input);
    return { input, releaseMs, period: normalizedPeriodOf(input, releaseMs), rank: rankOf(input.providerId) };
  });

  const identityConflicts: string[] = [];
  const buckets = new Map<string, Enriched[][]>();

  for (const e of enriched) {
    const key = identityKey(e);
    const clusters = buckets.get(key) ?? [];
    let placed = false;
    for (const cluster of clusters) {
      const anchor = cluster[0];
      const drift = Math.abs(anchor.releaseMs - e.releaseMs);
      if (drift <= MAX_IDENTITY_DRIFT_MS) {
        cluster.push(e);
        placed = true;
        break;
      }
      identityConflicts.push(`${key}: ${anchor.input.providerId}@${new Date(anchor.releaseMs).toISOString()} vs ${e.input.providerId}@${new Date(e.releaseMs).toISOString()}`);
    }
    if (!placed) clusters.push([e]);
    buckets.set(key, clusters);
  }

  // Secondary pass: rows without a reference period join a mapped cluster of
  // the same indicator when released within ±36h; unmapped indicators never do.
  const noPeriod = enriched.filter((e) => e.period === null && !isUnmappedIndicator(e.input.canonicalIndicatorId));
  for (const e of noPeriod) {
    const ownKey = identityKey(e);
    let attached = false;
    for (const [key, clusters] of buckets) {
      if (key === ownKey) continue;
      if (!key.startsWith(`${e.input.countryCode}|${e.input.canonicalIndicatorId}|`)) continue;
      for (const cluster of clusters) {
        if (Math.abs(cluster[0].releaseMs - e.releaseMs) <= NO_PERIOD_WINDOW_MS) {
          cluster.push(e);
          attached = true;
          break;
        }
      }
      if (attached) break;
    }
    if (attached) {
      const own = buckets.get(ownKey)!;
      const idx = own.findIndex((c) => c.includes(e));
      if (idx >= 0) {
        own[idx] = own[idx].filter((x) => x !== e);
        if (own[idx].length === 0) own.splice(idx, 1);
      }
      if (own.length === 0) buckets.delete(ownKey);
    }
  }

  const merged: RawCalendarInput[] = [];
  for (const clusters of buckets.values()) {
    for (const cluster of clusters) merged.push(mergeGroup(cluster));
  }
  return { merged, identityConflicts };
}
