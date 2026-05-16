/**
 * lib/edge/outcomeLabeller.ts — nightly job that labels outcomes for
 * unlabelled / partially-labelled setups by reading forward bars.
 *
 * For each pending setup row:
 *   1. Pull forward bars from ohlcv_bars (after surfaced_at)
 *   2. Compute MFE/MAE at 1d/5d/20d windows in R-multiples (using stop_price as R baseline)
 *   3. Determine hit_target / hit_stop within each window
 *   4. Compute realised R when window closes (price at window end vs entry)
 *
 * Honest rules:
 *   - If we have fewer than required bars, status stays 'partial' or 'pending'
 *   - We never extrapolate; missing bars = missing label
 *   - Stop and target come from the setup row (the system's suggested levels)
 */

import { q } from '@/lib/db';
import { getBars } from '@/lib/marketData';

export interface LabelResult {
  setupId: number;
  status: 'pending' | 'partial' | 'complete';
  mfe1d: number | null; mae1d: number | null;
  mfe5d: number | null; mae5d: number | null;
  mfe20d: number | null; mae20d: number | null;
  hitTarget5d: boolean | null; hitStop5d: boolean | null;
  hitTarget20d: boolean | null; hitStop20d: boolean | null;
  tttDays: number | null; ttsDays: number | null;
  realisedR5d: number | null; realisedR20d: number | null;
  barsUsed: number;
}

interface BarLite { ts: number; high: number; low: number; close: number; }

function pickForwardBars(bars: BarLite[], sinceTs: number): BarLite[] {
  // Daily bars: keep bars STRICTLY after the setup day
  return bars.filter((b) => b.ts > sinceTs);
}

function rMultiple(price: number, entry: number, risk: number, dir: 'long' | 'short'): number {
  if (risk <= 0) return 0;
  const diff = dir === 'long' ? price - entry : entry - price;
  return diff / risk;
}

function computeWindow(
  fwd: BarLite[],
  windowBars: number,
  entry: number,
  risk: number,
  target: number | null,
  stop: number | null,
  dir: 'long' | 'short',
): { mfe: number | null; mae: number | null; hitT: boolean | null; hitS: boolean | null; ttt: number | null; tts: number | null; realised: number | null; status: 'pending' | 'partial' | 'complete' } {
  if (fwd.length === 0) return { mfe: null, mae: null, hitT: null, hitS: null, ttt: null, tts: null, realised: null, status: 'pending' };
  const slice = fwd.slice(0, windowBars);
  let mfe = -Infinity, mae = Infinity;
  let ttt: number | null = null, tts: number | null = null;
  let hitT: boolean | null = target === null ? null : false;
  let hitS: boolean | null = stop === null ? null : false;
  for (let i = 0; i < slice.length; i++) {
    const b = slice[i];
    const hiR = rMultiple(b.high, entry, risk, dir);
    const loR = rMultiple(b.low, entry, risk, dir);
    const bestR = dir === 'long' ? hiR : -loR;     // for short, low = best
    const worstR = dir === 'long' ? loR : -hiR;    // for short, high = worst
    mfe = Math.max(mfe, bestR);
    mae = Math.min(mae, worstR);
    if (target !== null && hitT === false) {
      const tHit = dir === 'long' ? b.high >= target : b.low <= target;
      if (tHit) { hitT = true; ttt = i + 1; }
    }
    if (stop !== null && hitS === false) {
      const sHit = dir === 'long' ? b.low <= stop : b.high >= stop;
      if (sHit) { hitS = true; tts = i + 1; }
    }
  }
  const lastClose = slice[slice.length - 1].close;
  const realised = rMultiple(lastClose, entry, risk, dir);
  const status: 'pending' | 'partial' | 'complete' = slice.length >= windowBars ? 'complete' : 'partial';
  return {
    mfe: Number.isFinite(mfe) ? mfe : null,
    mae: Number.isFinite(mae) ? mae : null,
    hitT, hitS, ttt, tts,
    realised,
    status,
  };
}

export async function labelOutcome(setupId: number): Promise<LabelResult | null> {
  const setupRows = await q<{
    id: number; workspace_id: string; symbol: string; direction: 'long' | 'short';
    entry_price: string | null; stop_price: string | null; target_price: string | null;
    risk_per_share: string | null; surfaced_at: Date;
  }>(`SELECT id, workspace_id, symbol, direction, entry_price, stop_price, target_price, risk_per_share, surfaced_at
       FROM edge_ledger_setups WHERE id = $1`, [setupId]);
  if (setupRows.length === 0) return null;
  const s = setupRows[0];
  const entry = s.entry_price === null ? null : Number(s.entry_price);
  const stop = s.stop_price === null ? null : Number(s.stop_price);
  const target = s.target_price === null ? null : Number(s.target_price);
  const risk = s.risk_per_share === null ? null : Number(s.risk_per_share);
  if (entry === null || risk === null || risk <= 0) {
    // Can't label without entry + risk
    return null;
  }

  const barsEnv = await getBars(s.symbol, 'daily');
  if (!barsEnv.data || barsEnv.data.length === 0) return null;
  const fwd: BarLite[] = pickForwardBars(barsEnv.data.map((b) => ({ ts: b.ts, high: b.high, low: b.low, close: b.close })), s.surfaced_at.getTime());

  const w1 = computeWindow(fwd, 1, entry, risk, target, stop, s.direction);
  const w5 = computeWindow(fwd, 5, entry, risk, target, stop, s.direction);
  const w20 = computeWindow(fwd, 20, entry, risk, target, stop, s.direction);
  const overall: 'pending' | 'partial' | 'complete' =
    w20.status === 'complete' ? 'complete' :
    w5.status === 'complete' ? 'partial' :
    fwd.length > 0 ? 'partial' : 'pending';

  return {
    setupId, status: overall,
    mfe1d: w1.mfe, mae1d: w1.mae,
    mfe5d: w5.mfe, mae5d: w5.mae,
    mfe20d: w20.mfe, mae20d: w20.mae,
    hitTarget5d: w5.hitT, hitStop5d: w5.hitS,
    hitTarget20d: w20.hitT, hitStop20d: w20.hitS,
    tttDays: w20.ttt ?? w5.ttt ?? null,
    ttsDays: w20.tts ?? w5.tts ?? null,
    realisedR5d: w5.realised,
    realisedR20d: w20.realised,
    barsUsed: Math.min(fwd.length, 20),
  };
}

export async function persistOutcome(workspaceId: string, label: LabelResult): Promise<void> {
  await q(
    `INSERT INTO edge_ledger_outcomes
       (setup_id, workspace_id, mfe_1d, mae_1d, mfe_5d, mae_5d, mfe_20d, mae_20d,
        hit_target_5d, hit_stop_5d, hit_target_20d, hit_stop_20d,
        ttt_days, tts_days, realised_r_5d, realised_r_20d,
        bars_used, outcome_status, labelled_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NOW())
       ON CONFLICT (setup_id) DO UPDATE
         SET mfe_1d = EXCLUDED.mfe_1d, mae_1d = EXCLUDED.mae_1d,
             mfe_5d = EXCLUDED.mfe_5d, mae_5d = EXCLUDED.mae_5d,
             mfe_20d = EXCLUDED.mfe_20d, mae_20d = EXCLUDED.mae_20d,
             hit_target_5d = EXCLUDED.hit_target_5d, hit_stop_5d = EXCLUDED.hit_stop_5d,
             hit_target_20d = EXCLUDED.hit_target_20d, hit_stop_20d = EXCLUDED.hit_stop_20d,
             ttt_days = EXCLUDED.ttt_days, tts_days = EXCLUDED.tts_days,
             realised_r_5d = EXCLUDED.realised_r_5d, realised_r_20d = EXCLUDED.realised_r_20d,
             bars_used = EXCLUDED.bars_used, outcome_status = EXCLUDED.outcome_status,
             labelled_at = NOW()`,
    [
      label.setupId, workspaceId,
      label.mfe1d, label.mae1d, label.mfe5d, label.mae5d, label.mfe20d, label.mae20d,
      label.hitTarget5d, label.hitStop5d, label.hitTarget20d, label.hitStop20d,
      label.tttDays, label.ttsDays, label.realisedR5d, label.realisedR20d,
      label.barsUsed, label.status,
    ],
  );
}

/** Label every pending / partial outcome older than 1 day. */
export async function labelAllPending(opts: { limit?: number } = {}): Promise<{ labelled: number; complete: number; partial: number; pending: number }> {
  const setups = await q<{ id: number; workspace_id: string }>(
    `SELECT s.id, s.workspace_id
       FROM edge_ledger_setups s
       LEFT JOIN edge_ledger_outcomes o ON o.setup_id = s.id
      WHERE (o.outcome_status IS NULL OR o.outcome_status IN ('pending','partial'))
        AND s.surfaced_at <= NOW() - INTERVAL '1 day'
      ORDER BY s.surfaced_at ASC
      LIMIT $1`,
    [opts.limit ?? 500],
  );
  let complete = 0, partial = 0, pending = 0;
  for (const s of setups) {
    const label = await labelOutcome(s.id);
    if (!label) { pending++; continue; }
    await persistOutcome(s.workspace_id, label);
    if (label.status === 'complete') complete++;
    else if (label.status === 'partial') partial++;
    else pending++;
  }
  return { labelled: setups.length, complete, partial, pending };
}
