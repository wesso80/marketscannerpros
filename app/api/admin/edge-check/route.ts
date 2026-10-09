/**
 * GET /api/admin/edge-check — does any group of shared-scan signals show an edge after costs, and does it hold on
 * the later half of its own history?
 *
 * Source: ai_signal_log, workspace 'operator-terminal', fixed-labeller verdicts only (correct / wrong / neutral with
 * outcome_measured_at >= LABELLER_FIX_AT and |24h move| <= 100%). Move = 24h close vs price at signal, signed to the
 * call's direction. Costs are an assumed round trip (lib/admin/edgeCheck). See that module for the verdict rules.
 *
 * Query: ?by=playbook|playbook_direction|direction|asset|regime|timeframe (default playbook_direction), ?days=1..365 (90).
 * BOUNDARY: read-only research telemetry. Verdicts are evidence labels, not trade instructions.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import { storedTruth } from '@/lib/admin/truthLayer';
import { LABELLER_FIX_AT, signedMoveSql } from '@/lib/admin/signalStats';
import { ASSUMED_COST_PCT, MIN_HALF_SAMPLE, MIN_SAMPLE, edgeCheck } from '@/lib/admin/edgeCheck';
import { OUTCOME_MOVE_THRESHOLD_PCT } from '@/lib/outcomes/aiOutcomeLabel';
import { adminErrorText } from '@/lib/admin/errorResponse';

export const runtime = 'nodejs';

/** Whitelisted grouping expressions — never interpolate user input. */
const GROUP_SQL = {
  playbook_direction: `COALESCE(decision_trace->>'playbook', 'Unknown') || ' · ' || UPPER(trade_bias)`,
  playbook: `COALESCE(decision_trace->>'playbook', 'Unknown')`,
  direction: `UPPER(trade_bias)`,
  asset: `LOWER(COALESCE(asset_type, 'unknown'))`,
  regime: `COALESCE(regime, 'unknown')`,
  timeframe: `COALESCE(timeframe, 'unknown')`,
} as const;
type GroupBy = keyof typeof GROUP_SQL;

function parseBy(v: string | null): GroupBy {
  return v && v in GROUP_SQL ? (v as GroupBy) : 'playbook_direction';
}

export async function GET(req: NextRequest) {
  if (!(await requireAdmin(req)).ok) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 403 });
  const by = parseBy(req.nextUrl.searchParams.get('by'));
  const daysRaw = Number(req.nextUrl.searchParams.get('days') ?? 90);
  const days = Number.isFinite(daysRaw) ? Math.min(365, Math.max(1, Math.round(daysRaw))) : 90;

  try {
    const rows = await q<{ grp: string; signal_at: string; outcome: string; signed_move: string | number }>(
      `SELECT ${GROUP_SQL[by]} AS grp, signal_at, outcome, ${signedMoveSql('pct_move_24h')} AS signed_move
         FROM ai_signal_log
        WHERE workspace_id = 'operator-terminal'
          AND UPPER(trade_bias) IN ('LONG', 'SHORT')
          AND outcome IN ('correct', 'wrong', 'neutral')
          AND outcome_measured_at >= $1::timestamptz
          AND pct_move_24h IS NOT NULL AND ABS(pct_move_24h) <= 100
          AND signal_at > NOW() - ($2::int * INTERVAL '1 day')
        ORDER BY signal_at ASC`,
      [LABELLER_FIX_AT, days],
    );
    const result = edgeCheck(rows.map((r) => ({ group: r.grp, signalAt: r.signal_at, outcome: r.outcome, signedMove: Number(r.signed_move) })));
    const latest = rows.length ? rows[rows.length - 1].signal_at : null;
    return NextResponse.json({
      ok: true,
      by,
      days,
      ...result,
      definition: {
        source: "ai_signal_log, shared-scan signals (workspace operator-terminal), LONG/SHORT calls",
        outcome: `24h close vs price at signal in the call's direction; correct >= +${OUTCOME_MOVE_THRESHOLD_PCT}%, wrong <= -${OUTCOME_MOVE_THRESHOLD_PCT}%, else neutral`,
        labelledSince: LABELLER_FIX_AT,
        costs: `Assumed ${ASSUMED_COST_PCT}% round trip per signal (fees + slippage), not measured. No funding, sizing or leverage.`,
        intervals: 'Hit rate: Wilson 95%. Avg move after cost: mean ± 1.96 × standard error. These nominal intervals assume independent observations; overlapping signals can make them too narrow. No adjustment for searching multiple groups.',
        split: 'Each group is split at the most balanced boundary between distinct signal timestamps; equal timestamps stay together and period sizes may differ. Groups can have different cut dates. A single timestamp cannot form two periods. This is a descriptive in-sample comparison, not a held-out test.',
        minSample: MIN_SAMPLE,
        minHalfSample: MIN_HALF_SAMPLE,
        caveats: [
          'In-sample only: the scoring rules were not frozen before these signals, so nothing here is out-of-sample validation.',
          'Signals on the same symbol and day are deduplicated per playbook and direction, but nearby signals still overlap and are not independent.',
          'Overlap sensitivity uses an intercept-only CR1 cluster variance for the signal-weighted after-cost mean, with approximate mean ± 1.96 SE intervals only for 30 or more nonempty blocks. UTC day and fixed seven-day blocks anchored at 1970-01-01 (Thursday) are shown; empty blocks are not observations.',
          'Cluster blocks allow within-block dependence but still assume independent blocks. Returns crossing a block boundary, repeated symbols across blocks and large unequal block sizes can still make intervals unreliable. Thirty blocks is a display guard, not a validity guarantee. Block size was not selected by performance.',
          'The nominal evidence label, group order and Wilson hit-rate interval still use the original independence assumptions; clustered intervals are a separate sensitivity comparison and do not validate those labels.',
          'Displayed moves are rounded to two decimals; evidence labels use unrounded values. A displayed 0% may be slightly positive or negative.',
          'There is no embargo between periods: 24h outcome windows can overlap the split, and daily fallback may measure later than 24h.',
          'Only measured outcomes enter this sample; pending, expired and old-method outcomes are excluded. Recent periods may be less complete.',
          'A 24h move is not a trade result: no stops, targets or holding rules are applied.',
          'Research evidence only. Not a recommendation and not an instruction to trade.',
        ],
      },
      truth: storedTruth({ source: 'ai_signal_log (Postgres)', dataAsOf: latest, staleAfterMinutes: 48 * 60 }),
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    return NextResponse.json({ ok: false, error: adminErrorText(err, '/api/admin/edge-check') }, { status: 500 });
  }
}
