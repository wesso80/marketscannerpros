/**
 * Mover universe-quality floor (live-review §M9).
 *
 * The most prominent Markets/Dashboard surfaces were dominated by non-investable
 * noise: $0 tickers, sub-dollar names, SPAC warrants/units, and nano-caps (e.g.
 * a headline "+138%" on a $2 shell). This applies a conservative liquidity/price
 * floor so headline surfaces show investable names.
 *
 * Uses PRICE + MARKET-CAP floors. The only ticker pattern is the Nasdaq fifth-letter
 * suffix (5 letters ending W/R/U = warrant/right/unit, OV-9); 4-letter tickers such as
 * SNOW are never matched. If the floor would remove every row, `filterMoversByFloor`
 * falls back to the unfiltered list so panels never go empty.
 *
 * `passesServerMoverFilter` is the ONE server-side filter /api/market-movers applies,
 * so the Market dashboard, Markets & sectors and Session overview all get the same list.
 *
 * Pure and dependency-free for testing/reuse.
 */

export interface MoverFloorItem {
  ticker: string;
  price?: string | number | null;
  change_percentage?: string | number | null;
  market_cap?: string | number | null;
  asset_class?: 'equity' | 'crypto';
}

export interface MoverFloorOptions {
  /** Minimum equity share price (default $1 — excludes sub-dollar shells). */
  minEquityPrice?: number;
  /** Minimum equity market cap in USD (default $100M — excludes nano-caps). */
  minEquityMarketCap?: number;
  /** Minimum crypto market cap in USD (default $50M — excludes meme nano-tokens). */
  minCryptoMarketCap?: number;
}

const DEFAULTS: Required<MoverFloorOptions> = {
  minEquityPrice: 1,
  minEquityMarketCap: 100_000_000,
  minCryptoMarketCap: 50_000_000,
};

/** Parse a numeric field that may be "$2.10", "1,234,567", "+3.4%", or a number. */
export function parseMoverNumber(v: string | number | null | undefined): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (v == null) return NaN;
  const n = parseFloat(String(v).replace(/[$,%+\s]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Does a mover clear the investability floor?
 * Rules:
 *  - price must be present and > 0 (excludes $0 / unpriced rows);
 *  - equities must be >= minEquityPrice and, when market cap is known, >= minEquityMarketCap;
 *  - crypto keeps sub-dollar prices (legit) but, when market cap is known, must be >= minCryptoMarketCap.
 * Market-cap checks only apply when a positive market cap is actually present, so
 * missing data never silently drops a row.
 */
export function passesMoverFloor(m: MoverFloorItem, options: MoverFloorOptions = {}): boolean {
  const opts = { ...DEFAULTS, ...options };
  const price = parseMoverNumber(m.price);
  if (!Number.isFinite(price) || price <= 0) return false;

  const mcap = parseMoverNumber(m.market_cap);
  const hasMcap = Number.isFinite(mcap) && mcap > 0;

  if (m.asset_class === 'crypto') {
    if (hasMcap && mcap < opts.minCryptoMarketCap) return false;
    return true;
  }

  // Default to equity rules.
  if (price < opts.minEquityPrice) return false;
  if (hasMcap && mcap < opts.minEquityMarketCap) return false;
  return true;
}

/**
 * Filter movers by the floor, but fall back to the original list if the floor
 * removes everything (a panel should never be empty just because market-cap data
 * was unavailable for every row).
 */
export function filterMoversByFloor<T extends MoverFloorItem>(movers: T[], options?: MoverFloorOptions): T[] {
  if (!movers?.length) return movers ?? [];
  const kept = movers.filter((m) => passesMoverFloor(m, options));
  return kept.length > 0 ? kept : movers;
}

/** Minimum session volume (shares) for an equity mover (OV-9). */
export const EQUITY_MOVER_MIN_VOLUME = 100_000;

/**
 * Nasdaq five-letter symbols whose fifth letter marks a warrant (W), right (R) or unit (U), e.g. PDYNW,
 * NTRBW. NYSE-style suffixes (".WS", "+", ".U") are already rejected by the plain-letters ticker check.
 */
export function isWarrantRightOrUnit(ticker: string): boolean {
  return /^[A-Z]{4}[WRU]$/.test(String(ticker ?? '').toUpperCase());
}

/**
 * Server-side mover filter (OV-9): equities drop warrants/rights/units, anything under the price floor
 * and anything under the volume floor; both asset classes apply the market-cap floor when a cap is known.
 * No fallback to the raw list: a thin day shows fewer rows rather than warrants.
 */
export function passesServerMoverFilter(
  m: MoverFloorItem & { volume?: string | number | null },
  options: MoverFloorOptions & { minEquityVolume?: number } = {},
): boolean {
  if (!passesMoverFloor(m, options)) return false;
  if (m.asset_class === 'crypto') return true;
  if (isWarrantRightOrUnit(m.ticker)) return false;
  const volume = parseMoverNumber(m.volume);
  return Number.isFinite(volume) && volume >= (options.minEquityVolume ?? EQUITY_MOVER_MIN_VOLUME);
}
