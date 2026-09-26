/**
 * Ranked scanner display rules for canonical "No setup" rows. Pure, client-safe.
 *
 * A no-setup row keeps its indicator factor bias on the payload (the Pro Scanner's factor filter uses it), but in the
 * Ranked view it must not read as a directional setup: no Bullish/Bearish claim, no "Trend supportive · …" factor
 * list, no "0 · Grade F" (F means blocked). Long and short are handled the same way.
 */
import { canonicalRowLabel, canonicalRowStatus } from '@/lib/scoring/canonical/scannerAdapter';
import type { CanonicalResult } from '@/lib/scoring/canonical/types';

interface Row { direction?: string | null; canonical?: CanonicalResult | null }

export function isNoSetupRow(r: Row): boolean {
  return !!r.canonical && canonicalRowStatus(r.canonical) === 'NO_SETUP';
}

/** The side the row actually claims: a no-setup row claims none. */
export function rankedClaimedDirection(r: Row): string {
  if (isNoSetupRow(r)) return 'neutral';
  return r.direction ?? 'neutral';
}

/** Tooltip for the Bias cell; for no-setup rows it names the factor lean without claiming it. */
export function rankedBiasTitle(r: Row): string | undefined {
  if (!isNoSetupRow(r)) return undefined;
  const lean = r.direction === 'bullish' ? 'bullish' : r.direction === 'bearish' ? 'bearish' : 'none';
  return `No setup, so no direction is claimed. Indicator factor lean: ${lean}.`;
}

/** Reason text for a no-setup row: the engine's "No setup: <closest candidate>" instead of supportive factors. */
export function noSetupRankedReason(r: Row): string | null {
  return isNoSetupRow(r) ? canonicalRowLabel(r.canonical!) : null;
}

/** What the Ranked score number is: the canonical Setup score, or the MSP composite for rows without one. */
export function rankedScoreLabel(r: Row): 'Setup' | 'MSP' {
  return r.canonical ? 'Setup' : 'MSP';
}
