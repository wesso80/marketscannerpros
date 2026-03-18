import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { timingSafeEqual } from 'crypto';
import { alertCronFailure } from '@/lib/opsAlerting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/label-ai-outcomes
 * Cron job that labels ai_signal_log entries with outcomes.
 * Checks entries older than 24h where outcome is still 'pending'.
 * Compares price at signal time vs current price to label correct/wrong/neutral.
 */
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || '';
  const expected = process.env.CRON_SECRET || '';
  if (!expected || !timingSafeCompare(secret, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get pending AI signals older than 24 hours
    const pending = await q(`
      SELECT id, workspace_id, symbol, trade_bias, price_at_signal,
             confidence, signal_at
      FROM ai_signal_log
      WHERE outcome = 'pending'
        AND signal_at < NOW() - INTERVAL '24 hours'
      ORDER BY signal_at ASC
      LIMIT 200
    `);

    if (!pending.length) {
      return NextResponse.json({ success: true, labeled: 0, message: 'No pending signals to label' });
    }

    // Gather unique symbols
    const symbols = [...new Set(pending.map((r: any) => r.symbol).filter(Boolean))];

    // Fetch current prices from quotes_latest
    const priceMap: Record<string, number> = {};
    if (symbols.length > 0) {
      const placeholders = symbols.map((_, i) => `$${i + 1}`).join(',');
      const prices = await q(
        `SELECT symbol, price FROM quotes_latest WHERE symbol IN (${placeholders})`,
        symbols,
      );
      for (const p of prices) {
        priceMap[(p as any).symbol] = parseFloat((p as any).price);
      }
    }

    let labeled = 0;
    let correct = 0;
    let wrong = 0;
    let neutral = 0;

    for (const signal of pending) {
      const s = signal as any;
      const currentPrice = priceMap[s.symbol];
      if (!currentPrice || !s.price_at_signal) continue;

      const entryPrice = parseFloat(s.price_at_signal);
      if (!entryPrice) continue;

      const pctMove = ((currentPrice - entryPrice) / entryPrice) * 100;
      const direction = (s.trade_bias || 'LONG').toUpperCase();

      // Thresholds: >1% in right direction = correct, >1% wrong direction = wrong, else neutral
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
        [outcome, currentPrice, pctMove, s.id],
      );
      labeled++;
    }

    return NextResponse.json({
      success: true,
      labeled,
      breakdown: { correct, wrong, neutral },
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
