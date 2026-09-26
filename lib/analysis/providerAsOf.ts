/**
 * Provider "as of" times for Overview feeds (OV-7).
 *
 * The sector heatmap, crypto overview and movers routes used to report only the time
 * the server answered, so the Session overview could not tell how old the data was.
 * These helpers turn the provider's own time into an ISO string and decide whether US
 * equity data is behind the latest session. Pure, no I/O.
 */
import { createMarketClock } from '@/lib/time-confluence';
import { isNonTradingDay } from '@/lib/time/marketHolidays';

/** During the regular session, equity data older than this counts as stale. */
export const EQUITY_INTRADAY_MAX_AGE_MINUTES = 30;
/** CoinGecko data trades 24/7; older than this counts as stale. */
export const CRYPTO_MAX_AGE_MINUTES = 30;

const NY_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** New York's UTC offset in minutes at an instant (e.g. -240 in summer). */
function newYorkOffsetMinutes(ms: number): number {
  const parts = NY_PARTS.formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** Convert a New York wall-clock time to an ISO instant. */
export function newYorkWallTimeToIso(y: number, mo: number, d: number, h: number, mi: number, s = 0): string | null {
  if (![y, mo, d, h, mi, s].every(Number.isFinite)) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  if (!Number.isFinite(guess)) return null;
  let ms = guess - newYorkOffsetMinutes(guess) * 60_000;
  const check = newYorkOffsetMinutes(ms);
  ms = guess - check * 60_000;
  return new Date(ms).toISOString();
}

/**
 * Parse Alpha Vantage's Eastern-time stamps into ISO:
 *  - "2026-09-25 16:15:59 US/Eastern" (TOP_GAINERS_LOSERS `last_updated`)
 *  - "2026-09-25 16:15:59" (no zone; Alpha Vantage times are Eastern)
 *  - "04:15 PM ET 09/25/2026" (SECTOR `Meta Data` → `Last Refreshed`)
 * Returns null when the text is missing or unrecognised.
 */
export function parseAlphaVantageEasternTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s+(?:US\/Eastern|ET|EST|EDT))?$/i);
  if (m) return newYorkWallTimeToIso(+m[1], +m[2], +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  m = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*(?:ET|EST|EDT)?\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/i);
  if (m) {
    let h = +m[1] % 12;
    if (m[3].toUpperCase() === 'PM') h += 12;
    return newYorkWallTimeToIso(+m[6], +m[4], +m[5], h, +m[2]);
  }
  return null;
}

/** CoinGecko `updated_at` (unix seconds) or `last_updated` (ISO) to ISO; null if absent. */
export function coinGeckoTimeToIso(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  return null;
}

/** "YYYY-MM-DD" when the text is a valid trading-day date; otherwise null. */
export function parseTradingDay(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** The oldest of several trading days (the whole set is only as current as its oldest quote). */
export function oldestTradingDay(days: Array<string | null | undefined>): string | null {
  const valid = days.filter((d): d is string => Boolean(d && parseTradingDay(d))).sort();
  return valid[0] ?? null;
}

function previousTradingDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d, 12));
  for (let i = 0; i < 15; i++) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!isNonTradingDay(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate())) break;
  }
  return cursor.toISOString().slice(0, 10);
}

/** The most recent US trading day whose regular session has opened, in New York time. */
export function latestOpenedTradingDay(now: Date = new Date()): string {
  const clock = createMarketClock(now);
  const today = clock.et.dateStr;
  if (clock.dayInfo.isTradingDay && clock.minutesSinceMidnight >= clock.dayInfo.openMinsET) return today;
  return previousTradingDay(today);
}

function newYorkDate(iso: string): string | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? createMarketClock(new Date(ms)).et.dateStr : null;
}

export interface EquityLayerTiming {
  asOf: string | null;
  cadenceMinutes?: number;
  stale: boolean;
}

/**
 * Freshness inputs for a US equity layer, for `assessSessionFreshness`:
 *  - data dated before the latest opened session is stale;
 *  - during the regular session a full as-of time must be within 30 minutes;
 *  - a date with no time can't prove it is current intraday, so recency stays unknown.
 */
export function equityLayerTiming(input: { asOf?: string | null; tradingDay?: string | null }, now: Date = new Date()): EquityLayerTiming {
  const asOf = input.asOf && Number.isFinite(Date.parse(input.asOf)) ? input.asOf : null;
  const day = parseTradingDay(input.tradingDay) ?? (asOf ? newYorkDate(asOf) : null);
  if (!day) return { asOf: null, stale: false };
  if (day < latestOpenedTradingDay(now)) return { asOf, stale: true };
  if (createMarketClock(now).isMarketOpen) {
    return asOf ? { asOf, cadenceMinutes: EQUITY_INTRADAY_MAX_AGE_MINUTES, stale: false } : { asOf: null, stale: false };
  }
  return { asOf, stale: false };
}
