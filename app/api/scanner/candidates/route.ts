/**
 * GET /api/scanner/candidates
 *
 * Returns the latest daily-pick scanner results mapped to the Candidate shape
 * consumed by TradePermissionDashboard. Uses real data from the nightly
 * scan-daily cron job stored in `daily_picks`.
 *
 * Falls back to an empty array if no picks are available.
 */

import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import type { StrategyTag, Direction } from '@/lib/risk-governor-hard';

interface DailyPick {
  asset_class: string;
  symbol: string;
  score: number;
  direction: string;
  price: number;
  change_percent: number;
  indicators: Record<string, number>;
}

interface LiveCandidate {
  symbol: string;
  structure: string;
  strategy_tag: StrategyTag;
  direction: Direction;
  confidence: number;
  asset_class: 'equities' | 'crypto';
  entry_price: number;
  stop_price: number;
  atr: number;
  event_severity: 'none' | 'medium' | 'high';
}

/**
 * Derive a human-readable structure label from technical indicators.
 */
function deriveStructure(pick: DailyPick): string {
  const ind = pick.indicators || {};
  const adx = Number(ind.adx);
  const rsi = Number(ind.rsi);
  const change = Number(pick.change_percent || 0);

  if (Number.isFinite(adx) && adx >= 30 && Math.abs(change) > 2.5) return 'Volatility Expansion';
  if (Number.isFinite(adx) && adx >= 25 && pick.direction === 'bullish') return 'Trend Continuation';
  if (Number.isFinite(adx) && adx >= 25 && pick.direction === 'bearish') return 'Trend Reversal';
  if (Number.isFinite(rsi) && rsi < 35) return 'Oversold Reclaim';
  if (Number.isFinite(rsi) && rsi > 70) return 'Overbought Fade';
  if (Number.isFinite(adx) && adx < 20) return 'Range Compression';
  return 'Technical Setup';
}

/**
 * Map the scanner direction + indicators to an appropriate StrategyTag.
 */
function deriveStrategy(pick: DailyPick): StrategyTag {
  const ind = pick.indicators || {};
  const adx = Number(ind.adx);
  const rsi = Number(ind.rsi);
  const change = Math.abs(Number(pick.change_percent || 0));

  // High ADX + strong momentum → breakout
  if (Number.isFinite(adx) && adx >= 28 && change > 2) return 'BREAKOUT_CONTINUATION';
  // Trend-following on pullback
  if (Number.isFinite(adx) && adx >= 22 && Number.isFinite(rsi) && rsi >= 40 && rsi <= 60) return 'TREND_PULLBACK';
  // RSI extremes → mean reversion
  if (Number.isFinite(rsi) && (rsi < 35 || rsi > 70)) return 'MEAN_REVERSION';
  // Low ADX + fading → range fade
  if (Number.isFinite(adx) && adx < 20) return 'RANGE_FADE';
  // Strong short-term momentum change
  if (change > 4) return 'MOMENTUM_REVERSAL';
  // Default
  return 'TREND_PULLBACK';
}

/**
 * Compute a simple stop price from price + ATR.
 */
function computeStop(price: number, atr: number, direction: Direction): number {
  const offset = atr * 1.5;
  return direction === 'LONG'
    ? Math.round((price - offset) * 100) / 100
    : Math.round((price + offset) * 100) / 100;
}

export async function GET() {
  try {
    const rows = await q<DailyPick>(`
      WITH latest AS (SELECT MAX(scan_date) AS d FROM daily_picks)
      SELECT dp.asset_class, dp.symbol, dp.score, dp.direction,
             dp.price, dp.change_percent, dp.indicators
      FROM daily_picks dp
      JOIN latest l ON dp.scan_date = l.d
      WHERE dp.asset_class IN ('equity', 'crypto')
      ORDER BY dp.score DESC
      LIMIT 10
    `);

    if (!rows.length) {
      return NextResponse.json({ candidates: [], source: 'none' });
    }

    const candidates: LiveCandidate[] = rows
      .filter(r => Number.isFinite(r.price) && r.price > 0)
      .map((pick) => {
        const ind = pick.indicators || {};
        const atr = Number(ind.atr);
        const price = Number(pick.price);
        const direction: Direction = pick.direction === 'bearish' ? 'SHORT' : 'LONG';
        const safeAtr = Number.isFinite(atr) && atr > 0
          ? atr
          : price * 0.02; // fallback: 2% of price
        const strategy_tag = deriveStrategy(pick);
        const stopPrice = computeStop(price, safeAtr, direction);

        // Normalize confidence to 0-100 from the raw score (50 = neutral)
        const rawScore = Number(pick.score || 50);
        const confidence = Math.round(
          Math.min(100, Math.max(30, 50 + (Math.abs(rawScore - 50) * 1.0)))
        );

        const assetClass: 'equities' | 'crypto' = pick.asset_class === 'crypto' ? 'crypto' : 'equities';
        const sym = assetClass === 'crypto'
          ? `${pick.symbol.replace(/[-]?(USD|USDT)$/i, '')}USD`
          : pick.symbol;

        return {
          symbol: sym,
          structure: deriveStructure(pick),
          strategy_tag,
          direction,
          confidence,
          asset_class: assetClass,
          entry_price: price,
          stop_price: stopPrice,
          atr: Math.round(safeAtr * 100) / 100,
          event_severity: 'none' as const,
        };
      })
      .slice(0, 8); // Cap at 8 candidates

    return NextResponse.json({
      candidates,
      source: 'daily_picks',
      count: candidates.length,
    });
  } catch (err: any) {
    console.error('[scanner/candidates]', err?.message || err);
    return NextResponse.json({ candidates: [], source: 'error' });
  }
}
