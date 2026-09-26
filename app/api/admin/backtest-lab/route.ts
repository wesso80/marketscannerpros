/**
 * GET /api/admin/backtest-lab — how past admin calls actually did, grouped by setup and market.
 *
 * Source: `ai_signal_log` over the last 90 days —
 *   - workspace 'operator-terminal' (every shared-scan signal; setup = decision_trace.playbook), and
 *   - workspaces 'admin-call:<source>' (the calls each admin page showed: Priority Desk, Morning Brief, research
 *     alerts, Jarvis, edge packets, ARCA; setup = the page, e.g. "PRIORITY-DESK").
 * Wins / losses are fixed-labeller verdicts only (outcome correct / wrong with outcome_measured_at >= LABELLER_FIX_AT),
 * so the hit rate is correct ÷ (correct + wrong). Neutral and the directional 24h move are reported per row.
 *
 * It used to read `signal_outcomes` / `signals_outcomes` (tables that don't exist) and `admin_research_cases`
 * (no outcome column), so it could never show a win or a loss.
 *
 * BOUNDARY: read-only. The Backtest Lab is a research analytics surface; no orders, no execution.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/db";
import { wrapTruth } from "@/lib/admin";
import { LABELLER_FIX_AT, pct1, saneMoveSql, signedMoveSql } from "@/lib/admin/signalStats";

export const runtime = "nodejs";

interface AggRow {
  setup: string;
  market: string;
  cases: number | string;
  avg_score: number | string | null;
  wins: number | string;
  losses: number | string;
  neutral: number | string;
  pending: number | string;
  avg_move_pct: number | string | null;
}

interface SetupBreakdown {
  setup: string;
  market: string;
  cases: number;
  avgScore: number;
  hitRate: number | null;
  wins: number;
  losses: number;
  neutral: number;
  pending: number;
  /** Average 24h move in the call's direction, % (fixed-labeller rows only). */
  avgMovePct: number | null;
}

const SIGNED = signedMoveSql("pct_move_24h");
const SANE = saneMoveSql("pct_move_24h");
const FIXED = "outcome_measured_at >= $1::timestamptz";

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 403 });
  }

  let rows: AggRow[] = [];
  let error: string | null = null;
  try {
    rows = (await q<AggRow>(
      `SELECT
         CASE WHEN workspace_id LIKE 'admin-call:%' THEN UPPER(substr(workspace_id, 12))
              ELSE UPPER(COALESCE(decision_trace->>'playbook', decision_trace->>'setup', 'UNKNOWN')) END AS setup,
         UPPER(COALESCE(asset_type, 'UNKNOWN')) AS market,
         COUNT(*)::int AS cases,
         ROUND(AVG(confluence_score)::numeric, 1) AS avg_score,
         COUNT(*) FILTER (WHERE outcome = 'correct' AND ${FIXED})::int AS wins,
         COUNT(*) FILTER (WHERE outcome = 'wrong' AND ${FIXED})::int AS losses,
         COUNT(*) FILTER (WHERE outcome = 'neutral' AND ${FIXED})::int AS neutral,
         COUNT(*) FILTER (WHERE outcome = 'pending' OR outcome IS NULL)::int AS pending,
         ROUND(AVG(${SIGNED}) FILTER (WHERE outcome IN ('correct', 'wrong', 'neutral') AND ${FIXED} AND ${SANE})::numeric, 3) AS avg_move_pct
       FROM ai_signal_log
       WHERE (workspace_id = 'operator-terminal' OR workspace_id LIKE 'admin-call:%')
         AND signal_at >= NOW() - INTERVAL '90 days'
       GROUP BY 1, 2
       ORDER BY cases DESC
       LIMIT 200`,
      [LABELLER_FIX_AT],
    )) ?? [];
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const breakdown: SetupBreakdown[] = rows.map((r) => {
    const wins = n(r.wins);
    const losses = n(r.losses);
    const avgMove = r.avg_move_pct === null || r.avg_move_pct === undefined ? null : Number(r.avg_move_pct);
    return {
      setup: String(r.setup),
      market: String(r.market),
      cases: n(r.cases),
      avgScore: r.avg_score === null || r.avg_score === undefined ? 0 : Math.round(Number(r.avg_score) * 10) / 10,
      hitRate: pct1(wins, wins + losses),
      wins,
      losses,
      neutral: n(r.neutral),
      pending: n(r.pending),
      avgMovePct: avgMove !== null && Number.isFinite(avgMove) ? avgMove : null,
    };
  });

  const totalCases = breakdown.reduce((s, b) => s + b.cases, 0);
  const totalWins = breakdown.reduce((s, b) => s + b.wins, 0);
  const totalLosses = breakdown.reduce((s, b) => s + b.losses, 0);
  const scoreSum = breakdown.reduce((s, b) => s + b.avgScore * b.cases, 0);
  const overallHitRate = pct1(totalWins, totalWins + totalLosses);
  const overallAvgScore = totalCases > 0 ? Math.round((scoreSum / totalCases) * 10) / 10 : null;

  let note: string | null = null;
  if (error) note = "Backtest Lab is unavailable: the signal log could not be read.";
  else if (totalCases === 0) note = "No logged calls in the last 90 days yet. Every shared-scan run and every admin page call is logged; rows appear after the next scan.";
  else if (totalWins + totalLosses === 0) note = `Calls are logged but none has been measured by the fixed labeller yet (since ${LABELLER_FIX_AT}). The labeller runs every 6 hours.`;

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    totalCases,
    totalWins,
    totalLosses,
    overallHitRate,
    overallAvgScore,
    breakdown,
    since: LABELLER_FIX_AT,
    source: "ai_signal_log (operator-terminal + admin-call:*, last 90 days)",
    error,
    note,
    truth: wrapTruth({ totalCases }, { source: 'admin:postgres', freshness: 'real-time' }),
  });
}
