/**
 * lib/edge/matrix.ts — Edge Matrix builder.
 *
 * Aggregates the edge_ledger_setups + edge_ledger_outcomes tables into
 * per-dimension performance cells stored in edge_matrix_cells.
 *
 * Dimensions:
 *   - playbook
 *   - regime
 *   - sector
 *   - iv_bucket   ('iv<30', 'iv30-70', 'iv>70')
 *   - catalyst_proximity ('cat-0-3d', 'cat-4-10d', 'cat-far')
 *
 * Each cell carries TAKEN performance and COUNTERFACTUAL (skipped)
 * performance, plus a sample-size honesty band.
 *
 * Run nightly. Reads-after-writes are atomic per (workspace, dimension, cell_key)
 * via ON CONFLICT.
 */

import { q } from '@/lib/db';

type Dimension = 'playbook' | 'regime' | 'sector' | 'iv_bucket' | 'catalyst_proximity' | 'setup_type';

interface AggRow {
  cell_key: string;
  setups_total: number;
  setups_taken: number;
  setups_skipped: number;
  win_rate: number | null;
  avg_r_5d: number | null;
  avg_r_20d: number | null;
  hit_target_rate: number | null;
  hit_stop_rate: number | null;
  cf_win_rate: number | null;
  cf_avg_r_5d: number | null;
  cf_avg_r_20d: number | null;
  min_sample: number;
}

function bandOf(n: number): 'tight' | 'wide' | 'insufficient' {
  if (n >= 30) return 'tight';
  if (n >= 8) return 'wide';
  return 'insufficient';
}

function ivBucketExpr(): string {
  // SQL CASE for IV bucket
  return `CASE
            WHEN iv_percentile IS NULL THEN 'iv-unknown'
            WHEN iv_percentile < 30 THEN 'iv<30'
            WHEN iv_percentile > 70 THEN 'iv>70'
            ELSE 'iv30-70'
          END`;
}

function catBucketExpr(): string {
  return `CASE
            WHEN catalyst_proximity_days IS NULL THEN 'cat-unknown'
            WHEN catalyst_proximity_days BETWEEN 0 AND 3 THEN 'cat-0-3d'
            WHEN catalyst_proximity_days BETWEEN 4 AND 10 THEN 'cat-4-10d'
            ELSE 'cat-far'
          END`;
}

function cellExpr(dim: Dimension): string {
  switch (dim) {
    case 'playbook': return `COALESCE(playbook, 'unspecified')`;
    case 'regime': return `COALESCE(regime, 'unknown')`;
    case 'sector': return `COALESCE(sector, 'unknown')`;
    case 'setup_type': return `COALESCE(setup_type, 'unspecified')`;
    case 'iv_bucket': return ivBucketExpr();
    case 'catalyst_proximity': return catBucketExpr();
  }
}

async function aggregateDimension(workspaceId: string, dim: Dimension): Promise<AggRow[]> {
  const cell = cellExpr(dim);
  // Single SQL aggregating taken + skipped (counterfactual) outcomes side by side
  const rows = await q<{
    cell_key: string;
    setups_total: string; setups_taken: string; setups_skipped: string;
    win_rate: string | null; avg_r_5d: string | null; avg_r_20d: string | null;
    hit_target_rate: string | null; hit_stop_rate: string | null;
    cf_win_rate: string | null; cf_avg_r_5d: string | null; cf_avg_r_20d: string | null;
    min_sample: string;
  }>(
    `WITH base AS (
       SELECT ${cell} AS cell_key, s.status,
              o.realised_r_5d, o.realised_r_20d,
              o.hit_target_5d, o.hit_stop_5d
         FROM edge_ledger_setups s
         LEFT JOIN edge_ledger_outcomes o ON o.setup_id = s.id
        WHERE s.workspace_id = $1
     )
     SELECT cell_key,
            COUNT(*)::text AS setups_total,
            COUNT(*) FILTER (WHERE status = 'taken')::text AS setups_taken,
            COUNT(*) FILTER (WHERE status = 'skipped')::text AS setups_skipped,
            AVG(CASE WHEN status = 'taken' AND realised_r_5d IS NOT NULL THEN (CASE WHEN realised_r_5d > 0 THEN 1.0 ELSE 0.0 END) END)::text AS win_rate,
            AVG(CASE WHEN status = 'taken' THEN realised_r_5d END)::text AS avg_r_5d,
            AVG(CASE WHEN status = 'taken' THEN realised_r_20d END)::text AS avg_r_20d,
            AVG(CASE WHEN status = 'taken' AND hit_target_5d IS NOT NULL THEN (CASE WHEN hit_target_5d THEN 1.0 ELSE 0.0 END) END)::text AS hit_target_rate,
            AVG(CASE WHEN status = 'taken' AND hit_stop_5d IS NOT NULL THEN (CASE WHEN hit_stop_5d THEN 1.0 ELSE 0.0 END) END)::text AS hit_stop_rate,
            AVG(CASE WHEN status = 'skipped' AND realised_r_5d IS NOT NULL THEN (CASE WHEN realised_r_5d > 0 THEN 1.0 ELSE 0.0 END) END)::text AS cf_win_rate,
            AVG(CASE WHEN status = 'skipped' THEN realised_r_5d END)::text AS cf_avg_r_5d,
            AVG(CASE WHEN status = 'skipped' THEN realised_r_20d END)::text AS cf_avg_r_20d,
            COUNT(*) FILTER (WHERE realised_r_5d IS NOT NULL)::text AS min_sample
       FROM base
      GROUP BY cell_key`,
    [workspaceId],
  );
  const toNum = (v: string | null) => v === null ? null : Number(v);
  return rows.map((r) => ({
    cell_key: r.cell_key,
    setups_total: Number(r.setups_total),
    setups_taken: Number(r.setups_taken),
    setups_skipped: Number(r.setups_skipped),
    win_rate: toNum(r.win_rate),
    avg_r_5d: toNum(r.avg_r_5d),
    avg_r_20d: toNum(r.avg_r_20d),
    hit_target_rate: toNum(r.hit_target_rate),
    hit_stop_rate: toNum(r.hit_stop_rate),
    cf_win_rate: toNum(r.cf_win_rate),
    cf_avg_r_5d: toNum(r.cf_avg_r_5d),
    cf_avg_r_20d: toNum(r.cf_avg_r_20d),
    min_sample: Number(r.min_sample),
  }));
}

export async function rebuildMatrixForWorkspace(workspaceId: string): Promise<{ dim: Dimension; cells: number }[]> {
  const dims: Dimension[] = ['playbook', 'regime', 'sector', 'iv_bucket', 'catalyst_proximity', 'setup_type'];
  const out: { dim: Dimension; cells: number }[] = [];
  for (const dim of dims) {
    const rows = await aggregateDimension(workspaceId, dim);
    for (const r of rows) {
      await q(
        `INSERT INTO edge_matrix_cells
           (workspace_id, dimension, cell_key,
            setups_total, setups_taken, setups_skipped,
            win_rate, avg_r_5d, avg_r_20d, hit_target_rate, hit_stop_rate,
            cf_win_rate, cf_avg_r_5d, cf_avg_r_20d,
            min_sample, confidence_band, rebuilt_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
           ON CONFLICT (workspace_id, dimension, cell_key) DO UPDATE
             SET setups_total = EXCLUDED.setups_total,
                 setups_taken = EXCLUDED.setups_taken,
                 setups_skipped = EXCLUDED.setups_skipped,
                 win_rate = EXCLUDED.win_rate,
                 avg_r_5d = EXCLUDED.avg_r_5d,
                 avg_r_20d = EXCLUDED.avg_r_20d,
                 hit_target_rate = EXCLUDED.hit_target_rate,
                 hit_stop_rate = EXCLUDED.hit_stop_rate,
                 cf_win_rate = EXCLUDED.cf_win_rate,
                 cf_avg_r_5d = EXCLUDED.cf_avg_r_5d,
                 cf_avg_r_20d = EXCLUDED.cf_avg_r_20d,
                 min_sample = EXCLUDED.min_sample,
                 confidence_band = EXCLUDED.confidence_band,
                 rebuilt_at = NOW()`,
        [
          workspaceId, dim, r.cell_key,
          r.setups_total, r.setups_taken, r.setups_skipped,
          r.win_rate, r.avg_r_5d, r.avg_r_20d, r.hit_target_rate, r.hit_stop_rate,
          r.cf_win_rate, r.cf_avg_r_5d, r.cf_avg_r_20d,
          r.min_sample, bandOf(r.min_sample),
        ],
      );
    }
    out.push({ dim, cells: rows.length });
  }
  return out;
}

export interface MatrixCell {
  dimension: Dimension;
  cellKey: string;
  setupsTotal: number;
  setupsTaken: number;
  setupsSkipped: number;
  winRate: number | null;
  avgR5d: number | null;
  avgR20d: number | null;
  hitTargetRate: number | null;
  hitStopRate: number | null;
  cfWinRate: number | null;
  cfAvgR5d: number | null;
  cfAvgR20d: number | null;
  minSample: number;
  confidenceBand: 'tight' | 'wide' | 'insufficient';
  rebuiltAt: string;
}

export async function readMatrix(opts: { workspaceId: string; dimension?: Dimension }): Promise<MatrixCell[]> {
  const where: string[] = ['workspace_id = $1'];
  const params: unknown[] = [opts.workspaceId];
  let p = 2;
  if (opts.dimension) { where.push(`dimension = $${p++}`); params.push(opts.dimension); }
  const rows = await q<{
    dimension: Dimension; cell_key: string;
    setups_total: number; setups_taken: number; setups_skipped: number;
    win_rate: string | null; avg_r_5d: string | null; avg_r_20d: string | null;
    hit_target_rate: string | null; hit_stop_rate: string | null;
    cf_win_rate: string | null; cf_avg_r_5d: string | null; cf_avg_r_20d: string | null;
    min_sample: number; confidence_band: 'tight' | 'wide' | 'insufficient'; rebuilt_at: Date;
  }>(
    `SELECT * FROM edge_matrix_cells WHERE ${where.join(' AND ')} ORDER BY dimension, setups_total DESC`,
    params,
  );
  const toNum = (v: string | null) => v === null ? null : Number(v);
  return rows.map((r) => ({
    dimension: r.dimension,
    cellKey: r.cell_key,
    setupsTotal: Number(r.setups_total),
    setupsTaken: Number(r.setups_taken),
    setupsSkipped: Number(r.setups_skipped),
    winRate: toNum(r.win_rate),
    avgR5d: toNum(r.avg_r_5d),
    avgR20d: toNum(r.avg_r_20d),
    hitTargetRate: toNum(r.hit_target_rate),
    hitStopRate: toNum(r.hit_stop_rate),
    cfWinRate: toNum(r.cf_win_rate),
    cfAvgR5d: toNum(r.cf_avg_r_5d),
    cfAvgR20d: toNum(r.cf_avg_r_20d),
    minSample: Number(r.min_sample),
    confidenceBand: r.confidence_band,
    rebuiltAt: r.rebuilt_at.toISOString(),
  }));
}
