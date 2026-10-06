import { getDerivativesTickers, type DerivativeTicker } from '@/lib/coingecko';

/** Matches the derivatives client's quote window. A quote older than this is left out, not treated as zero. */
export const OI_QUOTE_MAX_AGE_MS = 15 * 60_000;
export const OPEN_INTEREST_FEED = 'CoinGecko derivatives';
/** The percent is not a change in the all-venue total. */
export const FIXED_BASKET_CHANGE_LABEL = '24h change on the fixed contract basket, not this total';

/** Coins already shown on the open-interest and crypto-derivatives feeds. */
export const SHOWN_DERIVATIVE_COINS = [
  'BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'DOGE', 'ADA', 'AVAX',
  'DOT', 'LINK', 'NEAR', 'LTC', 'UNI', 'ATOM', 'ARB', 'OP',
  'APT', 'TON', 'SHIB', 'TRX',
] as const;

export type OpenInterestTotal = {
  symbol: string;
  totalUsd: number | null;
  exchanges: number;
  observedAt: string | null;
  sourceLabel: string;
};

export type OpenInterestHeadline = {
  totalUsd: number | null;
  exchanges: number;
  observedAt: string | null;
  sourceLabel: string;
};

type TickerLike = Pick<DerivativeTicker, 'market' | 'symbol' | 'index_id' | 'contract_type' | 'open_interest' | 'last_traded_at'>;

export function openInterestSourceLabel(exchanges: number): string {
  if (!(exchanges > 0)) return OPEN_INTEREST_FEED;
  return `${OPEN_INTEREST_FEED} · ${exchanges} ${exchanges === 1 ? 'exchange' : 'exchanges'}`;
}

function coinCode(symbol: string): string {
  return symbol.toUpperCase().replace(/USDT$/, '');
}

/**
 * Perpetual open interest summed across every venue in the ticker list.
 * A missing feed, a stale quote, or a non-finite reading is left out.
 * When nothing usable remains, totalUsd is null — never 0.
 */
export function sumOpenInterestTotals(
  tickers: readonly TickerLike[] | null | undefined,
  symbols: readonly string[],
  now = Date.now(),
): OpenInterestTotal[] {
  const wanted = [...new Set(symbols.map(coinCode).filter((symbol) => symbol.length > 0))];
  return wanted.map((symbol) => {
    const empty: OpenInterestTotal = {
      symbol,
      totalUsd: null,
      exchanges: 0,
      observedAt: null,
      sourceLabel: openInterestSourceLabel(0),
    };
    if (!tickers?.length) return empty;
    const contracts = new Map<string, { market: string; oi: number; at: number }>();
    for (const ticker of tickers) {
      if (ticker.contract_type !== 'perpetual') continue;
      if ((ticker.index_id || '').toUpperCase() !== symbol) continue;
      const market = ticker.market?.trim() ?? '';
      const contract = ticker.symbol?.trim() ?? '';
      const oi = ticker.open_interest;
      const at = ticker.last_traded_at;
      if (!market || !contract) continue;
      if (typeof oi !== 'number' || !Number.isFinite(oi) || !(oi > 0)) continue;
      if (typeof at !== 'number' || !Number.isFinite(at) || !(at > 0)) continue;
      const ageMs = now - at * 1000;
      if (ageMs < -60_000 || ageMs > OI_QUOTE_MAX_AGE_MS) continue;
      const key = `${market}|${contract}`;
      const previous = contracts.get(key);
      if (!previous || at > previous.at) contracts.set(key, { market, oi, at });
    }
    if (!contracts.size) return empty;
    let totalUsd = 0;
    let earliest = Infinity;
    const markets = new Set<string>();
    for (const row of contracts.values()) {
      totalUsd += row.oi;
      earliest = Math.min(earliest, row.at);
      markets.add(row.market);
    }
    const exchanges = markets.size;
    return {
      symbol,
      totalUsd,
      exchanges,
      observedAt: new Date(earliest * 1000).toISOString(),
      sourceLabel: openInterestSourceLabel(exchanges),
    };
  });
}

/** Sum of the coins that have a total. Coins without a total are left out, not added as 0. */
export function headlineOpenInterest(rows: readonly OpenInterestTotal[] | null): OpenInterestHeadline {
  const empty: OpenInterestHeadline = {
    totalUsd: null,
    exchanges: 0,
    observedAt: null,
    sourceLabel: openInterestSourceLabel(0),
  };
  if (!rows?.length) return empty;
  const present = rows.filter((row): row is OpenInterestTotal & { totalUsd: number } => row.totalUsd != null && Number.isFinite(row.totalUsd));
  if (!present.length) return { ...empty, sourceLabel: rows[0]?.sourceLabel ?? empty.sourceLabel };
  const labels = new Set(present.map((row) => row.sourceLabel));
  const observed = present.map((row) => row.observedAt).filter((at): at is string => Boolean(at)).sort();
  return {
    totalUsd: present.reduce((sum, row) => sum + row.totalUsd, 0),
    exchanges: labels.size === 1 ? present[0].exchanges : 0,
    observedAt: observed[0] ?? null,
    sourceLabel: labels.size === 1 ? present[0].sourceLabel : openInterestSourceLabel(0),
  };
}

/**
 * All-venue perpetual total from the existing CoinGecko derivatives client.
 * Returns null when that client fails. It does not substitute 0 or the fixed basket.
 */
export async function getOpenInterestTotals(symbols: readonly string[], now = Date.now()): Promise<OpenInterestTotal[] | null> {
  try {
    const tickers = await getDerivativesTickers();
    if (tickers == null) return null;
    return sumOpenInterestTotals(tickers, symbols, now);
  } catch {
    return null;
  }
}
