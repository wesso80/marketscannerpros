/**
 * Cross-asset relationship intelligence (Stage 6).
 *
 * A deliberately SMALL set of high-value relationships (BTC↔Nasdaq, DXY↔risk,
 * VIX volatility regime). Describes current co-movement versus a historical
 * baseline and flags divergence — always as ASSOCIATION, never causation, and
 * never as a forecast ("short-term divergence does not by itself imply
 * convergence").
 *
 * Pure and dependency-light for easy testing/reuse.
 */

import type { FreshnessLevel } from './terminology';

export type BaselineRelationship = 'positive' | 'negative' | 'weak' | 'unknown';
export type CoMovement = 'aligned' | 'diverging' | 'unclear';

export interface CrossAssetPairInput {
  a: { label: string; changePct?: number };
  b: { label: string; changePct?: number };
  /** The historical norm between the two (e.g. BTC↔Nasdaq is typically positive). */
  baseline: BaselineRelationship;
  freshness?: FreshnessLevel;
}

export interface CrossAssetReading {
  pair: string;
  coMovement: CoMovement;
  baseline: BaselineRelationship;
  /** True when current co-movement contradicts the historical baseline. */
  diverging: boolean;
  label: string;
  interpretation: string;
}

const MOVE_THRESHOLD = 0.3; // below this a move is treated as roughly flat

function sign(v: number): -1 | 0 | 1 {
  if (v > MOVE_THRESHOLD) return 1;
  if (v < -MOVE_THRESHOLD) return -1;
  return 0;
}

function baselineText(b: BaselineRelationship): string {
  switch (b) {
    case 'positive': return 'have historically shown positive co-movement';
    case 'negative': return 'have historically tended to move inversely';
    case 'weak': return 'have historically shown only a weak relationship';
    default: return 'have no well-established relationship in the available data';
  }
}

export function describeCrossAsset(input: CrossAssetPairInput): CrossAssetReading {
  const pair = `${input.a.label} ↔ ${input.b.label}`;
  const aChg = input.a.changePct;
  const bChg = input.b.changePct;

  if (typeof aChg !== 'number' || typeof bChg !== 'number') {
    return {
      pair,
      coMovement: 'unclear',
      baseline: input.baseline,
      diverging: false,
      label: 'Relationship unavailable',
      interpretation: `Insufficient current data to assess the ${pair} relationship. This pair ${baselineText(input.baseline)}.`,
    };
  }

  const sa = sign(aChg);
  const sb = sign(bChg);

  let coMovement: CoMovement;
  if (sa === 0 || sb === 0) coMovement = 'unclear';
  else if (sa === sb) coMovement = 'aligned';
  else coMovement = 'diverging';

  // Divergence = current co-movement contradicts the baseline norm.
  const diverging =
    (input.baseline === 'positive' && coMovement === 'diverging') ||
    (input.baseline === 'negative' && coMovement === 'aligned');

  const moveDesc = `${input.a.label} ${aChg >= 0 ? '+' : ''}${aChg.toFixed(1)}%, ${input.b.label} ${bChg >= 0 ? '+' : ''}${bChg.toFixed(1)}%`;
  let label: string;
  let interpretation: string;

  if (diverging) {
    label = 'Notable divergence';
    interpretation = `${input.a.label} and ${input.b.label} ${baselineText(input.baseline)}. They are currently diverging (${moveDesc}), which deserves attention. Short-term divergence does not by itself imply convergence, and correlation does not imply causation.`;
  } else if (coMovement === 'aligned') {
    label = 'Moving together';
    interpretation = `${input.a.label} and ${input.b.label} are currently moving in the same direction (${moveDesc}), consistent with their historical association. This is an association, not a causal link.`;
  } else if (coMovement === 'diverging') {
    label = 'Moving inversely';
    interpretation = `${input.a.label} and ${input.b.label} are currently moving inversely (${moveDesc}), consistent with an inverse historical relationship.`;
  } else {
    label = 'Little directional signal';
    interpretation = `${input.a.label} and ${input.b.label} show little directional movement currently (${moveDesc}); the relationship is unclear in the short term.`;
  }

  return { pair, coMovement, baseline: input.baseline, diverging, label, interpretation };
}

export type VolRegimeBand = 'low' | 'normal' | 'elevated' | 'high';

export interface VixRegimeReading {
  band: VolRegimeBand;
  label: string;
  interpretation: string;
}

/** Describe an equity-volatility regime from a VIX-style level. Educational
 *  bands only — not a forecast of market direction. */
export function describeVolatilityRegime(vixLevel?: number): VixRegimeReading {
  if (typeof vixLevel !== 'number' || !Number.isFinite(vixLevel)) {
    return { band: 'normal', label: 'Volatility regime unavailable', interpretation: 'No current volatility-index reading available.' };
  }
  let band: VolRegimeBand;
  if (vixLevel < 14) band = 'low';
  else if (vixLevel < 20) band = 'normal';
  else if (vixLevel < 28) band = 'elevated';
  else band = 'high';

  const LABEL: Record<VolRegimeBand, string> = {
    low: 'Low-volatility regime',
    normal: 'Normal-volatility regime',
    elevated: 'Elevated-volatility regime',
    high: 'High-volatility regime',
  };
  const NOTE: Record<VolRegimeBand, string> = {
    low: 'Implied volatility is low. Historically associated with calmer, trend-friendly conditions, though low volatility can persist or reverse.',
    normal: 'Implied volatility is in a normal range.',
    elevated: 'Implied volatility is elevated. Historically associated with wider ranges and less stable conditions.',
    high: 'Implied volatility is high. Historically associated with stressed, fast-moving conditions and reduced reliability of trend signals.',
  };
  return { band, label: LABEL[band], interpretation: `${NOTE[band]} (VIX ≈ ${vixLevel.toFixed(1)}).` };
}
