/**
 * Admin Edge Layer lifecycle state machine.
 *
 * Maps the existing engine `ResearchLifecycle`
 * (FRESH/DEVELOPING/READY/TRIGGERED/EXHAUSTED/TRAPPED/INVALIDATED/NO_EDGE/DATA_DEGRADED)
 * to the spec's 9-state Admin Command Queue lifecycle:
 * IGNORE/WATCH/BUILDING/PRIME/TRIGGERED/CONFIRMED/PAID/EXHAUSTED/INVALIDATED.
 */

import type { ResearchLifecycle } from "./adminTypes";

export type AdminLifecycleState =
  | "IGNORE"
  | "WATCH"
  | "BUILDING"
  | "PRIME"
  | "TRIGGERED"
  | "CONFIRMED"
  | "PAID"
  | "EXHAUSTED"
  | "INVALIDATED";

export const ADMIN_LIFECYCLE_STATES: readonly AdminLifecycleState[] = [
  "IGNORE", "WATCH", "BUILDING", "PRIME", "TRIGGERED",
  "CONFIRMED", "PAID", "EXHAUSTED", "INVALIDATED",
] as const;

/** States that should be hidden from the active command queue by default. */
export const TERMINAL_STATES: ReadonlySet<AdminLifecycleState> = new Set([
  "IGNORE", "PAID", "EXHAUSTED", "INVALIDATED",
]);

export interface MapLifecycleContext {
  /** opportunityRankScore (0..100). */
  score: number;
  /** True if a DoNothingVerdict is active for this packet. */
  doNothing: boolean;
  /**
   * Severity of the active DoNothingVerdict (1..3). Only severity-3
   * (hard-no) demotes to IGNORE — a severity-1 caution (e.g.
   * INSIDE_VALUE on a quiet tape) should keep the symbol visible on
   * the watchlist tier so the operator can still see it forming.
   */
  doNothingSeverity?: 1 | 2 | 3;
}

export function mapResearchLifecycleToAdminState(
  lc: ResearchLifecycle,
  ctx: MapLifecycleContext,
): AdminLifecycleState {
  // Terminal lifecycles map straight through.
  if (lc === "INVALIDATED") return "INVALIDATED";
  if (lc === "EXHAUSTED")   return "EXHAUSTED";
  if (lc === "TRAPPED")     return "INVALIDATED";  // trapped == invalidated for queue
  if (lc === "NO_EDGE")     return "IGNORE";
  if (lc === "DATA_DEGRADED") return "IGNORE";

  // Hard-no DoNothing demotes anything not yet TRIGGERED to IGNORE.
  // Severity defaults to 3 when missing (back-compat with callers that
  // don't yet pass it) so existing strictness is preserved.
  const severity = ctx.doNothingSeverity ?? 3;
  if (ctx.doNothing && severity >= 3 && lc !== "TRIGGERED") return "IGNORE";

  if (lc === "TRIGGERED") return "TRIGGERED";

  // FRESH / DEVELOPING / READY → score-tiered. A soft DoNothing (sev 1–2)
  // caps the published state at WATCH so the symbol stays observable
  // without being promoted into the actionable tier.
  if (ctx.doNothing && severity < 3) return "WATCH";
  if (ctx.score >= 80) return "PRIME";
  if (ctx.score >= 65) return "BUILDING";
  if (ctx.score >= 50) return "WATCH";
  return "IGNORE";
}

/* ────────────── Transition validator (used by /api/admin/queue POST) ────────────── */

const ALLOWED_TRANSITIONS: Record<AdminLifecycleState, ReadonlyArray<AdminLifecycleState>> = {
  IGNORE:      ["WATCH"],
  WATCH:       ["IGNORE", "BUILDING"],
  BUILDING:    ["WATCH", "PRIME", "INVALIDATED"],
  PRIME:       ["BUILDING", "TRIGGERED", "INVALIDATED", "EXHAUSTED"],
  TRIGGERED:   ["CONFIRMED", "INVALIDATED", "EXHAUSTED"],
  CONFIRMED:   ["PAID", "INVALIDATED", "EXHAUSTED"],
  PAID:        [], // terminal
  EXHAUSTED:   [], // terminal
  INVALIDATED: [], // terminal
};

export function isValidTransition(
  from: AdminLifecycleState,
  to: AdminLifecycleState,
): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}
