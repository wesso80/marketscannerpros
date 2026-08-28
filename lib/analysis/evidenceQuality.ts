/**
 * Evidence quality assessment for analytical conclusions.
 *
 * Extends the platform's existing data-freshness concept
 * (lib/scanner/providerStatus.ts) into a first-class, reusable "how much should
 * a user trust this conclusion" object with an explicit, human-readable reason
 * list. Every major analytical output on user surfaces can attach one of these.
 *
 * This is descriptive, not predictive: it grades the INPUTS to a conclusion
 * (completeness, freshness, independent-factor coverage, conflicts), never the
 * probability of a market outcome.
 *
 * Pure and dependency-free (imports types only).
 */

import type { EvidenceQualityLevel, FreshnessLevel } from './terminology';
import type { MarketDataProviderStatus } from '@/lib/scanner/providerStatus';

export interface EvidenceQualityInput {
  /** Independent factor groups that produced a usable signal. */
  availableFactors: number;
  /** Total factor groups the conclusion could, in principle, use. */
  totalFactors: number;
  /** Provenance/recency of the underlying market data. */
  freshness: FreshnessLevel;
  /** True when independent factors materially disagree. */
  conflicting?: boolean;
  /** Names of important data layers that are missing (e.g. 'options', 'volume'). */
  missing?: string[];
}

export interface EvidenceQualityResult {
  level: EvidenceQualityLevel;
  /** 0–1 fraction of factor groups available. */
  completeness: number;
  /** Ordered, human-readable justifications for the level. */
  reasons: string[];
}

/** Map the existing MarketDataProviderStatus into a FreshnessLevel. */
export function freshnessFromProviderStatus(status: Pick<MarketDataProviderStatus, 'live' | 'stale' | 'simulated'>): FreshnessLevel {
  if (status.simulated) return 'simulated';
  if (status.stale) return 'stale';
  if (status.live) return 'live';
  return 'delayed';
}

/**
 * Grade the evidence behind an analytical conclusion.
 *
 * Rules (deliberately conservative — the platform prefers to under-claim):
 *  - < 2 independent factors, or missing/simulated data → INSUFFICIENT.
 *  - stale/delayed data or conflicts cap the level below HIGH.
 *  - HIGH requires broad coverage AND live data AND no conflicts.
 */
export function assessEvidenceQuality(input: EvidenceQualityInput): EvidenceQualityResult {
  const totalFactors = Math.max(1, input.totalFactors);
  const availableFactors = Math.max(0, Math.min(input.availableFactors, totalFactors));
  const completeness = availableFactors / totalFactors;
  const reasons: string[] = [];

  // Hard INSUFFICIENT conditions.
  if (availableFactors < 2) {
    reasons.push(`Only ${availableFactors} independent factor group${availableFactors === 1 ? '' : 's'} available (need at least 2).`);
    return { level: 'INSUFFICIENT', completeness, reasons };
  }
  if (input.freshness === 'missing') {
    reasons.push('Underlying market data is missing.');
    return { level: 'INSUFFICIENT', completeness, reasons };
  }
  if (input.freshness === 'simulated') {
    reasons.push('Conclusion is based on simulated/demo data, not live market data.');
    return { level: 'INSUFFICIENT', completeness, reasons };
  }

  reasons.push(`${availableFactors}/${totalFactors} independent factor groups available.`);

  const freshnessDowngrade = input.freshness === 'stale' || input.freshness === 'delayed' || input.freshness === 'unknown';
  if (input.freshness === 'live') reasons.push('Market data is current within expected provider cadence.');
  else if (input.freshness === 'delayed') reasons.push('Market data is delayed (not real-time).');
  else if (input.freshness === 'stale') reasons.push('Market data is stale.');
  else reasons.push('Market data recency is unknown.');

  if (input.conflicting) reasons.push('Independent factors currently disagree.');
  if (input.missing && input.missing.length) reasons.push(`Missing layers: ${input.missing.join(', ')}.`);

  // Level derivation.
  let level: EvidenceQualityLevel;
  if (completeness >= 0.8 && !freshnessDowngrade && !input.conflicting) {
    level = 'HIGH';
  } else if (completeness >= 0.5 && !(freshnessDowngrade && input.conflicting)) {
    level = 'MEDIUM';
  } else {
    level = 'LOW';
  }

  return { level, completeness, reasons };
}
