/**
 * Do-Nothing Engine.
 *
 * Returns a `DoNothingVerdict` when the admin should NOT engage with a
 * setup — even if the score looks decent. Doctrine: "Tell the operator
 * when there is no edge, before they manufacture one."
 *
 * Boundary: research-only. This never authorizes or blocks broker
 * execution (none exists in admin per .claude/ADMIN_NO_EXECUTION.md).
 */

import type { AdminResearchPacket } from "./getAdminResearchPacket";

export type DoNothingCode =
  | "INSIDE_VALUE"
  | "VOL_NOT_READY"
  | "BAD_TIMING"
  | "TF_CONFLICT"
  | "NOISY_FLOW"
  | "GAMMA_PIN"
  | "POOR_RR"
  | "ALREADY_PAID"
  | "MACRO_RISK"
  | "DATA_DEGRADED";

export interface DoNothingVerdict {
  code: DoNothingCode;
  headline: string;
  detail: string[];
  /** Severity 1..3 (3 = absolute hard-no). */
  severity: 1 | 2 | 3;
}

/** Evaluate; first hard match wins. Returns null if no reason fires. */
export function evaluateDoNothing(packet: AdminResearchPacket): DoNothingVerdict | null {
  const snap = packet.snapshot;
  const dt = packet.dataTruth;
  const ind = snap?.indicators;
  const dve = snap?.dve;
  const lc = packet.internalResearchScore?.lifecycle;

  // 1. Data degraded — hardest stop.
  if (lc === "DATA_DEGRADED" || dt?.status === "STALE") {
    return verdict("DATA_DEGRADED", "Data quality too low to score an edge.", [
      `dataTruth=${dt?.status ?? "unknown"}`,
      `trustScore=${dt?.trustScore ?? 0}`,
    ], 3);
  }

  // 2. Already paid.
  if (lc === "EXHAUSTED") {
    return verdict("ALREADY_PAID", "Setup has already paid out or exhausted.", [
      "lifecycle=EXHAUSTED",
    ], 3);
  }

  // 3. Poor R:R — derive from targets.
  const rr = computeRR(snap?.targets);
  if (rr !== null && rr < 1.0) {
    return verdict("POOR_RR", `Reward-to-risk only ${rr.toFixed(2)}R into target 1.`, [
      `entry=${snap?.targets.entry}`,
      `invalidation=${snap?.targets.invalidation}`,
      `target1=${snap?.targets.target1}`,
    ], 2);
  }

  // 4. Inside value — chop-pin.
  if (ind && (ind.adx ?? 0) < 18) {
    const vwap = snap?.levels?.vwap ?? 0;
    const px = snap?.price ?? 0;
    if (vwap > 0 && px > 0 && Math.abs(px - vwap) / vwap < 0.003) {
      return verdict("INSIDE_VALUE", "Price pinned inside value with weak ADX.", [
        `adx=${ind.adx?.toFixed(1)}`,
        `distVWAP=${((px - vwap) / vwap * 100).toFixed(2)}%`,
      ], 1);
    }
  }

  // 5. Volatility not ready.
  if (dve && !dve.trap && (dve.breakoutReadiness ?? 0) < 50 && dve.state !== "SQUEEZE") {
    if ((ind?.bbwpPercentile ?? 0) > 30) {
      return verdict("VOL_NOT_READY", "Volatility profile not primed for expansion.", [
        `breakoutReadiness=${dve.breakoutReadiness}`,
        `bbwp=${ind?.bbwpPercentile}`,
        `dveState=${dve.state}`,
      ], 1);
    }
  }

  // 6. Timeframe conflict — bias vs HTF (no HTF field on snapshot today;
  //    we use evidence axes if present).
  const evidence = snap?.evidence;
  if (evidence && (evidence.crossMarketConfirmation ?? 50) < 30) {
    return verdict("TF_CONFLICT", "Cross-timeframe / cross-market evidence conflicts.", [
      `crossMarketConfirmation=${evidence.crossMarketConfirmation}`,
    ], 2);
  }

  // 7. Noisy options flow.
  const opts = packet.optionsIntelligence;
  if (opts && (opts as { conflicted?: boolean }).conflicted) {
    return verdict("NOISY_FLOW", "Options flow conflicted; signal-to-noise too low.", [
      "optionsIntelligence.conflicted=true",
    ], 1);
  }

  // 8. Macro risk window — packet should annotate via newsContext.status.
  if (packet.newsContext?.status === "ELEVATED") {
    return verdict("MACRO_RISK", "Elevated macro/news shock window.", [
      packet.newsContext.note ?? "",
    ], 2);
  }

  return null;
}

function verdict(
  code: DoNothingCode,
  headline: string,
  detail: string[],
  severity: 1 | 2 | 3,
): DoNothingVerdict {
  return { code, headline, detail: detail.filter(Boolean), severity };
}

function computeRR(t?: { entry: number; invalidation: number; target1: number }): number | null {
  if (!t || !t.entry || !t.invalidation || !t.target1) return null;
  const risk = Math.abs(t.entry - t.invalidation);
  const reward = Math.abs(t.target1 - t.entry);
  if (risk <= 0) return null;
  return reward / risk;
}
