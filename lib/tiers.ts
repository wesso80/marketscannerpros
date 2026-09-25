/**
 * The ONE place that decides whether a tier is paid.
 *
 * MarketScannerPros has exactly two access levels: Free and Pro.
 * `pro_trader` is a legacy tier value (old subscribers / old cookies / DB rows) and is treated as Pro.
 * Admins get everything (see `hasPaidSessionAccess` in lib/proTraderAccess.ts for the server-side rule).
 *
 * Client-safe (no server imports). Use `isPaidTier` for every paid gate — never compare against
 * 'pro_trader' directly, so a Pro-Trader-only gate can't creep back in.
 */
export const PAID_PLAN_NAME = 'Pro';

export function isPaidTier(tier: string | null | undefined): boolean {
  return tier === 'pro' || tier === 'pro_trader';
}

/** Watchlist allowances. Pro gets what the retired Pro Trader plan had. */
export const WATCHLIST_LIMITS = {
  free: { watchlists: 3, items: 10 },
  pro: { watchlists: 100, items: 500 },
} as const;

export function watchlistLimitsFor(paid: boolean): { watchlists: number; items: number } {
  return paid ? WATCHLIST_LIMITS.pro : WATCHLIST_LIMITS.free;
}
