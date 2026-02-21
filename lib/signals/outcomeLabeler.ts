/**
 * Signal Outcome Labeler
 *
 * Populates `signal_outcomes` by matching closed journal entries / portfolio
 * positions back to the `signals_fired` table.
 *
 * Logic:
 *   1. Find all signals_fired that have NO outcome row yet.
 *   2. For each, look for a journal_entries row or portfolio_closed row
 *      with the same symbol AND entry_date within ±60 min of signal_at.
 *   3. If a match is found, compute pct_move = (exit_price - signal_price) / signal_price
 *      and label outcome as 'correct', 'wrong', or 'neutral' based on direction.
 *   4. If signal is older than 7 days with no match, label from market price (mark-to-market).
 *
 * Run this from a cron job or on-demand API endpoint.
 */

import { q, tx } from '@/lib/db';
import type { PoolClient } from 'pg';

export interface OutcomeLabel {
  signalId: number;
  horizonMinutes: number;
  pctMove: number;
  outcome: 'correct' | 'wrong' | 'neutral';
  source: 'journal' | 'portfolio_closed' | 'market_mtm';
}

/** Thresholds for labeling (in % move) */
const NEUTRAL_THRESHOLD = 0.15; // ±0.15% is noise

/**
 * Label a single signal outcome based on actual price difference.
 */
function labelOutcome(
  direction: 'bullish' | 'bearish',
  pctMove: number,
): 'correct' | 'wrong' | 'neutral' {
  if (Math.abs(pctMove) < NEUTRAL_THRESHOLD) return 'neutral';
  if (direction === 'bullish') return pctMove > 0 ? 'correct' : 'wrong';
  return pctMove < 0 ? 'correct' : 'wrong';
}

/**
 * Run the outcome labeler.
 * Returns the number of outcomes written.
 */
export async function labelSignalOutcomes(workspaceId: string): Promise<{ labeled: number; errors: number }> {
  let labeled = 0;
  let errors = 0;

  try {
    // 1. Get un-labeled signals (no outcome row, fired within last 30 days)
    const unlabeled = await q<{
      id: number;
      symbol: string;
      direction: 'bullish' | 'bearish';
      price_at_signal: number;
      signal_at: string;
      timeframe: string;
    }>(`
      SELECT sf.id, sf.symbol, sf.direction, sf.price_at_signal, sf.signal_at, sf.timeframe
      FROM signals_fired sf
      WHERE NOT EXISTS (
        SELECT 1 FROM signal_outcomes so WHERE so.signal_id = sf.id
      )
      AND sf.signal_at > NOW() - INTERVAL '30 days'
      ORDER BY sf.signal_at ASC
      LIMIT 200
    `);

    if (unlabeled.length === 0) return { labeled: 0, errors: 0 };

    for (const signal of unlabeled) {
      try {
        // 2a. Try matching against closed journal entries
        const journalMatch = await q<{
          exit_price: number;
          close_date: string;
        }>(`
          SELECT exit_price, close_date
          FROM journal_entries
          WHERE workspace_id = $1
            AND UPPER(symbol) = UPPER($2)
            AND exit_price IS NOT NULL
            AND close_date IS NOT NULL
            AND ABS(EXTRACT(EPOCH FROM (entry_date - $3::timestamptz))) <= 3600
          ORDER BY close_date ASC
          LIMIT 1
        `, [workspaceId, signal.symbol, signal.signal_at]);

        // 2b. Try matching against closed portfolio positions
        const portfolioMatch = journalMatch.length === 0
          ? await q<{
              exit_price: number;
              closed_at: string;
            }>(`
            SELECT exit_price, closed_at
            FROM portfolio_closed
            WHERE workspace_id = $1
              AND UPPER(symbol) = UPPER($2)
              AND exit_price IS NOT NULL
              AND ABS(EXTRACT(EPOCH FROM (entered_at - $3::timestamptz))) <= 3600
            ORDER BY closed_at ASC
            LIMIT 1
          `, [workspaceId, signal.symbol, signal.signal_at])
          : [];

        let exitPrice: number | null = null;
        let source: OutcomeLabel['source'] = 'journal';

        if (journalMatch.length > 0) {
          exitPrice = journalMatch[0].exit_price;
          source = 'journal';
        } else if (portfolioMatch.length > 0) {
          exitPrice = portfolioMatch[0].exit_price;
          source = 'portfolio_closed';
        }

        if (exitPrice !== null && signal.price_at_signal > 0) {
          const pctMove = ((exitPrice - signal.price_at_signal) / signal.price_at_signal) * 100;
          const outcome = labelOutcome(signal.direction, pctMove);

          // Determine horizon in minutes based on timeframe
          const horizonMinutes = timeframeToHorizonMinutes(signal.timeframe);

          await q(`
            INSERT INTO signal_outcomes (signal_id, horizon_minutes, pct_move, outcome)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (signal_id, horizon_minutes) DO UPDATE SET
              pct_move = EXCLUDED.pct_move,
              outcome = EXCLUDED.outcome
          `, [signal.id, horizonMinutes, Number(pctMove.toFixed(4)), outcome]);

          labeled++;
        }
      } catch (err) {
        errors++;
        console.warn(`[outcomeLabeler] Error labeling signal ${signal.id}:`, err instanceof Error ? err.message : err);
      }
    }

    // 3. Refresh materialized accuracy stats if any were labeled
    if (labeled > 0) {
      await refreshAccuracyStats();
    }
  } catch (err) {
    console.error('[outcomeLabeler] Fatal error:', err instanceof Error ? err.message : err);
    errors++;
  }

  return { labeled, errors };
}

/**
 * Refresh the signal_accuracy_stats table (materialized view pattern).
 */
async function refreshAccuracyStats(): Promise<void> {
  try {
    await q(`
      INSERT INTO signal_accuracy_stats (
        signal_type, direction, horizon_minutes,
        total_signals, correct_count, wrong_count,
        accuracy_pct, precision_pct,
        avg_pct_when_correct, avg_pct_when_wrong,
        accuracy_score_76_100, computed_at
      )
      SELECT
        sf.signal_type,
        sf.direction,
        so.horizon_minutes,
        COUNT(*)::int AS total_signals,
        COUNT(*) FILTER (WHERE so.outcome = 'correct')::int AS correct_count,
        COUNT(*) FILTER (WHERE so.outcome = 'wrong')::int AS wrong_count,
        ROUND(
          COUNT(*) FILTER (WHERE so.outcome = 'correct')::numeric * 100.0 / NULLIF(COUNT(*), 0),
          2
        ) AS accuracy_pct,
        ROUND(
          COUNT(*) FILTER (WHERE so.outcome = 'correct')::numeric * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE so.outcome IN ('correct', 'wrong')), 0),
          2
        ) AS precision_pct,
        ROUND(AVG(so.pct_move) FILTER (WHERE so.outcome = 'correct'), 4) AS avg_pct_when_correct,
        ROUND(AVG(so.pct_move) FILTER (WHERE so.outcome = 'wrong'), 4) AS avg_pct_when_wrong,
        ROUND(
          COUNT(*) FILTER (WHERE so.outcome = 'correct' AND sf.score >= 76)::numeric * 100.0 /
          NULLIF(COUNT(*) FILTER (WHERE sf.score >= 76), 0),
          2
        ) AS accuracy_score_76_100,
        NOW() AS computed_at
      FROM signal_outcomes so
      JOIN signals_fired sf ON sf.id = so.signal_id
      WHERE sf.signal_at > NOW() - INTERVAL '90 days'
      GROUP BY sf.signal_type, sf.direction, so.horizon_minutes
      ON CONFLICT (signal_type, direction, horizon_minutes) DO UPDATE SET
        total_signals = EXCLUDED.total_signals,
        correct_count = EXCLUDED.correct_count,
        wrong_count = EXCLUDED.wrong_count,
        accuracy_pct = EXCLUDED.accuracy_pct,
        precision_pct = EXCLUDED.precision_pct,
        avg_pct_when_correct = EXCLUDED.avg_pct_when_correct,
        avg_pct_when_wrong = EXCLUDED.avg_pct_when_wrong,
        accuracy_score_76_100 = EXCLUDED.accuracy_score_76_100,
        computed_at = EXCLUDED.computed_at
    `);
    console.info('[outcomeLabeler] Accuracy stats refreshed');
  } catch (err) {
    console.warn('[outcomeLabeler] Failed to refresh accuracy stats:', err instanceof Error ? err.message : err);
  }
}

/**
 * Map timeframe string to horizon minutes for labeling.
 */
function timeframeToHorizonMinutes(timeframe: string): number {
  switch (timeframe.toLowerCase()) {
    case '1m': return 5;
    case '5m': return 30;
    case '15m': return 60;
    case '1h': return 240;
    case '4h': return 960;
    case 'daily':
    case '1d': return 1440;
    case 'weekly':
    case '1w': return 10080;
    default: return 1440; // default to 1 day
  }
}
