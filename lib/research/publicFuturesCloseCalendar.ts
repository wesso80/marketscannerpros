/**
 * Public Futures Close Calendar contract (/api/terminal/futures, `closeCalendar`).
 *
 * The futures close-calendar engine (lib/terminal/futures/futuresCloseCalendar) attaches a category weight to every
 * timeframe and a weighted "stack" score to every group of coinciding closes. Neither is published. The public
 * calendar is the schedule (each timeframe's next close time and minutes to it) and the groups of closes that fall
 * on the same 15-minute mark, in time order, with the timeframes and how many close. The engine is unchanged; this
 * is a leaf-by-leaf projection of its output.
 */
import type { FuturesAnchorMode, FuturesCloseCalendarResponse } from '@/lib/terminal/futures/futuresCloseCalendar';

export const PUBLIC_FUTURES_CLOSE_CALENDAR_CONTRACT = 'public-futures-close-calendar-v1';

export type FuturesCloseCategory = 'intraday' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export interface PublicFuturesCloseRow { timeframe: string; category: FuturesCloseCategory; nextCloseISO: string; minutesToClose: number | null }
export interface PublicFuturesCloseGroup { timeISO: string; timeEtLabel: string; timeframes: string[]; closeCount: number }

export interface PublicFuturesCloseCalendar {
  contract: typeof PUBLIC_FUTURES_CLOSE_CALENDAR_CONTRACT;
  symbol: string;
  anchorMode: FuturesAnchorMode;
  timezone: 'America/New_York';
  horizonDays: number | null;
  schedule: PublicFuturesCloseRow[];
  /** Coinciding closes, in time order (earliest first). */
  clusters: PublicFuturesCloseGroup[];
  groupRule: string;
  timeline: string[];
  warnings: string[];
}

export const FUTURES_CLOSE_GROUP_RULE = 'Closes are grouped by the 15-minute mark (ET) they fall on; the next 10 groups are listed in time order with the timeframes that close.';

const CATEGORIES = new Set<FuturesCloseCategory>(['intraday', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly']);
const ANCHORS = new Set<FuturesAnchorMode>(['globex', 'rth', 'cash_bridge']);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

export function toPublicFuturesCloseCalendar(c: FuturesCloseCalendarResponse): PublicFuturesCloseCalendar {
  return {
    contract: PUBLIC_FUTURES_CLOSE_CALENDAR_CONTRACT,
    symbol: str(c.symbol),
    anchorMode: ANCHORS.has(c.anchorMode) ? c.anchorMode : 'globex',
    timezone: 'America/New_York',
    horizonDays: num(c.horizonDays),
    schedule: (c.schedule ?? []).map((r) => ({
      timeframe: str(r.timeframe),
      category: CATEGORIES.has(r.category) ? r.category : 'intraday',
      nextCloseISO: str(r.nextCloseISO),
      minutesToClose: num(r.minutesToClose),
    })),
    clusters: (c.clusters ?? [])
      .map((g) => ({ timeISO: str(g.timeISO), timeEtLabel: str(g.timeEtLabel), timeframes: strs(g.timeframes), closeCount: strs(g.timeframes).length }))
      .sort((a, b) => Date.parse(a.timeISO) - Date.parse(b.timeISO)),
    groupRule: FUTURES_CLOSE_GROUP_RULE,
    timeline: strs(c.timeline),
    warnings: strs(c.warnings),
  };
}
