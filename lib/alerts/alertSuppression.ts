/**
 * Phase 5 — Admin Research Alert Suppression
 *
 * Pure, side-effect free suppression logic. Decides whether a candidate
 * research alert may fire, given:
 *   - a cooldown window (per symbol+timeframe+setup)
 *   - duplicate detection inside that window
 *   - a minimum evidence threshold (score + dataTrustScore)
 *   - DATA_DEGRADED / NO_EDGE lifecycle blocks
 *
 * This module is intentionally I/O free so it is trivially unit testable.
 * The caller (researchAlertEngine) is responsible for loading the recent
 * alert history and persisting the decision.
 */

import type { AdminResearchAlert, ResearchLifecycle } from "../admin/adminTypes";

export type SuppressionReason =
  | "COOLDOWN_ACTIVE"
  | "DUPLICATE_IN_WINDOW"
  | "BELOW_SCORE_THRESHOLD"
  | "BELOW_TRUST_THRESHOLD"
  | "DATA_DEGRADED"
  | "NO_EDGE_LIFECYCLE";

export interface SuppressionDecision {
  allow: boolean;
  reason?: SuppressionReason;
}

export interface SuppressionThresholds {
  /** Minimum composite score (0..100) required to fire. */
  minScore: number;
  /** Minimum dataTrustScore (0..100) required to fire. */
  minTrust: number;
  /** Cooldown window in milliseconds for the same symbol+timeframe+setup key. */
  cooldownMs: number;
}

export const DEFAULT_THRESHOLDS: SuppressionThresholds = {
  minScore: 70,
  minTrust: 50,
  cooldownMs: 60 * 60 * 1000, // 1 hour
};

export interface SuppressionInput {
  symbol: string;
  market: string;
  timeframe: string;
  setup: string;
  score: number;
  dataTrustScore: number;
  lifecycle: ResearchLifecycle;
  /** Recent alerts for this workspace, newest first preferred. */
  recentAlerts: Pick<AdminResearchAlert, "symbol" | "timeframe" | "setup" | "createdAt">[];
  /** "Now" timestamp (defaults to Date.now()). Injected for testing. */
  now?: number;
  thresholds?: Partial<SuppressionThresholds>;
}

export function evaluateSuppression(input: SuppressionInput): SuppressionDecision {
  const t: SuppressionThresholds = { ...DEFAULT_THRESHOLDS, ...(input.thresholds || {}) };
  const now = input.now ?? Date.now();

  if (input.lifecycle === "DATA_DEGRADED") {
    return { allow: false, reason: "DATA_DEGRADED" };
  }
  if (input.lifecycle === "NO_EDGE") {
    return { allow: false, reason: "NO_EDGE_LIFECYCLE" };
  }
  if (input.dataTrustScore < t.minTrust) {
    return { allow: false, reason: "BELOW_TRUST_THRESHOLD" };
  }
  if (input.score < t.minScore) {
    return { allow: false, reason: "BELOW_SCORE_THRESHOLD" };
  }

  const key = (a: { symbol: string; timeframe: string; setup: string }) =>
    `${a.symbol}|${a.timeframe}|${a.setup}`;
  const myKey = key({ symbol: input.symbol, timeframe: input.timeframe, setup: input.setup });

  for (const recent of input.recentAlerts) {
    if (key(recent) !== myKey) continue;
    const created = Date.parse(recent.createdAt);
    if (!Number.isFinite(created)) continue;
    const ageMs = now - created;
    if (ageMs < 0) continue;
    if (ageMs < t.cooldownMs) {
      return { allow: false, reason: "DUPLICATE_IN_WINDOW" };
    }
  }

  return { allow: true };
}
