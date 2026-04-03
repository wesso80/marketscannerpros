import { NextRequest, NextResponse } from 'next/server';
import { q } from '@/lib/db';
import { timingSafeEqual } from 'crypto';
import { alertCronFailure } from '@/lib/opsAlerting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AV_KEY = () => process.env.ALPHA_VANTAGE_API_KEY || '';

/**
 * Fetch current price for a crypto symbol via AV CURRENCY_EXCHANGE_RATE (1 call each).
 * Falls back to the latest signal's price_at_signal if AV fails.
 */
async function fetchCurrentPrices(symbols: string[]): Promise<Record<string, number>> {
  const priceMap: Record<string, number> = {};

  // Batch: fetch from Alpha Vantage (lightweight exchange-rate endpoint, 1 per symbol)
  const key = AV_KEY();
  if (key) {
    // Process serially to avoid rate limit spikes (max ~10 symbols per cron run is fine)
    for (const sym of symbols) {
      try {
        const url = `https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=${encodeURIComponent(sym)}&to_currency=USD&apikey=${key}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
        if (res.ok) {
          const json = await res.json();
          const rate = json?.['Realtime Currency Exchange Rate']?.['5. Exchange Rate'];
          if (rate) {
            const price = parseFloat(rate);
            if (price > 0) priceMap[sym] = price;
          }
        }
      } catch {
        // AV call failed for this symbol, will try fallback
      }
    }
  }

  // Fallback: for any symbols not fetched, use the latest signal price
  const missing = symbols.filter(s => !(s in priceMap));
  if (missing.length > 0) {
    const placeholders = missing.map((_, i) => `$${i + 1}`).join(',');
    const rows = await q(
      `SELECT DISTINCT ON (symbol) symbol, price_at_signal
       FROM ai_signal_log
       WHERE symbol IN (${placeholders})
         AND price_at_signal IS NOT NULL
         AND price_at_signal > 0
       ORDER BY symbol, signal_at DESC`,
      missing,
    );
    for (const r of rows) {
      const p = parseFloat(String((r as any).price_at_signal));
      if (p > 0 && !((r as any).symbol in priceMap)) {
        priceMap[(r as any).symbol] = p;
      }
    }
  }

  return priceMap;
}

/**
 * POST /api/cron/label-ai-outcomes
 * Cron job that labels ai_signal_log entries with outcomes.
 * Checks entries older than 4h where outcome is still 'pending'.
 * Fetches current prices from Alpha Vantage for accurate comparison.
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

    // Collect unique symbols and fetch current prices
    const symbols = [...new Set(pending.map((r: any) => r.symbol).filter(Boolean))];
    const priceMap = await fetchCurrentPrices(symbols);

    let labeled = 0;
    let correct = 0;
    let wrong = 0;
    let neutral = 0;
    let expired = 0;
    let skippedNoPrice = 0;

    for (const signal of pending) {
      const s = signal as any;
      const entryPrice = parseFloat(String(s.price_at_signal));

      // If entry price was never recorded, try to use the current AV price
      // and label as neutral (we can't compute direction without entry price)
      if (!entryPrice || !Number.isFinite(entryPrice)) {
        const signalAge = Date.now() - new Date(s.signal_at).getTime();
        if (signalAge > 7 * 24 * 60 * 60 * 1000) {
          await q(
            `UPDATE ai_signal_log SET outcome = 'expired', outcome_measured_at = NOW() WHERE id = $1`,
            [s.id],
          );
          expired++;
          labeled++;
        } else {
          // Backfill the price and mark neutral since we don't know entry
          const nowPrice = priceMap[s.symbol];
          if (nowPrice) {
            await q(
              `UPDATE ai_signal_log SET outcome = 'neutral', price_at_signal = $1, price_after_24h = $1, pct_move_24h = 0, outcome_measured_at = NOW() WHERE id = $2`,
              [nowPrice, s.id],
            );
            neutral++;
            labeled++;
          } else {
            skippedNoPrice++;
          }
        }
        continue;
      }

      const currentPrice = priceMap[s.symbol];
      if (!currentPrice) {
        // No current price available at all — expire if old enough
        const signalAge = Date.now() - new Date(s.signal_at).getTime();
        if (signalAge > 7 * 24 * 60 * 60 * 1000) {
          await q(
            `UPDATE ai_signal_log SET outcome = 'expired', outcome_measured_at = NOW() WHERE id = $1`,
            [s.id],
          );
          expired++;
          labeled++;
        } else {
          skippedNoPrice++;
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
      breakdown: { correct, wrong, neutral, expired, skippedNoPrice },
      pendingTotal: pending.length,
      pricesResolved: Object.keys(priceMap).length,
      symbolsTotal: symbols.length,
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
