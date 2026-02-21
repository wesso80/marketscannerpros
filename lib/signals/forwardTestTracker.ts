/**
 * Forward-Test Tracker
 *
 * Paper-trade validation layer: when a scanner signal fires, we automatically
 * create a paper position and track it forward for N bars to validate the
 * signal's real-world accuracy without requiring the user to actually trade.
 *
 * This feeds into the signal accuracy system and lets us answer:
 *   "If I had taken every 80+ score signal, what would my hit rate be?"
 *
 * Tables:
 *   forward_tests — paper positions auto-created from signals
 *   signal_outcomes — updated when forward test resolves
 */

import { q } from '@/lib/db';

export type ForwardTestStatus = 'OPEN' | 'TARGET_HIT' | 'STOP_HIT' | 'EXPIRED' | 'CANCELLED';

export interface ForwardTest {
  id: number;
  signalId: number;
  symbol: string;
  direction: 'bullish' | 'bearish';
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  currentPrice: number | null;
  status: ForwardTestStatus;
  maxFavorableExcursion: number | null;  // best price seen in our direction
  maxAdverseExcursion: number | null;    // worst price seen against us
  barsElapsed: number;
  maxBars: number;
  createdAt: string;
  resolvedAt: string | null;
  pnlPercent: number | null;
}

export interface CreateForwardTestParams {
  signalId: number;
  symbol: string;
  direction: 'bullish' | 'bearish';
  entryPrice: number;
  targetPrice: number;
  stopPrice: number;
  maxBars?: number; // default 20 bars
  timeframe?: string;
}

/**
 * Create a forward test from a scanner signal.
 * Called automatically when a high-confidence signal fires.
 */
export async function createForwardTest(params: CreateForwardTestParams): Promise<number | null> {
  try {
    const rows = await q<{ id: number }>(`
      INSERT INTO forward_tests (
        signal_id, symbol, direction, entry_price,
        target_price, stop_price, max_bars, timeframe,
        status, bars_elapsed, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'OPEN', 0, NOW())
      ON CONFLICT (signal_id) DO NOTHING
      RETURNING id
    `, [
      params.signalId,
      params.symbol,
      params.direction,
      params.entryPrice,
      params.targetPrice,
      params.stopPrice,
      params.maxBars ?? 20,
      params.timeframe ?? 'daily',
    ]);

    return rows[0]?.id ?? null;
  } catch (err) {
    console.warn('[forwardTest] Failed to create:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Update all open forward tests with latest prices.
 * Call this on every price tick or bar close.
 */
export async function updateForwardTests(
  priceUpdates: { symbol: string; price: number }[],
): Promise<{ updated: number; resolved: number }> {
  let updated = 0;
  let resolved = 0;

  try {
    const openTests = await q<ForwardTest>(`
      SELECT id, signal_id, symbol, direction, entry_price,
             target_price, stop_price, current_price,
             max_favorable_excursion AS "maxFavorableExcursion",
             max_adverse_excursion AS "maxAdverseExcursion",
             bars_elapsed AS "barsElapsed", max_bars AS "maxBars",
             status
      FROM forward_tests
      WHERE status = 'OPEN'
    `);

    const priceMap = new Map(priceUpdates.map(p => [p.symbol.toUpperCase(), p.price]));

    for (const test of openTests) {
      const price = priceMap.get(test.symbol.toUpperCase());
      if (price === undefined) continue;

      const isLong = test.direction === 'bullish';
      const pnlPct = isLong
        ? ((price - test.entryPrice) / test.entryPrice) * 100
        : ((test.entryPrice - price) / test.entryPrice) * 100;

      const mfe = test.maxFavorableExcursion ?? test.entryPrice;
      const mae = test.maxAdverseExcursion ?? test.entryPrice;

      const newMfe = isLong
        ? Math.max(mfe, price)
        : Math.min(mae === 0 ? Infinity : mae, price);
      const newMae = isLong
        ? Math.min(mae === 0 ? price : mae, price)
        : Math.max(mfe, price);

      const newBars = test.barsElapsed + 1;

      // Check resolution conditions
      let newStatus: ForwardTestStatus = 'OPEN';
      if (isLong && price >= test.targetPrice) newStatus = 'TARGET_HIT';
      else if (isLong && price <= test.stopPrice) newStatus = 'STOP_HIT';
      else if (!isLong && price <= test.targetPrice) newStatus = 'TARGET_HIT';
      else if (!isLong && price >= test.stopPrice) newStatus = 'STOP_HIT';
      else if (newBars >= test.maxBars) newStatus = 'EXPIRED';

      const isResolved = newStatus !== 'OPEN';

      await q(`
        UPDATE forward_tests SET
          current_price = $1,
          max_favorable_excursion = $2,
          max_adverse_excursion = $3,
          bars_elapsed = $4,
          status = $5,
          pnl_percent = $6,
          resolved_at = $7
        WHERE id = $8
      `, [
        price,
        isLong ? newMfe : test.maxFavorableExcursion,
        isLong ? test.maxAdverseExcursion : newMae,
        newBars,
        newStatus,
        Number(pnlPct.toFixed(4)),
        isResolved ? new Date().toISOString() : null,
        test.id,
      ]);

      updated++;
      if (isResolved) resolved++;
    }
  } catch (err) {
    console.error('[forwardTest] Update error:', err instanceof Error ? err.message : err);
  }

  return { updated, resolved };
}

/**
 * Get forward test statistics for dashboard display.
 */
export async function getForwardTestStats(): Promise<{
  totalTests: number;
  openTests: number;
  targetHitRate: number;
  avgPnlPercent: number;
  avgBarsToResolve: number;
}> {
  try {
    const rows = await q<{
      total: string;
      open: string;
      target_hits: string;
      resolved: string;
      avg_pnl: string;
      avg_bars: string;
    }>(`
      SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE status = 'OPEN')::text AS open,
        COUNT(*) FILTER (WHERE status = 'TARGET_HIT')::text AS target_hits,
        COUNT(*) FILTER (WHERE status IN ('TARGET_HIT', 'STOP_HIT', 'EXPIRED'))::text AS resolved,
        COALESCE(AVG(pnl_percent) FILTER (WHERE status != 'OPEN'), 0)::text AS avg_pnl,
        COALESCE(AVG(bars_elapsed) FILTER (WHERE status != 'OPEN'), 0)::text AS avg_bars
      FROM forward_tests
      WHERE created_at > NOW() - INTERVAL '90 days'
    `);

    const row = rows[0];
    const total = parseInt(row?.total || '0');
    const open = parseInt(row?.open || '0');
    const targetHits = parseInt(row?.target_hits || '0');
    const resolved = parseInt(row?.resolved || '0');

    return {
      totalTests: total,
      openTests: open,
      targetHitRate: resolved > 0 ? Number(((targetHits / resolved) * 100).toFixed(1)) : 0,
      avgPnlPercent: Number(parseFloat(row?.avg_pnl || '0').toFixed(2)),
      avgBarsToResolve: Number(parseFloat(row?.avg_bars || '0').toFixed(1)),
    };
  } catch (err) {
    console.warn('[forwardTest] Stats error:', err instanceof Error ? err.message : err);
    return { totalTests: 0, openTests: 0, targetHitRate: 0, avgPnlPercent: 0, avgBarsToResolve: 0 };
  }
}
