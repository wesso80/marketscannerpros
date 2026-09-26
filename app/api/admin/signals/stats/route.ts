/**
 * GET /api/admin/signals/stats — Aggregate signal accuracy statistics
 *
 * Returns:
 *   - Total signals, labeled count, pending count
 *   - Accuracy rate (correct / labeled)
 *   - Breakdown by regime
 *   - Breakdown by verdict (permission)
 *   - Average move for correct vs wrong, signed to the call's direction (a correct SHORT is a positive move)
 *   - Recent performance (last 7 days vs prior 30)
 *   - Since the labeller fix: by direction, asset class, 4h horizon, and by source (operator-terminal plus the
 *     admin-call:* page workspaces written by lib/admin/adminCallLog.ts)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/db";
import { wrapTruth } from "@/lib/admin";
import { LABELLER_FIX_AT, saneMoveSql, signedMoveSql, summarizeDirectional, type DirectionalCounts } from "@/lib/admin/signalStats";

export const runtime = "nodejs";

const WS = "operator-terminal";
const SIGNED_24H = signedMoveSql("pct_move_24h");
const SIGNED_4H = signedMoveSql("pct_move_4h");

// LABELLER_FIX_AT lives in lib/admin/signalStats (shared by Scorecard, Model Diagnostics, Backtest Lab); re-exported here.
export { LABELLER_FIX_AT };

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    // 1. Overall stats
    const overall = await q(
      `SELECT
         COUNT(*)::int AS total_signals,
         COUNT(*) FILTER (WHERE outcome != 'pending')::int AS labeled,
         COUNT(*) FILTER (WHERE outcome = 'pending')::int AS pending,
         COUNT(*) FILTER (WHERE outcome = 'correct')::int AS correct,
         COUNT(*) FILTER (WHERE outcome = 'wrong')::int AS wrong,
         COUNT(*) FILTER (WHERE outcome = 'neutral')::int AS neutral,
         COUNT(*) FILTER (WHERE outcome = 'expired')::int AS expired,
         -- Signed to the call's direction: raw pct_move_24h of a correct SHORT is negative and used to cancel out
         -- correct LONGs. avg_move_wrong is the adverse move (positive number).
         ROUND(AVG(${SIGNED_24H}) FILTER (WHERE outcome = 'correct' AND ${saneMoveSql()}), 2) AS avg_move_correct,
         ROUND(AVG(-${SIGNED_24H}) FILTER (WHERE outcome = 'wrong' AND ${saneMoveSql()}), 2) AS avg_move_wrong,
         ROUND(AVG(${SIGNED_24H}) FILTER (WHERE outcome IN ('correct', 'wrong', 'neutral') AND outcome_measured_at >= $2::timestamptz AND ${saneMoveSql()}), 3) AS avg_signed_move_since_fix,
         COUNT(*) FILTER (WHERE outcome = 'neutral' AND outcome_measured_at >= $2::timestamptz)::int AS neutral_since_fix,
         ROUND(AVG(confluence_score), 1) AS avg_confluence,
         COUNT(*) FILTER (WHERE outcome != 'pending' AND (outcome_measured_at IS NULL OR outcome_measured_at < $2::timestamptz))::int AS labeled_old_method,
         COUNT(*) FILTER (WHERE outcome != 'pending' AND outcome_measured_at >= $2::timestamptz)::int AS labeled_since_fix,
         COUNT(*) FILTER (WHERE outcome = 'correct' AND outcome_measured_at >= $2::timestamptz)::int AS correct_since_fix,
         COUNT(*) FILTER (WHERE outcome = 'wrong' AND outcome_measured_at >= $2::timestamptz)::int AS wrong_since_fix
       FROM ai_signal_log
       WHERE workspace_id = $1`,
      [WS, LABELLER_FIX_AT],
    );

    const o = overall[0] ?? {};
    const labeled = o.labeled ?? 0;
    // "Hit rate incl. neutral/expired": correct / every labelled row (neutral and expired count as misses).
    const accuracyRate = labeled > 0 ? ((o.correct ?? 0) / labeled) * 100 : null;
    const directional = (o.correct ?? 0) + (o.wrong ?? 0);
    const labeledSinceFix = o.labeled_since_fix ?? 0;
    const directionalSinceFix = (o.correct_since_fix ?? 0) + (o.wrong_since_fix ?? 0);
    const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

    // 2. By regime
    const byRegime = await q(
      `SELECT
         regime,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE outcome = 'correct')::int AS correct,
         COUNT(*) FILTER (WHERE outcome = 'wrong')::int AS wrong,
         COUNT(*) FILTER (WHERE outcome NOT IN ('pending'))::int AS labeled,
         COUNT(*) FILTER (WHERE outcome = 'correct' AND outcome_measured_at >= $2::timestamptz)::int AS correct_since_fix,
         COUNT(*) FILTER (WHERE outcome = 'wrong' AND outcome_measured_at >= $2::timestamptz)::int AS wrong_since_fix,
         COUNT(*) FILTER (WHERE outcome IN ('correct', 'wrong', 'neutral') AND outcome_measured_at >= $2::timestamptz)::int AS labeled_since_fix,
         ROUND(AVG(confluence_score), 1) AS avg_score
       FROM ai_signal_log
       WHERE workspace_id = $1
       GROUP BY regime
       ORDER BY total DESC`,
      [WS, LABELLER_FIX_AT],
    );

    // 3. By verdict (permission)
    const byVerdict = await q(
      `SELECT
         verdict,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE outcome = 'correct')::int AS correct,
         COUNT(*) FILTER (WHERE outcome = 'wrong')::int AS wrong,
         COUNT(*) FILTER (WHERE outcome NOT IN ('pending'))::int AS labeled,
         COUNT(*) FILTER (WHERE outcome = 'correct' AND outcome_measured_at >= $2::timestamptz)::int AS correct_since_fix,
         COUNT(*) FILTER (WHERE outcome = 'wrong' AND outcome_measured_at >= $2::timestamptz)::int AS wrong_since_fix,
         COUNT(*) FILTER (WHERE outcome IN ('correct', 'wrong', 'neutral') AND outcome_measured_at >= $2::timestamptz)::int AS labeled_since_fix
       FROM ai_signal_log
       WHERE workspace_id = $1
       GROUP BY verdict
       ORDER BY total DESC`,
      [WS, LABELLER_FIX_AT],
    );

    // 4. Recent 7d vs prior 30d
    const recent7d = await q(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE outcome = 'correct')::int AS correct,
         COUNT(*) FILTER (WHERE outcome NOT IN ('pending'))::int AS labeled
       FROM ai_signal_log
       WHERE workspace_id = $1 AND signal_at > NOW() - INTERVAL '7 days'`,
      [WS],
    );
    const prior30d = await q(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE outcome = 'correct')::int AS correct,
         COUNT(*) FILTER (WHERE outcome NOT IN ('pending'))::int AS labeled
       FROM ai_signal_log
       WHERE workspace_id = $1
         AND signal_at > NOW() - INTERVAL '37 days'
         AND signal_at <= NOW() - INTERVAL '7 days'`,
      [WS],
    );

    const r7 = recent7d[0] ?? {};
    const p30 = prior30d[0] ?? {};

    // 5. Since the fix: by direction and asset class (24h), the 4h horizon, and by source.
    const breakdown = await q<DirectionalCounts & { dir: string | null; asset: string | null }>(
      `SELECT UPPER(trade_bias) AS dir,
              CASE WHEN LOWER(asset_type) = 'crypto' THEN 'crypto' ELSE 'equity' END AS asset,
              COUNT(*)::int AS labeled,
              COUNT(*) FILTER (WHERE outcome = 'correct')::int AS correct,
              COUNT(*) FILTER (WHERE outcome = 'wrong')::int AS wrong,
              COUNT(*) FILTER (WHERE outcome = 'neutral')::int AS neutral,
              ROUND(AVG(${SIGNED_24H}) FILTER (WHERE ${saneMoveSql()}), 3) AS avg_signed_move
         FROM ai_signal_log
        WHERE workspace_id = $1 AND outcome IN ('correct', 'wrong', 'neutral') AND outcome_measured_at >= $2::timestamptz
          AND UPPER(trade_bias) IN ('LONG', 'SHORT')
        GROUP BY GROUPING SETS ((UPPER(trade_bias)), (CASE WHEN LOWER(asset_type) = 'crypto' THEN 'crypto' ELSE 'equity' END))`,
      [WS, LABELLER_FIX_AT],
    );
    // 4h columns come with migration 103; without them the 4h block is null.
    const horizon4h = await q<DirectionalCounts & { dir: string | null }>(
      `SELECT UPPER(trade_bias) AS dir,
              COUNT(*)::int AS labeled,
              COUNT(*) FILTER (WHERE outcome_4h = 'correct')::int AS correct,
              COUNT(*) FILTER (WHERE outcome_4h = 'wrong')::int AS wrong,
              COUNT(*) FILTER (WHERE outcome_4h = 'neutral')::int AS neutral,
              ROUND(AVG(${SIGNED_4H}) FILTER (WHERE ${saneMoveSql("pct_move_4h")}), 3) AS avg_signed_move
         FROM ai_signal_log
        WHERE workspace_id = $1 AND outcome_4h IN ('correct', 'wrong', 'neutral') AND outcome_4h_measured_at >= $2::timestamptz
          AND UPPER(trade_bias) IN ('LONG', 'SHORT')
        GROUP BY GROUPING SETS ((), (UPPER(trade_bias)))`,
      [WS, LABELLER_FIX_AT],
    ).catch(() => null);
    const bySourceRows = await q<DirectionalCounts & { source: string; total: number; pending: number; first_at: string | null }>(
      `SELECT workspace_id AS source,
              COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE outcome = 'pending')::int AS pending,
              COUNT(*) FILTER (WHERE outcome IN ('correct', 'wrong', 'neutral') AND outcome_measured_at >= $2::timestamptz)::int AS labeled,
              COUNT(*) FILTER (WHERE outcome = 'correct' AND outcome_measured_at >= $2::timestamptz)::int AS correct,
              COUNT(*) FILTER (WHERE outcome = 'wrong' AND outcome_measured_at >= $2::timestamptz)::int AS wrong,
              COUNT(*) FILTER (WHERE outcome = 'neutral' AND outcome_measured_at >= $2::timestamptz)::int AS neutral,
              ROUND(AVG(${SIGNED_24H}) FILTER (WHERE outcome IN ('correct', 'wrong', 'neutral') AND outcome_measured_at >= $2::timestamptz AND ${saneMoveSql()}), 3) AS avg_signed_move,
              MIN(signal_at) AS first_at
         FROM ai_signal_log
        WHERE workspace_id = $1 OR workspace_id LIKE 'admin-call:%'
        GROUP BY workspace_id
        ORDER BY total DESC`,
      [WS, LABELLER_FIX_AT],
    );
    const dirOf = (d: string | null) => (d === "LONG" || d === "SHORT" ? d : null);

    return NextResponse.json({
      overall: {
        totalSignals: o.total_signals ?? 0,
        labeled,
        pending: o.pending ?? 0,
        correct: o.correct ?? 0,
        wrong: o.wrong ?? 0,
        neutral: o.neutral ?? 0,
        expired: o.expired ?? 0,
        accuracyRate: accuracyRate !== null ? Math.round(accuracyRate * 10) / 10 : null,
        accuracyLabel: "Hit rate incl. neutral/expired (correct ÷ all labelled)",
        /** correct ÷ (correct + wrong): neutral/expired left out. */
        directionalHitRate: pct(o.correct ?? 0, directional),
        /** Labels made by the old labeller (before #167), included in the all-time figures above. */
        labeledOldMethod: o.labeled_old_method ?? 0,
        /** Mean move in the call's direction on correct calls, % (signed; a correct SHORT counts positive). */
        avgMoveCorrect: o.avg_move_correct ?? null,
        /** Mean adverse move on wrong calls, % (positive number). */
        avgMoveWrong: o.avg_move_wrong ?? null,
        avgConfluence: o.avg_confluence ?? null,
      },
      sinceFix: {
        since: LABELLER_FIX_AT,
        note: "Labels made by the fixed labeller (#167, from 23:52 AEST Sat 26 Sep 2026). All-time figures include older labels made by the old labeller (old method).",
        labeled: labeledSinceFix,
        correct: o.correct_since_fix ?? 0,
        wrong: o.wrong_since_fix ?? 0,
        neutral: o.neutral_since_fix ?? 0,
        accuracyRate: pct(o.correct_since_fix ?? 0, labeledSinceFix),
        directionalHitRate: pct(o.correct_since_fix ?? 0, directionalSinceFix),
        /** Mean 24h move in the call's direction over correct + wrong + neutral labels, %. */
        avgSignedMovePct: o.avg_signed_move_since_fix != null ? Number(o.avg_signed_move_since_fix) : null,
        byDirection: breakdown.filter((r) => dirOf(r.dir)).map((r) => ({ direction: r.dir, ...summarizeDirectional(r) })),
        byAsset: breakdown.filter((r) => !dirOf(r.dir) && r.asset).map((r) => ({ asset: r.asset, ...summarizeDirectional(r) })),
        horizon4h: horizon4h
          ? {
              overall: summarizeDirectional(horizon4h.find((r) => !dirOf(r.dir)) ?? {}),
              byDirection: horizon4h.filter((r) => dirOf(r.dir)).map((r) => ({ direction: r.dir, ...summarizeDirectional(r) })),
            }
          : null,
      },
      /**
       * Per source since the fix: operator-terminal = shared-scan pipelines (every run since fix/admin-call-logging);
       * admin-call:<page> = calls shown by that page (Priority Desk, Morning Brief, research alerts, Jarvis, edge
       * packets, ARCA). The same underlying setup can appear in several sources.
       */
      bySource: bySourceRows.map((r) => ({
        source: r.source,
        total: Number(r.total ?? 0),
        pending: Number(r.pending ?? 0),
        firstAt: r.first_at ?? null,
        ...summarizeDirectional(r),
      })),
      byRegime: byRegime.map((r: Record<string, unknown>) => ({
        regime: r.regime,
        total: r.total,
        correct: r.correct,
        wrong: r.wrong,
        labeled: r.labeled,
        accuracyRate:
          (r.labeled as number) > 0
            ? Math.round(((r.correct as number) / (r.labeled as number)) * 1000) / 10
            : null,
        avgScore: r.avg_score,
        correctSinceFix: r.correct_since_fix ?? 0,
        wrongSinceFix: r.wrong_since_fix ?? 0,
        labeledSinceFix: r.labeled_since_fix ?? 0,
        directionalHitRateSinceFix: pct(Number(r.correct_since_fix ?? 0), Number(r.correct_since_fix ?? 0) + Number(r.wrong_since_fix ?? 0)),
      })),
      byVerdict: byVerdict.map((r: Record<string, unknown>) => ({
        verdict: r.verdict,
        total: r.total,
        correct: r.correct,
        wrong: r.wrong,
        labeled: r.labeled,
        accuracyRate:
          (r.labeled as number) > 0
            ? Math.round(((r.correct as number) / (r.labeled as number)) * 1000) / 10
            : null,
        correctSinceFix: r.correct_since_fix ?? 0,
        wrongSinceFix: r.wrong_since_fix ?? 0,
        labeledSinceFix: r.labeled_since_fix ?? 0,
        directionalHitRateSinceFix: pct(Number(r.correct_since_fix ?? 0), Number(r.correct_since_fix ?? 0) + Number(r.wrong_since_fix ?? 0)),
      })),
      trend: {
        recent7d: {
          total: r7.total ?? 0,
          correct: r7.correct ?? 0,
          labeled: r7.labeled ?? 0,
          accuracyRate:
            (r7.labeled ?? 0) > 0
              ? Math.round(((r7.correct ?? 0) / r7.labeled) * 1000) / 10
              : null,
        },
        prior30d: {
          total: p30.total ?? 0,
          correct: p30.correct ?? 0,
          labeled: p30.labeled ?? 0,
          accuracyRate:
            (p30.labeled ?? 0) > 0
              ? Math.round(((p30.correct ?? 0) / p30.labeled) * 1000) / 10
              : null,
        },
      },
      truth: wrapTruth({}, { source: 'admin:postgres', freshness: 'real-time' }),
    });
  } catch (err: unknown) {
    console.error("[admin:signals:stats] Error:", err);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
