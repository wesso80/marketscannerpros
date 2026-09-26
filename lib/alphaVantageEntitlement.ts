/**
 * Alpha Vantage `entitlement` for US equity data.
 *
 * MSP's Alpha Vantage commercial agreement covers REALTIME display of US equities (confirmed by brad, 26 Sep 2026).
 * The key accepts `entitlement=realtime` (GLOBAL_QUOTE, REALTIME_BULK_QUOTES, TOP_GAINERS_LOSERS, REALTIME_OPTIONS_FMV)
 * and refuses `entitlement=delayed`. Without an entitlement some functions return end-of-day data "for all users"
 * (https://www.alphavantage.co/documentation/#gainer-loser).
 */
import { isUsRegularSessionOpen } from '@/lib/time/usSession';

export { isUsRegularSessionOpen };

export const AV_US_EQUITY_ENTITLEMENT = 'realtime' as const;

/** Query-string fragment to append to an Alpha Vantage URL, e.g. `...&apikey=K${avEquityEntitlementParam()}`. */
export function avEquityEntitlementParam(): string {
  return `&entitlement=${AV_US_EQUITY_ENTITLEMENT}`;
}

/**
 * Basis label for the equity movers list: the realtime feed ("Market closed" outside the regular session, since the
 * list is then the last session's), or the end-of-day fallback (OV-14). Pair it with the as-of time.
 */
export function equityMoversBasisLabel(feed: string | null | undefined, nowMs: number = Date.now()): string {
  if (feed === 'end_of_day') return 'End of day';
  if (feed === 'unavailable') return 'Unavailable';
  return isUsRegularSessionOpen(nowMs) ? 'Realtime' : 'Market closed';
}

/** Movers "Data" chip: crypto is live (CoinGecko); equities follow the Alpha Vantage feed actually received (OV-21). */
export function moversDataChipLabel(feed: string | null | undefined, nowMs: number = Date.now()): string {
  const equities = feed === 'end_of_day' ? 'equities end of day'
    : feed === 'unavailable' ? 'equities unavailable'
    : isUsRegularSessionOpen(nowMs) ? 'equities realtime' : 'equities market closed';
  return `Crypto live · ${equities}`;
}

/**
 * "as of 15:45 ET" for a provider timestamp (ISO). Adds the New York date when it is not the same New York day as `nowMs`
 * ("as of 16:15 ET, Fri 25 Sep"). Returns null for missing/invalid input.
 */
export function formatEasternAsOf(iso: string | null | undefined, nowMs: number = Date.now()): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const tz = 'America/New_York';
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(ms);
  const day = (t: number) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
  if (day(ms) === day(nowMs)) return `as of ${time} ET`;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' })
    .formatToParts(ms).map((p) => [p.type, p.value]));
  return `as of ${time} ET, ${parts.weekday} ${parts.day} ${parts.month}`;
}
