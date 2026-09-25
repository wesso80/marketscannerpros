/**
 * GET /api/scanner/candidates
 *
 * Returns the latest daily research observations mapped to the Candidate shape
 * consumed by public research-alignment widgets. Uses real data from the nightly
 * scan-daily cron job stored in `daily_picks`.
 *
 * Falls back to an empty array if no research observations are available.
 */

import { NextResponse } from 'next/server';
import { q } from '@/lib/db';
import type { StrategyTag, Direction } from '@/lib/risk-governor-hard';
import { scannerComplianceMetadata, scannerDataQualityMetadata } from '@/lib/scanner/compliance';
import { canonicalLabel, rankDailyPicks, readStoredCanonical, SETUP_LABEL, type CanonicalResult } from '@/lib/scoring/canonical';

interface DailyPick {
  asset_class: string;
  symbol: string;
  score: number;
  direction: string;
  price: number;
  change_percent: number;
  indicators: Record<string, any>;
}

interface LiveCandidate {
  symbol: string;
  structure: string;
  strategy_tag: StrategyTag;
  direction: Direction;
  confidence: number;
  asset_class: 'equities' | 'crypto';
  reference_price: number;
  invalidation_price: number;
  entry_price: number;
  stop_price: number;
  atr: number;
  event_severity: 'none' | 'medium' | 'high';
  /** Canonical verdict label (e.g. "WATCH · B · Pullback · factors only"); null for pre-canonical rows. */
  verdict: string | null;
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
      LIMIT 40
    `);
    // Canonical verdict first: drop BLOCK / no-side rows, rank permission → grade → score; legacy rows keep score order.
    const withC = rows.map((r) => ({ ...r, canonical: readStoredCanonical(r.indicators) as CanonicalResult | null }));
    const ranked = rankDailyPicks(withC.filter((r) => !r.canonical || (r.canonical.permission !== 'BLOCK' && r.canonical.direction !== 'neutral'))).slice(0, 10);

    if (!rows.length) {
      return NextResponse.json({
        candidates: [],
        source: 'none',
        compliance: scannerComplianceMetadata(),
        dataQuality: scannerDataQualityMetadata({
          source: 'none',
          stale: true,
          coverageScore: 0,
          warnings: ['No scanner research observations are available yet.'],
        }),
      });
    }

    const candidates: LiveCandidate[] = ranked
      .filter(r => Number.isFinite(Number(r.price)) && Number(r.price) > 0)
      .map((pick) => {
        const c = pick.canonical;
        const ind = pick.indicators || {};
        const atr = Number(ind.atr);
        const price = Number(pick.price);
        const direction: Direction = c ? (c.direction === 'short' ? 'SHORT' : 'LONG') : pick.direction === 'bearish' ? 'SHORT' : 'LONG';
        const safeAtr = Number.isFinite(atr) && atr > 0
          ? atr
          : price * 0.02; // fallback: 2% of price
        const strategy_tag = deriveStrategy(pick);
        // Canonical structural invalidation when available; ATR stop for pre-canonical rows.
        const stopPrice = c?.levels?.invalidation ?? computeStop(price, safeAtr, direction);

        // Canonical rows: the canonical display score (calibrated percentile / factor alignment — not a probability),
        // clamped 30–90. Legacy rows: signal conviction (distance from neutral 50), same clamp.
        const rawScore = Number(pick.score || 50);
        const confidence = Math.round(c
          ? Math.min(90, Math.max(30, c.score))
          : Math.min(90, Math.max(30, 50 + (Math.abs(rawScore - 50) * 0.8))));

        const assetClass: 'equities' | 'crypto' = pick.asset_class === 'crypto' ? 'crypto' : 'equities';
        const sym = assetClass === 'crypto'
          ? `${pick.symbol.replace(/[-]?(USD|USDT)$/i, '')}USD`
          : pick.symbol;

        return {
          symbol: sym,
          structure: c ? `${SETUP_LABEL[c.setupType] ?? c.setupType}` : deriveStructure(pick),
          strategy_tag,
          direction,
          confidence,
          asset_class: assetClass,
          reference_price: price,
          invalidation_price: stopPrice,
          entry_price: c?.levels?.entry ?? price,
          stop_price: stopPrice,
          atr: Math.round(safeAtr * 100) / 100,
          event_severity: 'none' as const,
          verdict: canonicalLabel(c),
        };
      })
      .slice(0, 8); // Cap at 8 candidates

    return NextResponse.json({
      candidates,
      source: 'daily_picks',
      count: candidates.length,
      compliance: scannerComplianceMetadata(),
      dataQuality: scannerDataQualityMetadata({
        source: 'daily_picks_database',
        computedAt: new Date(),
        stale: false,
        coverageScore: rows.length ? Math.round((candidates.length / Math.max(1, rows.length)) * 100) : 0,
      }),
    });
  } catch (err: any) {
    console.error('[scanner/candidates]', err?.message || err);
    return NextResponse.json({
      candidates: [],
      source: 'error',
      compliance: scannerComplianceMetadata(),
      dataQuality: scannerDataQualityMetadata({
        source: 'error',
        stale: true,
        coverageScore: 0,
        warnings: ['Unable to load scanner research observations.'],
      }),
    });
  }
}
