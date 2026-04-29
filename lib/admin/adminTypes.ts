/**
 * Admin Research Terminal — Internal Research Types
 *
 * These types are internal to the admin research surface. They describe
 * "how strong is the *research thesis* on this symbol right now?" and never
 * imply or authorize broker execution, order routing, or position sizing
 * for clients.
 *
 * Introduced in Phase 3 (Opportunity Research Board).
 */

import type { DataTruth } from "@/lib/engines/dataTruth";
import type { BiasState } from "@/lib/admin/types";

/* ───────────── Setup classification ───────────── */

/**
 * Internal taxonomy of repeatable research setups. Used to route a verdict
 * into a research playbook (NOT a trade plan).
 */
export type SetupType =
  | "TREND_CONTINUATION"
  | "TREND_PULLBACK"
  | "RANGE_REVERSION"
  | "RANGE_BREAKOUT"
  | "FAILED_BREAKOUT"
  | "LIQUIDITY_SWEEP"
  | "SQUEEZE_EXPANSION"
  | "VOLATILITY_CONTRACTION"
  | "GAP_FILL"
  | "EXHAUSTION_FADE"
  | "HIGHER_TIMEFRAME_REJECTION"
  | "RECLAIM_AND_HOLD"
  | "BREAKDOWN_RETEST"
  | "MOMENTUM_IGNITION"
  | "MEAN_REVERSION_TRAP"
  | "NO_SETUP";

export interface SetupDefinition {
  type: SetupType;
  /** Human-readable research label. */
  label: string;
  /** One-line description for the cockpit. */
  description: string;
  /** Bias polarity this setup typically pairs with. */
  polarity: "LONG" | "SHORT" | "EITHER" | "NEUTRAL";
}

/* ───────────── Lifecycle states ───────────── */

/**
 * Where this research candidate sits in its lifecycle. Drives row
 * suppression on the Opportunity Board.
 */
export type ResearchLifecycle =
  | "FRESH"
  | "DEVELOPING"
  | "READY"
  | "TRIGGERED"
  | "EXHAUSTED"
  | "TRAPPED"
  | "INVALIDATED"
  | "NO_EDGE"
  | "DATA_DEGRADED";

/* ───────────── Score axes ───────────── */

/**
 * Sub-scores that compose the InternalResearchScore. All values 0..100.
 * Each axis is capped at 25% of the total to prevent any one signal from
 * dominating the verdict.
 */
export interface ResearchScoreAxes {
  trend: number;
  momentum: number;
  volatility: number;
  time: number;
  options: number;
  liquidity: number;
  macro: number;
  sentiment: number;
  fundamentals: number;
}

export interface ResearchScorePenalty {
  code: string;
  label: string;
  /** Penalty magnitude in score points (positive number subtracted). */
  weight: number;
}

export interface ResearchScoreBoost {
  code: string;
  label: string;
  /** Boost magnitude in score points (positive number added). */
  weight: number;
}

/* ───────────── Composite score ───────────── */

export interface InternalResearchScore {
  /** Composite 0..100 score (after cap, penalties, boosts, and floors). */
  score: number;
  /** Raw uncapped composite (for debug / audit). */
  rawScore: number;
  /** Lifecycle classification. */
  lifecycle: ResearchLifecycle;
  /** Per-axis sub-scores (0..100). */
  axes: ResearchScoreAxes;
  /** Largest single axis contribution after cap (for transparency). */
  dominantAxis: keyof ResearchScoreAxes | null;
  /** Penalties applied (audit trail). */
  penalties: ResearchScorePenalty[];
  /** Boosts applied (audit trail). */
  boosts: ResearchScoreBoost[];
  /** Notes for the cockpit / debug rail. */
  notes: string[];
}

/* ───────────── Opportunity row (board / API contract) ───────────── */

export interface AdminOpportunityRow {
  rank: number;
  symbol: string;
  market: string;
  timeframe: string;
  bias: BiasState;
  setup: SetupDefinition;
  score: InternalResearchScore;
  dataTruth: DataTruth;
  /** Score delta vs the previous scan. */
  changeSinceLastScan: number;
  /** Optional alert state (filled in by Phase 5 alert engine). */
  alertState?: "NONE" | "PENDING" | "FIRED" | "SUPPRESSED";
}

/* ───────────── Alert payload (skeleton — Phase 5 will wire) ───────────── */

export interface AdminResearchAlert {
  alertId: string;
  symbol: string;
  market: string;
  timeframe: string;
  setup: SetupType;
  bias: BiasState;
  score: number;
  dataTrustScore: number;
  /** Always present, always exactly this string. */
  classification: "PRIVATE_RESEARCH_ALERT_NOT_BROKER_EXECUTION";
  createdAt: string;
}
