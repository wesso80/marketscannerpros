/**
 * Alpha Vantage `entitlement` for US equity data.
 *
 * MSP's US equities licence (Nasdaq, with Alpha Vantage's permission) is 15-minute DELAYED. Without an entitlement some
 * functions (TOP_GAINERS_LOSERS, GLOBAL_QUOTE) return end-of-day data "for all users"; `entitlement=delayed` returns the
 * 15-minute-delayed feed (https://www.alphavantage.co/documentation/#gainer-loser).
 */
export const AV_US_EQUITY_ENTITLEMENT = 'delayed' as const;

/** Query-string fragment to append to an Alpha Vantage URL, e.g. `...&apikey=K${avEquityEntitlementParam()}`. */
export function avEquityEntitlementParam(): string {
  return `&entitlement=${AV_US_EQUITY_ENTITLEMENT}`;
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
