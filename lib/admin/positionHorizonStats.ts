/**
 * 6-week / 12-week outcome stats by setup type, for Signal Outcomes and Backtest Lab (migration 105 columns,
 * filled by lib/outcomes/positionHorizonLabeller.ts).
 *
 * Rows: shared-scan signals (workspace 'operator-terminal', setup = decision_trace.playbook) and admin page calls
 * (workspaces 'admin-call:<page>', setup = the page), all time: a 12-week result needs a call at least 12 weeks old.
 * Only LONG/SHORT rows with an entry price and a supported asset count (the ones the labeller can measure).
 *
 * Per setup and horizon:
 *   win rate   = correct ÷ (correct + wrong) on the horizon close (1% threshold; neutral left out)
 *   avg return = mean close move in the call's direction, %
 *   avg R      = mean bracket result in R (rows with a usable stop only; n shown)
 *   pending    = not measured yet: `waiting` (horizon not reached) + `due` (reached, not labelled yet)
 * Below MIN_HORIZON_SAMPLE measured calls a figure reads "not enough data".
 */
import { q } from "@/lib/db";
import { POSITION_HORIZONS, POSITION_HORIZON_DAYS, type PositionHorizon } from "@/lib/outcomes/positionHorizon";
import { POSITION_MIGRATION_FILE, detectPositionHorizons } from "@/lib/outcomes/positionHorizonLabeller";

/** Fewer measured calls than this: win rate / averages are shown as "not enough data". */
export const MIN_HORIZON_SAMPLE = 10;
/** Outlier guard for the averages: |move| <= 300 % over 6-12 weeks. */
const SANE_MOVE_PCT = 300;

/** SQL: setup type of an ai_signal_log row (same grouping as Backtest Lab). */
export const SETUP_TYPE_SQL = `CASE WHEN workspace_id LIKE 'admin-call:%' THEN UPPER(substr(workspace_id, 12))
              ELSE UPPER(COALESCE(decision_trace->>'playbook', decision_trace->>'setup', 'UNKNOWN')) END`;

const MEASURABLE_SQL = `UPPER(TRIM(COALESCE(trade_bias, ''))) IN ('LONG','SHORT')
         AND price_at_signal IS NOT NULL AND price_at_signal > 0
         AND LOWER(TRIM(asset_type)) IN ('equity','equities','stock','stocks','etf','crypto')`;

export interface HorizonAggRow {
  setup: string | null;
  measured?: number | string | null;
  correct?: number | string | null;
  wrong?: number | string | null;
  neutral?: number | string | null;
  no_data?: number | string | null;
  waiting?: number | string | null;
  due?: number | string | null;
  avg_signed_move?: number | string | null;
  avg_r?: number | string | null;
  r_count?: number | string | null;
  target_first?: number | string | null;
  stop_first?: number | string | null;
  neither?: number | string | null;
  avg_mfe?: number | string | null;
  avg_mae?: number | string | null;
}

export interface HorizonSummary {
  setup: string;
  measured: number;
  correct: number;
  wrong: number;
  neutral: number;
  noData: number;
  /** Not measured yet: waiting + due. */
  pending: number;
  /** Horizon not reached yet. */
  waiting: number;
  /** Horizon reached, not labelled yet (the labeller runs every 6 h). */
  due: number;
  enoughData: boolean;
  /** correct ÷ (correct + wrong), %; null when not enough data. */
  winRate: number | null;
  /** Mean close move in the call's direction, %; null when not enough data. */
  avgReturnPct: number | null;
  /** Mean bracket R over rows with a usable stop; null when fewer than MIN_HORIZON_SAMPLE such rows. */
  avgR: number | null;
  rCount: number;
  targetFirst: number;
  stopFirst: number;
  neither: number;
  avgMfePct: number | null;
  avgMaePct: number | null;
}

export interface HorizonBlock {
  horizon: PositionHorizon;
  days: number;
  overall: HorizonSummary;
  bySetup: HorizonSummary[];
}

export interface PositionHorizonStats {
  available: boolean;
  minSample: number;
  note: string;
  horizons: HorizonBlock[];
  error?: string;
}

const n = (v: unknown) => {
  const x = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(x) ? 0 : x;
};
const numOrNull = (v: unknown, dp: number) => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  if (!Number.isFinite(x)) return null;
  const f = 10 ** dp;
  return Math.round(x * f) / f;
};

export function summarizeHorizon(r: HorizonAggRow, minSample = MIN_HORIZON_SAMPLE): HorizonSummary {
  const measured = n(r.measured);
  const correct = n(r.correct);
  const wrong = n(r.wrong);
  const waiting = n(r.waiting);
  const due = n(r.due);
  const rCount = n(r.r_count);
  const enoughData = measured >= minSample;
  const decided = correct + wrong;
  return {
    setup: r.setup ?? "ALL",
    measured,
    correct,
    wrong,
    neutral: n(r.neutral),
    noData: n(r.no_data),
    pending: waiting + due,
    waiting,
    due,
    enoughData,
    winRate: enoughData && decided > 0 ? Math.round((correct / decided) * 1000) / 10 : null,
    avgReturnPct: enoughData ? numOrNull(r.avg_signed_move, 2) : null,
    avgR: rCount >= minSample ? numOrNull(r.avg_r, 2) : null,
    rCount,
    targetFirst: n(r.target_first),
    stopFirst: n(r.stop_first),
    neither: n(r.neither),
    avgMfePct: enoughData ? numOrNull(r.avg_mfe, 2) : null,
    avgMaePct: enoughData ? numOrNull(r.avg_mae, 2) : null,
  };
}

export function horizonStatsSql(h: PositionHorizon): string {
  const signed = `(CASE WHEN UPPER(trade_bias) = 'SHORT' THEN -pct_move_${h} ELSE pct_move_${h} END)`;
  const done = `outcome_${h} IN ('correct','wrong','neutral')`;
  return `
      SELECT ${SETUP_TYPE_SQL} AS setup,
             COUNT(*) FILTER (WHERE ${done})::int AS measured,
             COUNT(*) FILTER (WHERE outcome_${h} = 'correct')::int AS correct,
             COUNT(*) FILTER (WHERE outcome_${h} = 'wrong')::int AS wrong,
             COUNT(*) FILTER (WHERE outcome_${h} = 'neutral')::int AS neutral,
             COUNT(*) FILTER (WHERE outcome_${h} = 'no_data')::int AS no_data,
             COUNT(*) FILTER (WHERE outcome_${h} IS NULL AND signal_at > NOW() - INTERVAL '${POSITION_HORIZON_DAYS[h]} days')::int AS waiting,
             COUNT(*) FILTER (WHERE outcome_${h} IS NULL AND signal_at <= NOW() - INTERVAL '${POSITION_HORIZON_DAYS[h]} days')::int AS due,
             ROUND(AVG(${signed}) FILTER (WHERE ${done} AND ABS(pct_move_${h}) <= ${SANE_MOVE_PCT})::numeric, 3) AS avg_signed_move,
             ROUND(AVG(r_multiple_${h}) FILTER (WHERE ${done} AND r_multiple_${h} IS NOT NULL)::numeric, 3) AS avg_r,
             COUNT(*) FILTER (WHERE ${done} AND r_multiple_${h} IS NOT NULL)::int AS r_count,
             COUNT(*) FILTER (WHERE ${done} AND first_hit_${h} = 'target')::int AS target_first,
             COUNT(*) FILTER (WHERE ${done} AND first_hit_${h} IN ('stop','both_same_day'))::int AS stop_first,
             COUNT(*) FILTER (WHERE ${done} AND first_hit_${h} = 'neither')::int AS neither,
             ROUND(AVG(mfe_pct_${h}) FILTER (WHERE ${done} AND ABS(mfe_pct_${h}) <= ${SANE_MOVE_PCT})::numeric, 3) AS avg_mfe,
             ROUND(AVG(mae_pct_${h}) FILTER (WHERE ${done} AND ABS(mae_pct_${h}) <= ${SANE_MOVE_PCT})::numeric, 3) AS avg_mae
        FROM ai_signal_log
       WHERE (workspace_id = 'operator-terminal' OR workspace_id LIKE 'admin-call:%')
         AND ${MEASURABLE_SQL}
       GROUP BY GROUPING SETS ((${SETUP_TYPE_SQL}), ())`;
}

export const HORIZON_METHOD_NOTE =
  "6w = 42 and 12w = 84 calendar days after the call, measured on daily bars. Win rate = correct ÷ (correct + wrong) on the close at the horizon (±1% counts as neutral). " +
  "Avg R = stop-or-target result using the stop and first target logged with the call (a day touching both counts as the stop). " +
  "Most logged stops/targets so far are the 15m levels, so R mostly shows how often those tight levels survive 6-12 weeks.";

/** 6w/12w stats; `available: false` (with a note) until migration 105 has been run. Never throws. */
export async function loadPositionHorizonStats(): Promise<PositionHorizonStats> {
  const base = { minSample: MIN_HORIZON_SAMPLE };
  const horizons = await detectPositionHorizons();
  if (!horizons.length) {
    return { ...base, available: false, horizons: [], note: `6-week / 12-week tracking starts once ${POSITION_MIGRATION_FILE} has been run.` };
  }
  try {
    const blocks: HorizonBlock[] = [];
    for (const h of POSITION_HORIZONS.filter((x) => horizons.includes(x))) {
      const rows = await q<HorizonAggRow>(horizonStatsSql(h));
      const overallRow = rows.find((r) => r.setup === null) ?? { setup: null };
      const bySetup = rows
        .filter((r) => r.setup !== null)
        .map((r) => summarizeHorizon(r))
        .sort((a, b) => b.measured - a.measured || b.pending - a.pending || a.setup.localeCompare(b.setup));
      blocks.push({ horizon: h, days: POSITION_HORIZON_DAYS[h], overall: summarizeHorizon(overallRow), bySetup });
    }
    return { ...base, available: true, horizons: blocks, note: HORIZON_METHOD_NOTE };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn(`[position-horizon-stats] ${error}`);
    return { ...base, available: false, horizons: [], note: "6-week / 12-week stats could not be read.", error };
  }
}
