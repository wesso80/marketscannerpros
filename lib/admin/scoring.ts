/**
 * Admin three-layer scoring contract.
 *
 * See .claude/ADMIN_TERMINAL.md and .claude/ADMIN_RULES.md.
 *
 * Hard rule: these three scores MUST remain separate in transport and
 * UI. Do not collapse them into a single number before the user sees
 * them. Combining them prematurely is what caused the admin terminal
 * to suppress valid opportunities based on personal portfolio state.
 */

export type ScoreScale = 0 | 100; // documentation-only marker

/** Quality of the market/setup itself. Independent of portfolio. */
export interface OpportunityScore {
  /** 0-100 */
  value: number;
  drivers: string[];
  /** What would confirm the thesis. */
  confirms: string[];
  /** What would invalidate the thesis. */
  invalidates: string[];
}

/** Reliability and freshness of the underlying data. */
export interface EvidenceQualityScore {
  /** 0-100 */
  value: number;
  /** Sources used (e.g. "alpha-vantage", "coingecko"). */
  sources: string[];
  /** Critical fields that were not available. */
  missingFields: string[];
  /** True if any input is delayed past its expected SLA. */
  stale: boolean;
  /** True if any value is simulated/derived/placeholder. */
  simulated: boolean;
}

/**
 * Owner's personal exposure context. Display-only outside risk-desk
 * mode. Never use as a blocker in opportunity-scout mode.
 */
export interface PersonalExposureScore {
  /** 0-100, or null if no exposure data is available. */
  value: number | null;
  flag: 'none' | 'low' | 'elevated' | 'high';
  notes: string[];
}

/** The complete admin score envelope returned by admin APIs. */
export interface ScoreBundle {
  opportunity: OpportunityScore;
  evidence: EvidenceQualityScore;
  exposure: PersonalExposureScore;
}

/**
 * Helper to build a ScoreBundle while making the no-collapse rule
 * obvious at call sites. Returns the bundle as-is; exists primarily
 * to be greppable and to centralize future invariants/validation.
 */
export function buildScoreBundle(bundle: ScoreBundle): ScoreBundle {
  if (bundle.opportunity.value < 0 || bundle.opportunity.value > 100) {
    throw new Error('OpportunityScore.value out of range');
  }
  if (bundle.evidence.value < 0 || bundle.evidence.value > 100) {
    throw new Error('EvidenceQualityScore.value out of range');
  }
  if (
    bundle.exposure.value !== null &&
    (bundle.exposure.value < 0 || bundle.exposure.value > 100)
  ) {
    throw new Error('PersonalExposureScore.value out of range');
  }
  return bundle;
}
