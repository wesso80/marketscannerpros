import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { timingSafeEqual } from 'crypto';
import { alertCronFailure } from '@/lib/opsAlerting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/label-ai-outcomes
 * Cron job that labels ai_signal_log entries with outcomes.
 * Checks entries older than 4h where outcome is still 'pending'.
 * Uses the latest price_at_signal for each symbol as the "current" price
 * (operator scans run continuously so the most recent signal has fresh price).
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || '';
  const expected = process.env.CRON_SECRET || '';
  if (!expected || !timingSafeCompare(secret, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get pending signals older than 4 hours (enough time for price to move)
    const pending = await q(`
      SELECT id, workspace_id, symbol, trade_bias, price_at_signal,
             confidence, signal_at
      FROM ai_signal_log
      WHERE outcome = 'pending'
        AND signal_at < NOW() - INTERVAL '4 hours'
      ORDER BY signal_at ASC
      LIMIT 500
    `);

    if (!pending.length) {
      return NextResponse.json({ success: true, labeled: 0, message: 'No pending signals to label' });
    }

    // Get current prices from the LATEST signal for each symbol
    // (operator scans run continuously, so the newest signal has the current price)
    const symbols = [...new Set(pending.map((r: any) => r.symbol).filter(Boolean))];
    const priceMap: Record<string, number> = {};

    if (symbols.length > 0) {
      const placeholders = symbols.map((_, i) => `$${i + 1}`).join(',');
      const latestPrices = await q(
        `SELECT DISTINCT ON (symbol) symbol, price_at_signal
         FROM ai_signal_log
         WHERE symbol IN (${placeholders})
           AND price_at_signal IS NOT NULL
           AND price_at_signal > 0
         ORDER BY symbol, signal_at DESC`,
        symbols,
      );
      for (const p of latestPrices) {
        const price = parseFloat(String((p as any).price_at_signal));
        if (price > 0) priceMap[(p as any).symbol] = price;
      }
    }

    let labeled = 0;
    let correct = 0;
    let wrong = 0;
    let neutral = 0;
    let expired = 0;

    for (const signal of pending) {
      const s = signal as any;
      const entryPrice = parseFloat(String(s.price_at_signal));
      if (!entryPrice) continue;

      const currentPrice = priceMap[s.symbol];

      // If no recent price and signal is >7 days old, expire it
      if (!currentPrice) {
        const signalAge = Date.now() - new Date(s.signal_at).getTime();
        if (signalAge > 7 * 24 * 60 * 60 * 1000) {
          await q(
            `UPDATE ai_signal_log SET outcome = 'expired', outcome_measured_at = NOW() WHERE id = $1`,
            [s.id],
          );
          expired++;
          labeled++;
        }
        continue;
      }

      const pctMove = ((currentPrice - entryPrice) / entryPrice) * 100;
      const direction = (s.trade_bias || 'LONG').toUpperCase();

      // Thresholds: >1% in right direction = correct, >1% wrong = wrong, else neutral
      let outcome: string;
      if (direction === 'LONG') {
        if (pctMove >= 1) { outcome = 'correct'; correct++; }
        else if (pctMove <= -1) { outcome = 'wrong'; wrong++; }
        else { outcome = 'neutral'; neutral++; }
      } else if (direction === 'SHORT') {
        if (pctMove <= -1) { outcome = 'correct'; correct++; }
        else if (pctMove >= 1) { outcome = 'wrong'; wrong++; }
        else { outcome = 'neutral'; neutral++; }
      } else {
        outcome = 'neutral';
        neutral++;
      }

      await q(
        `UPDATE ai_signal_log
         SET outcome = $1, price_after_24h = $2, pct_move_24h = $3, outcome_measured_at = NOW()
         WHERE id = $4`,
        [outcome, currentPrice, Math.round(pctMove * 10000) / 10000, s.id],
      );
      labeled++;
    }

    return NextResponse.json({
      success: true,
      labeled,
      breakdown: { correct, wrong, neutral, expired },
      pendingTotal: pending.length,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Labeling failed';
    await alertCronFailure('label-ai-outcomes', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
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
