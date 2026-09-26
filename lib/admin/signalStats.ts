/**
 * Shared maths for the admin signal-outcome views (Signal Outcomes, Scorecard, Backtest Lab).
 *
 * pct_move_24h / pct_move_4h are RAW price moves (exit vs entry). A correct SHORT has a negative raw move, so any
 * average of raw moves across LONG and SHORT cancels out. Always average the move signed to the call's direction.
 */

/**
 * The AI outcome labeller was rewritten in #167 (merged 23:52 AEST, Sat 26 Sep 2026): real prices only, per-horizon,
 * no default-long. Labels measured before that were made by the old labeller (stale price when AV failed, default
 * long, wrong horizon) and are reported separately as "old method". Labels without outcome_measured_at are old.
 */
export const LABELLER_FIX_AT = "2026-09-26T13:52:24Z";

/** SQL: the 24h (or 4h) move signed to the call's direction (positive = moved the called way). */
export function signedMoveSql(column: "pct_move_24h" | "pct_move_4h" = "pct_move_24h"): string {
  return `(CASE WHEN UPPER(trade_bias) = 'SHORT' THEN -${column} ELSE ${column} END)`;
}

/** Outlier guard used by every average (a bad print can't dominate): |move| <= 100 %. */
export function saneMoveSql(column: "pct_move_24h" | "pct_move_4h" = "pct_move_24h"): string {
  return `ABS(${column}) <= 100`;
}

export interface DirectionalCounts {
  labeled?: number | string | null;
  correct?: number | string | null;
  wrong?: number | string | null;
  neutral?: number | string | null;
  avg_signed_move?: number | string | null;
}

export interface DirectionalSummary {
  labeled: number;
  correct: number;
  wrong: number;
  neutral: number;
  /** correct ÷ (correct + wrong), %; neutral left out. */
  directionalHitRate: number | null;
  /** Average move in the call's direction, %. */
  avgSignedMovePct: number | null;
}

const num = (v: unknown) => {
  const n = Number(v);
  return v === null || v === undefined || !Number.isFinite(n) ? 0 : n;
};

export function pct1(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : null;
}

export function summarizeDirectional(r: DirectionalCounts): DirectionalSummary {
  const correct = num(r.correct);
  const wrong = num(r.wrong);
  const avg = r.avg_signed_move === null || r.avg_signed_move === undefined || r.avg_signed_move === "" ? null : Number(r.avg_signed_move);
  return {
    labeled: num(r.labeled),
    correct,
    wrong,
    neutral: num(r.neutral),
    directionalHitRate: pct1(correct, correct + wrong),
    avgSignedMovePct: avg !== null && Number.isFinite(avg) ? Math.round(avg * 1000) / 1000 : null,
  };
}
