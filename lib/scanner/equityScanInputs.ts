/**
 * Pure input helpers for the equity Pro scan (app/api/scanner/bulk). Kept out of the route file so they can be tested.
 */
import { lastCompletedEquitySession } from './dataTrust';

/**
 * Average daily share volume over the last `n` COMPLETED US sessions. A bar dated after the last closed session (today's
 * unfinished bar while the market is open) is excluded so a partial day never drags the average down. Needs >= 5 bars.
 */
export function completedSessionAvgVolume(
  bars: ReadonlyArray<{ ts: string; volume: number | null }>, nowMs: number = Date.now(), n = 20,
): number | null {
  const lastClosed = lastCompletedEquitySession(nowMs);
  const vols = bars
    .filter((b) => String(b.ts).slice(0, 10) <= lastClosed)
    .slice(-n)
    .map((b) => b.volume)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  return vols.length >= 5 ? vols.reduce((s, v) => s + v, 0) / vols.length : null;
}

export interface ParsedEquityQuote { price: number; open: number; prevClose: number; changePct: number; volume: number }

const num = (value: unknown): number => {
  if (value === null || value === undefined || value === '') return Number.NaN;
  const parsed = Number(String(value).replace(/,/g, '').replace('%', ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};
const first = (...values: unknown[]): number => {
  for (const v of values) { const n = num(v); if (Number.isFinite(n)) return n; }
  return Number.NaN;
};

/**
 * One Alpha Vantage quote row, from either REALTIME_BULK_QUOTES (`close`, `previous_close`, `change_percent`, `open`,
 * `volume`) or GLOBAL_QUOTE (`05. price`, `08. previous close`, `10. change percent`, ...). Missing fields are NaN.
 * When the change % is absent it is derived from price and previous close.
 */
export function parseEquityQuote(quote: any): ParsedEquityQuote {
  const price = first(quote?.['05. price'], quote?.close, quote?.price);
  const prevClose = first(quote?.['08. previous close'], quote?.previous_close);
  const reported = first(quote?.['10. change percent'], quote?.change_percent);
  const changePct = Number.isFinite(reported) ? reported
    : Number.isFinite(price) && prevClose > 0 ? (price / prevClose - 1) * 100 : Number.NaN;
  return { price, open: first(quote?.['02. open'], quote?.open), prevClose, changePct, volume: first(quote?.['06. volume'], quote?.volume) };
}

/**
 * Movers (top gainers / losers / most active) that may join the scan: only ones the worker cache has a full row for,
 * not already scanned, up to `room`. Movers outside the cache have no indicators or bar history, so they could only be
 * dropped or hard-blocked — they stay in the bias map for context but never pad the scan list.
 */
export function cachedMoversToAdd(movers: Iterable<string>, alreadyScanning: ReadonlySet<string>, cached: { has(symbol: string): boolean }, room: number): string[] {
  const out: string[] = [];
  for (const t of movers) {
    if (out.length >= room) break;
    if (!alreadyScanning.has(t) && cached.has(t) && !out.includes(t)) out.push(t);
  }
  return out;
}
