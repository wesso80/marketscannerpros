import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { timingSafeEqual } from 'crypto';
import { alertCronFailure } from '@/lib/opsAlerting';
import { requireAdmin } from '@/lib/adminAuth';
import { notifyAdmin } from '@/lib/admin/notifyAdmin';
import {
  classifyOutcome,
  horizonPassed,
  normalizeAssetClass,
  normalizeDirection,
  pctMove,
  type OutcomeHorizon,
} from '@/lib/outcomes/aiOutcomeLabel';
import { createHorizonPriceResolver } from '@/lib/outcomes/aiOutcomePrices';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPPORTED_ASSET_SQL = `LOWER(TRIM(asset_type)) IN ('equity','equities','stock','stocks','etf','crypto')`;
const DIRECTIONAL_SQL = `UPPER(TRIM(COALESCE(trade_bias, ''))) IN ('LONG','SHORT')`;
const MAX_ROWS_PER_HORIZON = 200;
const HORIZON_4H_COLUMNS = ['outcome_4h', 'price_after_4h', 'pct_move_4h', 'price_after_4h_at', 'outcome_4h_measured_at'];

type PendingRow = {
  id: number;
  symbol: string;
  asset_type: string | null;
  trade_bias: string | null;
  price_at_signal: string | number | null;
  signal_at: string | Date;
};

type HorizonTally = {
  labeled: number; correct: number; wrong: number; neutral: number;
  skippedNoPrice: number; skippedNoDirection: number; skippedUnsupported: number; skippedNotReady: number; alreadyLabeled: number;
};

function newTally(): HorizonTally {
  return { labeled: 0, correct: 0, wrong: 0, neutral: 0, skippedNoPrice: 0, skippedNoDirection: 0, skippedUnsupported: 0, skippedNotReady: 0, alreadyLabeled: 0 };
}

/** Which optional outcome columns exist (migration 103 adds the 4h set and price_after_24h_at). */
async function detectOutcomeColumns(): Promise<Set<string>> {
  try {
    const rows = await q<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'ai_signal_log'
         AND column_name = ANY($1::text[])`,
      [[...HORIZON_4H_COLUMNS, 'price_after_24h_at']],
    );
    return new Set(rows.map((r) => r.column_name));
  } catch {
    return new Set();
  }
}

function candidateSql(horizon: OutcomeHorizon): string {
  const notLabeled = horizon === '24h' ? `outcome = 'pending'` : `outcome_4h IS NULL`;
  const interval = horizon === '24h' ? '24 hours' : '4 hours';
  return `
      SELECT id, symbol, asset_type, trade_bias, price_at_signal, signal_at
      FROM ai_signal_log
      WHERE ${notLabeled}
        AND signal_at <= NOW() - INTERVAL '${interval}'
        AND signal_at > NOW() - INTERVAL '7 days'
        AND ${DIRECTIONAL_SQL}
        AND price_at_signal IS NOT NULL AND price_at_signal > 0
        AND ${SUPPORTED_ASSET_SQL}
      ORDER BY signal_at ASC
      LIMIT ${MAX_ROWS_PER_HORIZON}`;
}

/**
 * POST /api/cron/label-ai-outcomes
 *
 * Labels ai_signal_log rows per horizon:
 *   - 4h  → outcome_4h / price_after_4h / pct_move_4h (migration 103; skipped until it is applied)
 *   - 24h → outcome / price_after_24h / pct_move_24h (the columns behind the public win rates)
 * A horizon is only labelled once it has passed AND a completed bar at/after it exists. Rows without a usable price,
 * direction (LONG/SHORT), entry price or supported asset type are left for a later run; anything still pending after
 * 7 days is expired. Every UPDATE is guarded on "not yet labelled for this horizon", so overlapping or duplicate runs
 * cannot relabel a row.
 */
export async function POST(req: NextRequest) {
  // Accept cron secret (automated) or admin secret (manual trigger from admin panel)
  const cronSecret = process.env.CRON_SECRET || '';
  const adminSecret = process.env.ADMIN_SECRET || '';
  const headerCron = req.headers.get('x-cron-secret') || '';
  const headerAuth = req.headers.get('authorization')?.replace('Bearer ', '') || '';

  const cronOk = cronSecret && timingSafeCompare(headerCron, cronSecret);
  const adminOk = adminSecret && timingSafeCompare(headerAuth, adminSecret);
  const adminSessionOk = (await requireAdmin(req)).ok;

  if (!cronOk && !adminOk && !adminSessionOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const nowMs = Date.now();
    const columns = await detectOutcomeColumns();
    const has4h = HORIZON_4H_COLUMNS.every((c) => columns.has(c));
    const has24hAt = columns.has('price_after_24h_at');

    // 1. Give up on rows that could not be labelled within 7 days (terminal state for the public stats).
    const expiredRows = await q<{ id: number }>(
      `UPDATE ai_signal_log SET outcome = 'expired', outcome_measured_at = NOW()
       WHERE outcome = 'pending' AND signal_at < NOW() - INTERVAL '7 days'
       RETURNING id`,
    );
    if (expiredRows.length) await markExpiredLifecycle(expiredRows.map((r) => r.id));

    // 2. Rows the labeller can never score (no LONG/SHORT direction) are skipped, not defaulted to LONG. Log them.
    const undirected = await q<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ai_signal_log
       WHERE outcome = 'pending' AND signal_at <= NOW() - INTERVAL '24 hours' AND NOT (${DIRECTIONAL_SQL})`,
    );
    const undirectedCount = Number(undirected[0]?.n ?? 0);
    if (undirectedCount > 0) {
      console.warn(`[label-ai-outcomes] ${undirectedCount} pending signal(s) have no LONG/SHORT trade_bias; skipped (expire after 7 days)`);
    }

    const rows24 = await q<PendingRow>(candidateSql('24h'));
    const rows4 = has4h ? await q<PendingRow>(candidateSql('4h')) : [];
    if (!has4h) {
      console.warn('[label-ai-outcomes] 4h outcome columns missing (apply migrations/103_ai_signal_outcome_horizons.sql); 4h labelling skipped');
    }

    const resolve = createHorizonPriceResolver(nowMs);
    const tallies: Record<OutcomeHorizon, HorizonTally> = { '4h': newTally(), '24h': newTally() };

    const work: Array<[OutcomeHorizon, PendingRow[]]> = [['24h', rows24], ['4h', rows4]];
    for (const [horizon, rows] of work) {
      const t = tallies[horizon];
      for (const row of rows) {
        const direction = normalizeDirection(row.trade_bias);
        const assetClass = normalizeAssetClass(row.asset_type);
        const entry = Number(row.price_at_signal);
        const signalAtMs = new Date(row.signal_at).getTime();
        if (!direction) {
          t.skippedNoDirection++;
          console.warn(`[label-ai-outcomes] signal ${row.id} (${row.symbol}) has no LONG/SHORT direction; skipped`);
          continue;
        }
        if (!assetClass) { t.skippedUnsupported++; continue; }
        if (!(entry > 0) || !horizonPassed(signalAtMs, horizon, nowMs)) { t.skippedNotReady++; continue; }

        const px = await resolve(row.symbol, assetClass, signalAtMs, horizon);
        if (!px) { t.skippedNoPrice++; continue; }

        const move = pctMove(entry, px.price);
        const outcome = classifyOutcome(direction, move);
        const pxAt = new Date(px.at).toISOString();

        const updated = horizon === '24h'
          ? await q<{ id: number }>(
              has24hAt
                ? `UPDATE ai_signal_log
                   SET outcome = $1, price_after_24h = $2, pct_move_24h = $3, price_after_24h_at = $5, outcome_measured_at = NOW()
                   WHERE id = $4 AND outcome = 'pending'
                   RETURNING id`
                : `UPDATE ai_signal_log
                   SET outcome = $1, price_after_24h = $2, pct_move_24h = $3, outcome_measured_at = NOW()
                   WHERE id = $4 AND outcome = 'pending'
                   RETURNING id`,
              has24hAt ? [outcome, px.price, move, row.id, pxAt] : [outcome, px.price, move, row.id],
            )
          : await q<{ id: number }>(
              `UPDATE ai_signal_log
               SET outcome_4h = $1, price_after_4h = $2, pct_move_4h = $3, price_after_4h_at = $5, outcome_4h_measured_at = NOW()
               WHERE id = $4 AND outcome_4h IS NULL
               RETURNING id`,
              [outcome, px.price, move, row.id, pxAt],
            );

        if (!updated.length) { t.alreadyLabeled++; continue; }
        t.labeled++;
        t[outcome]++;
        if (horizon === '24h') {
          await updateLifecycleState(row.id, outcome === 'correct' ? 'TARGET_1_HIT' : outcome === 'wrong' ? 'STOPPED' : 'EXPIRED', move);
        }
      }
    }

    return NextResponse.json({
      success: true,
      labeled: tallies['24h'].labeled + tallies['4h'].labeled,
      expired: expiredRows.length,
      skippedNoDirectionPending: undirectedCount,
      horizons: tallies,
      candidates: { '24h': rows24.length, '4h': rows4.length },
      horizon4hEnabled: has4h,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Labeling failed';
    await alertCronFailure('label-ai-outcomes', message);
    notifyAdmin({
      subject: 'label-ai-outcomes failed',
      body: `AI outcome labeller failed: ${message}`,
      severity: 'error',
      context: { source: 'label-ai-outcomes' },
    }).catch(() => {});
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

async function markExpiredLifecycle(ids: number[]) {
  try {
    await q(
      `UPDATE ai_signal_log SET lifecycle_state = 'EXPIRED', expectancy_r = 0 WHERE id = ANY($1::bigint[])`,
      [ids],
    );
  } catch {
    // Lifecycle columns are optional until migration 068 is applied.
  }
}

async function updateLifecycleState(id: number, state: string, pctMove?: number) {
  try {
    await q(
      `UPDATE ai_signal_log
       SET lifecycle_state = $1,
           target_1_hit_at = CASE WHEN $1 = 'TARGET_1_HIT' THEN NOW() ELSE target_1_hit_at END,
           stop_hit_at = CASE WHEN $1 = 'STOPPED' THEN NOW() ELSE stop_hit_at END,
           max_favorable_pct = CASE WHEN $2::numeric IS NOT NULL AND $2::numeric > 0 THEN GREATEST(COALESCE(max_favorable_pct, 0), $2::numeric) ELSE max_favorable_pct END,
           max_adverse_pct = CASE WHEN $2::numeric IS NOT NULL AND $2::numeric < 0 THEN LEAST(COALESCE(max_adverse_pct, 0), $2::numeric) ELSE max_adverse_pct END,
           expectancy_r = CASE
             WHEN $1 = 'TARGET_1_HIT' THEN 1
             WHEN $1 = 'STOPPED' THEN -1
             ELSE 0
           END
       WHERE id = $3`,
      [state, pctMove ?? null, id],
    );
  } catch {
    // Lifecycle columns are optional until migration 068 is applied.
  }
}

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
