/**
 * Public daily-scan observations (/api/scanner/daily-picks for non-admin callers).
 *
 * The stored daily scan rows carry the canonical verdict (permission, grade, setup, direction, score, percentile,
 * reference levels, every evaluated candidate), a legacy signal-count score with bullish/bearish counts, and a
 * top/bottom ("bullish / bearish alignment") split. None of that is public: grades and verdicts are not published
 * (product decision 8 Oct), and the order of the list must not imply a ranking. The public reading is the measured
 * row for each stored symbol, sorted by a disclosed factual key (symbol, A–Z). Built leaf by leaf; admin callers keep
 * the full response unchanged.
 */
import type { DailyPickTrust } from '@/lib/scanner/dailyPickTrust';

export const PUBLIC_DAILY_OBSERVATIONS_CONTRACT = 'public-daily-observations-v1';

/** Measured indicators the daily scan stores (the same groups the data-trust check counts), plus ATR %. */
export const PUBLIC_INDICATOR_KEYS = ['ema200', 'rsi', 'macd', 'macdSignal', 'adx', 'stochK', 'stochD', 'aroonUp', 'aroonDown', 'cci', 'atrPct'] as const;
export type PublicIndicatorKey = typeof PUBLIC_INDICATOR_KEYS[number];

export interface PublicDailyObservation {
  symbol: string;
  assetClass: 'equity' | 'crypto';
  scanDate: string | null;
  price: number | null;
  priceBasis: string;
  priceBasisLabel: string;
  changePercent: number | null;
  indicators: Record<PublicIndicatorKey, number | null>;
  dataQuality: Pick<DailyPickTrust, 'level' | 'coverage' | 'missing' | 'reasons' | 'freshness' | 'dataTimestamp' | 'dataAsOf' | 'timestampBasis' | 'scannedAt'>;
}

export const SELECTION_NOTE = 'Symbols stored by the daily scan for each market. The scan screens a fixed list of symbols; being included is not a rating, ranking or recommendation.';
export const SORT_NOTE = 'Sorted by symbol (A–Z). The list is not ordered by any score.';

const num = (v: unknown): number | null => { const n = typeof v === 'string' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : null; };

export function toPublicDailyObservation(
  row: { symbol: unknown; asset_class: unknown; scan_date: string | null; price: unknown; change_percent: unknown; indicators: unknown },
  priceInfo: { priceBasis: string; priceBasisLabel: string },
  trust: DailyPickTrust,
): PublicDailyObservation {
  const ind = (row.indicators && typeof row.indicators === 'object' ? row.indicators : {}) as Record<string, unknown>;
  const indicators = Object.fromEntries(PUBLIC_INDICATOR_KEYS.map((k) => [k, num(ind[k])])) as Record<PublicIndicatorKey, number | null>;
  return {
    symbol: String(row.symbol ?? ''),
    assetClass: row.asset_class === 'crypto' ? 'crypto' : 'equity',
    scanDate: row.scan_date,
    price: num(row.price),
    priceBasis: priceInfo.priceBasis,
    priceBasisLabel: priceInfo.priceBasisLabel,
    changePercent: num(row.change_percent),
    indicators,
    dataQuality: {
      level: trust.level, coverage: trust.coverage, missing: [...trust.missing], reasons: [...trust.reasons], freshness: trust.freshness,
      dataTimestamp: trust.dataTimestamp, dataAsOf: trust.dataAsOf, timestampBasis: trust.timestampBasis, scannedAt: trust.scannedAt,
    },
  };
}

/** Disclosed factual order: symbol A–Z (ties: asset class). */
export function sortObservations(rows: PublicDailyObservation[]): PublicDailyObservation[] {
  return [...rows].sort((a, b) => a.symbol.localeCompare(b.symbol) || a.assetClass.localeCompare(b.assetClass));
}
