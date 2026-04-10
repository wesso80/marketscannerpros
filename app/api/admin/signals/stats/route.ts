/**
 * GET /api/admin/signals/stats — Aggregate signal accuracy statistics
 *
 * Returns:
 *   - Total signals, labeled count, pending count
 *   - Accuracy rate (correct / labeled)
 *   - Breakdown by regime
 *   - Breakdown by verdict (permission)
 *   - Average pct_move_24h for correct vs wrong
 *   - Recent performance (last 7 days vs prior 30)
 */

import { NextRequest, NextResponse } from "next/server";
import { isAdminSecret, isOperator } from "@/lib/quant/operatorAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";

export const runtime = "nodejs";

const WS = "operator-terminal";

export async function GET(req: NextRequest) {
  const adminAuth = isAdminSecret(req.headers.get("authorization"));
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
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
         ROUND(AVG(pct_move_24h) FILTER (WHERE outcome = 'correct' AND ABS(pct_move_24h) <= 100), 2) AS avg_move_correct,
         ROUND(AVG(ABS(pct_move_24h)) FILTER (WHERE outcome = 'wrong' AND ABS(pct_move_24h) <= 100), 2) AS avg_move_wrong,
         ROUND(AVG(confluence_score), 1) AS avg_confluence
       FROM ai_signal_log
       WHERE workspace_id = $1`,
      [WS],
    );

    const o = overall[0] ?? {};
    const labeled = o.labeled ?? 0;
    const accuracyRate = labeled > 0 ? ((o.correct ?? 0) / labeled) * 100 : null;

    // 2. By regime
    const byRegime = await q(
      `SELECT
         regime,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE outcome = 'correct')::int AS correct,
         COUNT(*) FILTER (WHERE outcome = 'wrong')::int AS wrong,
         COUNT(*) FILTER (WHERE outcome NOT IN ('pending'))::int AS labeled,
         ROUND(AVG(confluence_score), 1) AS avg_score
       FROM ai_signal_log
       WHERE workspace_id = $1
       GROUP BY regime
       ORDER BY total DESC`,
      [WS],
    );

    // 3. By verdict (permission)
    const byVerdict = await q(
      `SELECT
         verdict,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE outcome = 'correct')::int AS correct,
         COUNT(*) FILTER (WHERE outcome = 'wrong')::int AS wrong,
         COUNT(*) FILTER (WHERE outcome NOT IN ('pending'))::int AS labeled
       FROM ai_signal_log
       WHERE workspace_id = $1
       GROUP BY verdict
       ORDER BY total DESC`,
      [WS],
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
        avgMoveCorrect: o.avg_move_correct ?? null,
        avgMoveWrong: o.avg_move_wrong ?? null,
        avgConfluence: o.avg_confluence ?? null,
      },
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
    });
  } catch (err: unknown) {
    console.error("[admin:signals:stats] Error:", err);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
