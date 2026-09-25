/**
 * Per-ticker data trust for stored daily research observations (`daily_picks`).
 *
 * The daily-picks API used to return one hard-coded envelope for the whole response (`stale: false`,
 * `coverageScore: 100`) whatever the rows contained. This evaluates EACH stored row from what was actually persisted:
 * which scoring indicators are present (coverage), how old the underlying data is, and on what basis that age is known.
 * Pure: no DB or network access.
 */
import { evaluateDataTrust, type DataTrustLevel, type TrustAssetClass } from './dataTrust';

/** Indicator groups the daily-picks scorers (`scan-daily`, `scan-universe`) vote with. Pairs count as one group. */
export const DAILY_PICK_INDICATOR_GROUPS: Array<{ name: string; keys: string[] }> = [
  { name: 'EMA200', keys: ['ema200'] },
  { name: 'RSI', keys: ['rsi'] },
  { name: 'MACD', keys: ['macd', 'macdSignal'] },
  { name: 'ADX', keys: ['adx'] },
  { name: 'Stochastic', keys: ['stochK', 'stochD'] },
  { name: 'Aroon', keys: ['aroonUp', 'aroonDown'] },
  { name: 'CCI', keys: ['cci'] },
];

/** Same documented minimum as the scanner contract (COVERAGE_MIN): below it the row is INSUFFICIENT_DATA. */
export const DAILY_PICK_COVERAGE_MIN = 0.6;

export interface DailyPickRow {
  asset_class: string;
  symbol?: string;
  price?: number | string | null;
  indicators?: Record<string, unknown> | string | null;
  scan_date?: string | Date | null;
  created_at?: string | Date | null;
}

export interface DailyPickTrust {
  level: DataTrustLevel;
  /** 0–1 share of indicator groups present on this row. */
  coverage: number;
  missing: string[];
  reasons: string[];
  freshness: 'fresh' | 'delayed' | 'stale' | 'unknown';
  /** ISO date/time of the data the row describes. */
  dataTimestamp: string | null;
  /** 'bar' = the stored last-bar date; 'scan_date' = only the scan date is known (an upper bound on bar age). */
  timestampBasis: 'bar' | 'scan_date' | 'unknown';
  /** When the row was written. */
  scannedAt: string | null;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};
const iso = (v: unknown): string | null => {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

export function evaluateDailyPickTrust(row: DailyPickRow, nowMs: number = Date.now()): DailyPickTrust {
  let ind: Record<string, unknown> = {};
  if (typeof row.indicators === 'string') { try { ind = JSON.parse(row.indicators) ?? {}; } catch { ind = {}; } }
  else if (row.indicators && typeof row.indicators === 'object') ind = row.indicators;

  const present = DAILY_PICK_INDICATOR_GROUPS.filter(g => g.keys.every(k => num(ind[k]) !== undefined));
  const missing = DAILY_PICK_INDICATOR_GROUPS.filter(g => !present.includes(g)).map(g => g.name);
  const coverage = present.length / DAILY_PICK_INDICATOR_GROUPS.length;

  const barRaw = ind.lastBarAt ?? ind.lastCompletedBarAt ?? ind.barDate ?? ind.asOf;
  const barAt = iso(barRaw);
  const scanDate = iso(row.scan_date);
  const dataTimestamp = barAt ?? scanDate;
  const timestampBasis: DailyPickTrust['timestampBasis'] = barAt ? 'bar' : scanDate ? 'scan_date' : 'unknown';
  const assetClass: TrustAssetClass = row.asset_class === 'crypto' ? 'crypto' : row.asset_class === 'forex' ? 'forex' : 'equity';
  const price = num(row.price) ?? num(ind.price);

  const base = evaluateDataTrust({
    assetClass, timeframe: 'daily', lastBarAt: dataTimestamp, barInterval: '1d', price: price ?? null,
    indicators: { rsi: present.some(g => g.name === 'RSI'), adx: present.some(g => g.name === 'ADX'),
      ema200: present.some(g => g.name === 'EMA200'), macd: present.some(g => g.name === 'MACD') },
    nowMs,
  });
  const reasons = [...base.reasons];
  let level: DataTrustLevel = base.level;
  if (coverage < DAILY_PICK_COVERAGE_MIN && level !== 'STALE') {
    level = 'INSUFFICIENT_DATA';
    reasons.push(`indicator coverage ${Math.round(coverage * 100)}% is below the ${Math.round(DAILY_PICK_COVERAGE_MIN * 100)}% minimum`);
  }
  // The forex writer stores its EMA(≤200 closes) under `ema200` alongside `ema50`; identical values mean a proxy.
  if (num(ind.ema50) !== undefined && num(ind.ema50) === num(ind.ema200)) {
    if (level === 'GOOD') level = 'DEGRADED';
    reasons.push('EMA200 is an EMA50 proxy on this row');
  }
  if (timestampBasis === 'scan_date') reasons.push('bar date not stored; age judged from the scan date');
  return { level, coverage, missing, reasons, freshness: base.freshness, dataTimestamp, timestampBasis, scannedAt: iso(row.created_at) };
}

/** Response-level summary derived from the per-row verdicts (replaces the hard-coded stale:false / coverage 100). */
export function summarizeDailyPickTrust(trusts: DailyPickTrust[]) {
  if (!trusts.length) return { stale: false, coverageScore: 0, staleCount: 0, insufficientCount: 0, oldestDataTimestamp: null as string | null };
  const staleCount = trusts.filter(t => t.level === 'STALE').length;
  const insufficientCount = trusts.filter(t => t.level === 'INSUFFICIENT_DATA').length;
  const stamps = trusts.map(t => t.dataTimestamp).filter((t): t is string => !!t).sort();
  return {
    stale: staleCount > 0,
    coverageScore: Math.round(trusts.reduce((s, t) => s + t.coverage, 0) / trusts.length * 100),
    staleCount,
    insufficientCount,
    oldestDataTimestamp: stamps[0] ?? null,
  };
}
