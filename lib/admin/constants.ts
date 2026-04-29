/**
 * Admin Research Terminal — Centralized Constants
 *
 * Magic numbers extracted from truth-layer.ts and morning-brief.ts during
 * the Phase 1.5 algorithm audit. Keep all admin-engine thresholds here so
 * they are discoverable, testable, and tunable without grepping.
 *
 * Boundary reminder: these govern *research alerting and analytics only*.
 * Nothing in this file authorizes broker execution or client trading.
 */

/* ───────────── Confidence classification (toConfidenceClass) ───────────── */

export const CONFIDENCE_HIGH_MIN = 0.85;
export const CONFIDENCE_MODERATE_MIN = 0.70;
export const CONFIDENCE_WEAK_MIN = 0.55;

/* ───────────── Research readiness gating (resolveReadiness) ───────────── */

/** Confidence floor for a setup to be flagged "research ready". */
export const RESEARCH_READY_CONFIDENCE_MIN = CONFIDENCE_WEAK_MIN; // 0.55

/** Structure quality required (in addition to confidence) for STRONG thesis. */
export const THESIS_STRONG_STRUCTURE_MIN = 0.6;
export const THESIS_STRONG_CONFIDENCE_MIN = 0.7;
export const THESIS_DEGRADED_CONFIDENCE_MIN = 0.5;

/* ───────────── Reason stack thresholds (buildReasonStack) ───────────── */

/** Evidence dimension below this fires a NEGATIVE reason. */
export const REASON_WEAK_DIMENSION_MAX = 0.4;
/** Evidence dimension at/above this fires a POSITIVE reason. */
export const REASON_STRONG_DIMENSION_MIN = 0.7;

/**
 * Penalty/boost normalization cap. Raw `value` is multiplied by 2 then
 * clamped to this ceiling so a single axis cannot dominate the reason
 * stack. If upstream scoring scaling changes, revisit this.
 */
export const REASON_IMPACT_CEILING = 0.9;
export const REASON_IMPACT_MULTIPLIER = 2;

/** Top-N reasons surfaced in the cockpit (full list available behind disclosure). */
export const REASON_STACK_DISPLAY_LIMIT = 5;

/* ───────────── Data freshness (resolveFreshness / DataTruth) ───────────── */

/**
 * Default freshness thresholds when no timeframe context is known. These are
 * tight on purpose — for high-frequency scans, 60s old is already DELAYED.
 *
 * For longer timeframes use computeDataTruth() which scales these by the
 * candidate timeframe so a 1h verdict isn't marked DELAYED 60 seconds after
 * generation.
 */
export const DATA_FRESH_LIVE_SEC = 60;
export const DATA_FRESH_STALE_SEC = 300;

/** Multiplier applied to timeframe-in-seconds to derive a scaled stale cutoff. */
export const DATA_STALE_TIMEFRAME_MULTIPLIER = 0.5;

/* ───────────── Risk governor (buildMorningRiskGovernor) ───────────── */

/** Daily drawdown that hard-stops the trade budget. */
export const RISK_HARD_STOP_DRAWDOWN_PCT = 0.04;

/** Drawdown at which permission downgrades from GO to WAIT. */
export const RISK_WAIT_DRAWDOWN_PCT = 0.02;

/** Correlation risk that downgrades permission to WAIT. */
export const RISK_WAIT_CORRELATION_PCT = 0.65;

/** Trade-budget rules. */
export const RISK_BUDGET_RULE_BREAK_TRADES = 1;
export const RISK_BUDGET_DEFAULT_TRADES = 3;
export const RISK_BUDGET_HIGH_EXECUTION_TRADES = 4;
export const RISK_BUDGET_HIGH_EXECUTION_THRESHOLD = 75;
export const RISK_BUDGET_LOW_DISCIPLINE_THRESHOLD = 60;
