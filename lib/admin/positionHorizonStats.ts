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
 *
 * Evidence (migration 134): every labelled row is 'verified' (its outcome_<h>_provenance records the current writer and
 * method and agrees with every stored field), 'unknown' (no or foreign provenance: everything labelled before 134) or
 * 'inconsistent' (provenance present but disagreeing). Each horizon carries those counts and two sets of figures:
 * all labelled rows (mixed provenance) and verified rows only. Pending rows count in both.
 */
import { adminErrorText } from "@/lib/admin/errorResponse";
import { q } from "@/lib/db";
import { POSITION_HORIZONS, POSITION_HORIZON_DAYS, type PositionHorizon } from "@/lib/outcomes/positionHorizon";
import { POSITION_MIGRATION_FILE, POSITION_PROVENANCE_METHOD, detectPositionHorizons } from "@/lib/outcomes/positionHorizonLabeller";

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
  return_count?: number | string | null;
  mfe_count?: number | string | null;
  mae_count?: number | string | null;
  avg_signed_move?: number | string | null;
  avg_r?: number | string | null;
  r_count?: number | string | null;
  target_first?: number | string | null;
  stop_first?: number | string | null;
  neither?: number | string | null;
  avg_mfe?: number | string | null;
  avg_mae?: number | string | null;
  prov_verified?: number | string | null;
  prov_unknown?: number | string | null;
  prov_inconsistent?: number | string | null;
}

export type HorizonCohort = "all" | "verified";

/** Labelled rows by evidence status (see the header). */
export interface HorizonEvidence {
  verified: number;
  unknown: number;
  inconsistent: number;
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
  directionalCount: number;
  returnCount: number;
  mfeCount: number;
  maeCount: number;
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

export interface HorizonFigures {
  overall: HorizonSummary;
  bySetup: HorizonSummary[];
}

export interface HorizonBlock extends HorizonFigures {
  horizon: PositionHorizon;
  days: number;
  /** overall / bySetup above are all labelled rows (mixed provenance); this is the same from verified rows only. */
  verifiedOnly: HorizonFigures;
  evidence: HorizonEvidence;
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
  const returnCount = n(r.return_count), mfeCount = n(r.mfe_count), maeCount = n(r.mae_count);
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
    directionalCount: decided, returnCount, mfeCount, maeCount,
    winRate: decided >= minSample && decided > 0 ? Math.round((correct / decided) * 1000) / 10 : null,
    avgReturnPct: returnCount >= minSample ? numOrNull(r.avg_signed_move, 2) : null,
    avgR: rCount >= minSample ? numOrNull(r.avg_r, 2) : null,
    rCount,
    targetFirst: n(r.target_first),
    stopFirst: n(r.stop_first),
    neither: n(r.neither),
    avgMfePct: mfeCount >= minSample ? numOrNull(r.avg_mfe, 2) : null,
    avgMaePct: maeCount >= minSample ? numOrNull(r.avg_mae, 2) : null,
  };
}

/** ISO-8601 timestamp text, checked before casting so a malformed value cannot fail the query. */
const ISO_TS = `'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'`;

/**
 * SQL: 'verified' | 'unknown' | 'inconsistent' for a labelled row (NULL while pending). Mirrors what
 * lib/outcomes/positionHorizonLabeller.ts writes: same writer, method, horizon, direction, outcome, signal time and
 * processing time, plus every measured field (or, for no_data, a complete bar load and the same reason). The column is
 * read through row JSON, so a schema without migration 134 gives 'unknown' instead of a query error.
 */
export function horizonEvidenceSql(h: PositionHorizon): string {
  const p = `(to_jsonb(ai_signal_log)->'outcome_${h}_provenance')`;
  const num = (k: string) => `(CASE WHEN jsonb_typeof(${p}->'${k}') = 'number' THEN (${p}->>'${k}')::numeric END)`;
  const ts = (k: string) => `(CASE WHEN jsonb_typeof(${p}->'${k}') = 'string' AND ${p}->>'${k}' ~ ${ISO_TS} THEN (${p}->>'${k}')::timestamptz END)`;
  const near = (a: string, b: string, tol: string) => `ABS(${a} - ${b}) <= ${tol}`;
  const move = num('pctMove');
  const signedMove = `(CASE WHEN UPPER(TRIM(trade_bias)) = 'SHORT' THEN -${move} ELSE ${move} END)`;
  const common = [
    `${p}->>'direction' = UPPER(TRIM(trade_bias))`,
    `${p}->>'outcome' = outcome_${h}`,
    `${ts('signalAt')} = signal_at`,
    `${ts('processedAt')} = outcome_${h}_measured_at`,
  ].join(' AND ');
  const measured = [
    `outcome_${h} IN ('correct','wrong','neutral')`,
    near(num('entryPrice'), 'price_at_signal', '0.000000011'),
    near(num('exitPrice'), `price_after_${h}`, '0.000000011'),
    `${ts('exitAt')} = price_after_${h}_at`,
    near(move, `pct_move_${h}`, '0.00011'),
    `outcome_${h} = (CASE WHEN ${signedMove} >= 1 THEN 'correct' WHEN ${signedMove} <= -1 THEN 'wrong' ELSE 'neutral' END)`,
    `${p}->>'firstHit' = first_hit_${h}`,
    `(${p}->>'firstHitDay') IS NOT DISTINCT FROM to_char(first_hit_${h}_date, 'YYYY-MM-DD')`,
    `((${p}->'rMultiple' = 'null'::jsonb AND r_multiple_${h} IS NULL) OR ${near(num('rMultiple'), `r_multiple_${h}`, '0.00011')})`,
    `${num('bars')} = bars_${h}`,
  ].join(' AND ');
  const noData = [
    `outcome_${h} = 'no_data'`,
    `${p}->'barLoadComplete' = 'true'::jsonb`,
    `${p}->>'reason' = outcome_${h}_note`,
  ].join(' AND ');
  return `CASE
          WHEN outcome_${h} IS NULL THEN NULL
          WHEN ${p} IS NULL OR jsonb_typeof(${p}) <> 'object'
            OR ${p}->>'writer' IS DISTINCT FROM 'label-ai-outcomes'
            OR ${p}->>'method' IS DISTINCT FROM '${POSITION_PROVENANCE_METHOD}'
            OR ${p}->>'horizon' IS DISTINCT FROM '${h}' THEN 'unknown'
          WHEN COALESCE(${common} AND ((${measured}) OR (${noData})), FALSE) THEN 'verified'
          ELSE 'inconsistent'
        END`;
}

export function horizonStatsSql(h: PositionHorizon, cohort: HorizonCohort = "all"): string {
  const signed = `(CASE WHEN UPPER(TRIM(trade_bias)) = 'SHORT' THEN -pct_move_${h} ELSE pct_move_${h} END)`;
  const done = `outcome_${h} IN ('correct','wrong','neutral')`;
  const validR = `r_multiple_${h} IS NOT NULL AND r_multiple_${h}::text NOT IN ('NaN','Infinity','-Infinity')`;
  return `
      SELECT ${SETUP_TYPE_SQL} AS setup,
             COUNT(*) FILTER (WHERE ${done})::int AS measured,
             COUNT(*) FILTER (WHERE outcome_${h} = 'correct')::int AS correct,
             COUNT(*) FILTER (WHERE outcome_${h} = 'wrong')::int AS wrong,
             COUNT(*) FILTER (WHERE outcome_${h} = 'neutral')::int AS neutral,
             COUNT(*) FILTER (WHERE outcome_${h} = 'no_data')::int AS no_data,
             COUNT(*) FILTER (WHERE outcome_${h} IS NULL AND signal_at > NOW() - INTERVAL '${POSITION_HORIZON_DAYS[h]} days')::int AS waiting,
             COUNT(*) FILTER (WHERE outcome_${h} IS NULL AND signal_at <= NOW() - INTERVAL '${POSITION_HORIZON_DAYS[h]} days')::int AS due,
             COUNT(*) FILTER (WHERE ${done} AND ABS(pct_move_${h}) <= ${SANE_MOVE_PCT})::int AS return_count,
             COUNT(*) FILTER (WHERE ${done} AND ABS(mfe_pct_${h}) <= ${SANE_MOVE_PCT})::int AS mfe_count,
             COUNT(*) FILTER (WHERE ${done} AND ABS(mae_pct_${h}) <= ${SANE_MOVE_PCT})::int AS mae_count,
             ROUND(AVG(${signed}) FILTER (WHERE ${done} AND ABS(pct_move_${h}) <= ${SANE_MOVE_PCT})::numeric, 3) AS avg_signed_move,
             ROUND(AVG(r_multiple_${h}) FILTER (WHERE ${done} AND ${validR})::numeric, 3) AS avg_r,
             COUNT(*) FILTER (WHERE ${done} AND ${validR})::int AS r_count,
             COUNT(*) FILTER (WHERE ${done} AND first_hit_${h} = 'target')::int AS target_first,
             COUNT(*) FILTER (WHERE ${done} AND first_hit_${h} IN ('stop','both_same_day'))::int AS stop_first,
             COUNT(*) FILTER (WHERE ${done} AND first_hit_${h} = 'neither')::int AS neither,
             ROUND(AVG(mfe_pct_${h}) FILTER (WHERE ${done} AND ABS(mfe_pct_${h}) <= ${SANE_MOVE_PCT})::numeric, 3) AS avg_mfe,
             ROUND(AVG(mae_pct_${h}) FILTER (WHERE ${done} AND ABS(mae_pct_${h}) <= ${SANE_MOVE_PCT})::numeric, 3) AS avg_mae,
             COUNT(*) FILTER (WHERE evidence_status = 'verified')::int AS prov_verified,
             COUNT(*) FILTER (WHERE evidence_status = 'unknown')::int AS prov_unknown,
             COUNT(*) FILTER (WHERE evidence_status = 'inconsistent')::int AS prov_inconsistent
        FROM (
          SELECT ai_signal_log.*, ${horizonEvidenceSql(h)} AS evidence_status
            FROM ai_signal_log
           WHERE (workspace_id = 'operator-terminal' OR workspace_id LIKE 'admin-call:%')
             AND ${MEASURABLE_SQL}
        ) rows_with_evidence
       WHERE ${cohort === "verified" ? `(outcome_${h} IS NULL OR evidence_status = 'verified')` : "TRUE"}
       GROUP BY GROUPING SETS ((${SETUP_TYPE_SQL}), ())`;
}

export const HORIZON_METHOD_NOTE =
  "6w = 42 and 12w = 84 calendar days after the call, measured on daily bars. Win rate = correct ÷ (correct + wrong) on the close at the horizon (at least +1% in the call direction is correct; at most -1% is wrong; strictly between is neutral). " +
  "Avg R = stop-or-target result using the stop and first target logged with the call (a day touching both counts as the stop). " +
  "Levels use the timeframe recorded with each call and may be shorter than this horizon. These are simulated daily-bar results, not executed P&L; fees and slippage are not deducted. " +
  "Verified = the result carries a record (written with it, migration 134) whose writer, method and every measured field agree with the stored result. Results labelled before that have no record and count as unknown: the current method description does not prove how they were measured. Verified checks the method, not a trading edge. Each statistic needs its own minimum valid sample.";

function figures(rows: HorizonAggRow[]): HorizonFigures {
  const overallRow = rows.find((r) => r.setup === null) ?? { setup: null };
  const bySetup = rows
    .filter((r) => r.setup !== null)
    .map((r) => summarizeHorizon(r))
    .sort((a, b) => b.measured - a.measured || b.pending - a.pending || a.setup.localeCompare(b.setup));
  return { overall: summarizeHorizon(overallRow), bySetup };
}

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
      const all = await q<HorizonAggRow>(horizonStatsSql(h, "all"));
      const verified = await q<HorizonAggRow>(horizonStatsSql(h, "verified"));
      const overallRow = all.find((r) => r.setup === null) ?? { setup: null };
      blocks.push({
        horizon: h,
        days: POSITION_HORIZON_DAYS[h],
        ...figures(all),
        verifiedOnly: figures(verified),
        evidence: { verified: n(overallRow.prov_verified), unknown: n(overallRow.prov_unknown), inconsistent: n(overallRow.prov_inconsistent) },
      });
    }
    return { ...base, available: true, horizons: blocks, note: HORIZON_METHOD_NOTE };
  } catch (err) {
    const error = adminErrorText(err, "admin:position-horizon-stats");
    return { ...base, available: false, horizons: [], note: "6-week / 12-week stats could not be read.", error };
  }
}
