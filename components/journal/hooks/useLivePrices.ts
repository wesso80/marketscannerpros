'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TradeRowModel } from '@/types/journal';

/** Map of symbol → latest price. Updated periodically for open trades. */
export type LivePriceMap = Record<string, number>;

const REFRESH_INTERVAL_MS = 60_000; // 60 seconds

/** Known crypto symbols — lowercase set for fast lookup */
const CRYPTO_SYMBOLS = new Set([
  'btc', 'eth', 'xrp', 'sol', 'ada', 'doge', 'dot', 'avax', 'matic', 'link',
  'uni', 'atom', 'ltc', 'bch', 'xlm', 'algo', 'vet', 'fil', 'aave', 'eos',
  'xtz', 'theta', 'xmr', 'neo', 'mkr', 'comp', 'snx', 'sushi', 'yfi', 'crv',
  'bal', 'ren', '1inch', 'grt', 'enj', 'mana', 'sand', 'axs', 'chz', 'hbar',
  'ftm', 'near', 'egld', 'flow', 'icp', 'ar', 'hnt', 'stx', 'ksm', 'zec',
  'dash', 'waves', 'kava', 'celo', 'bnb', 'shib', 'pepe', 'wif', 'bonk',
  'floki', 'ape', 'imx', 'op', 'arb', 'sui', 'sei', 'tia', 'inj', 'fet',
  'rndr', 'render', 'jup', 'kas', 'xcn', 'pyth', 'pendle', 'blur', 'om',
  'aztec', 'orca', 'grk', 'io', 'drea', 'kite', 'cat', 'grx', 'dm',
  'apt', 'ton', 'trx', 'ondo', 'wld', 'jto', 'mew', 'popcat', 'ray',
  'msol', 'jito', 'w', 'zro', 'strk', 'manta', 'alt', 'pixel', 'aevo',
]);

/** Known equity tickers that collide with crypto symbols */
const EQUITY_TICKERS = new Set([
  'kite', 'cat', 'grx', 'dm', 'orca', 'om', 'ar', 'flow', 'sand', 'neo',
]);

function normalizeSymbol(raw: string): string {
  let s = raw.toUpperCase().trim();
  s = s.replace(/[-_/]?USDT?$/i, '');
  s = s.replace(/[-_/]?EUR$/i, '');
  s = s.replace(/[-_/]?PERP$/i, '');
  return s;
}

/**
 * Determine whether a trade should fetch crypto vs stock prices.
 * Uses: 1) explicit assetClass from trade, 2) symbol suffix heuristic, 3) symbol set.
 * NEVER falls back to the other asset type — prevents cross-contamination.
 */
function resolveTradeType(trade: { symbol: string; assetClass?: string }): 'crypto' | 'stock' {
  // 1. Trust the explicit assetClass from the journal entry
  if (trade.assetClass === 'crypto') return 'crypto';
  if (trade.assetClass === 'equity') return 'stock';
  if (trade.assetClass === 'forex') return 'stock'; // handled via FX but stock fallback
  if (trade.assetClass === 'commodity') return 'stock';

  // 2. Symbol suffix: -USD, -USDT, /USD, _USD → crypto pair
  const upper = trade.symbol.toUpperCase().trim();
  if (/[-_/](USDT?|EUR|PERP)$/i.test(upper)) return 'crypto';

  // 3. Known crypto symbol
  const base = normalizeSymbol(trade.symbol).toLowerCase();
  if (CRYPTO_SYMBOLS.has(base)) return 'crypto';

  // 4. Default to stock (equities are the safe default — no fallback)
  return 'stock';
}

async function fetchPrice(symbol: string, type: 'crypto' | 'stock'): Promise<number | null> {
  const s = normalizeSymbol(symbol);

  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=${type}&market=USD&_t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.ok && typeof json.price === 'number') return json.price;
  } catch { /* ignore */ }

  // NO FALLBACK to the other type — prevents cross-contamination
  // (e.g. crypto KITE-USD falling back to equity KITE at $179)
  return null;
}

/**
 * Sanity check: reject prices wildly inconsistent with entry.
 * If fetched price is >50x or <0.02x the entry, something is wrong.
 */
function isSanePrice(fetchedPrice: number, entryPrice: number): boolean {
  if (entryPrice <= 0 || fetchedPrice <= 0) return true; // can't validate
  const ratio = fetchedPrice / entryPrice;
  return ratio < 50 && ratio > 0.02;
}

/**
 * Fetches live prices for all open trades' symbols.
 * Returns a LivePriceMap keyed by normalized uppercase symbol.
 * Refreshes every 60 seconds while open trades exist.
 */
export function useLivePrices(trades: TradeRowModel[]): {
  prices: LivePriceMap;
  loading: boolean;
  lastUpdated: Date | null;
} {
  const [prices, setPrices] = useState<LivePriceMap>({});
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Build a map of symbol → resolved type using trade assetClass
  const openTrades = trades.filter((t) => t.status === 'open');
  const tradeTypeMap = new Map<string, 'crypto' | 'stock'>();
  for (const t of openTrades) {
    const sym = normalizeSymbol(t.symbol);
    if (!tradeTypeMap.has(sym)) {
      tradeTypeMap.set(sym, resolveTradeType({ symbol: t.symbol, assetClass: t.assetClass }));
    }
  }
  const openSymbols = Array.from(tradeTypeMap.keys());

  const refreshPrices = useCallback(async () => {
    if (openSymbols.length === 0) return;
    setLoading(true);

    const newPrices: LivePriceMap = { ...prices };
    // Fetch in batches of 5 to avoid rate limits
    for (let i = 0; i < openSymbols.length; i += 5) {
      const batch = openSymbols.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (sym) => {
          const type = tradeTypeMap.get(sym) || 'stock';
          const price = await fetchPrice(sym, type);
          return { sym, price };
        })
      );
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.price !== null) {
          newPrices[result.value.sym] = result.value.price;
        }
      }
    }

    setPrices(newPrices);
    setLastUpdated(new Date());
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSymbols.join(',')]);

  useEffect(() => {
    if (openSymbols.length === 0) return;

    // Initial fetch
    void refreshPrices();

    // Set up periodic refresh
    intervalRef.current = setInterval(() => {
      void refreshPrices();
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSymbols.join(',')]);

  return { prices, loading, lastUpdated };
}

/**
 * Enriches trade rows with live price data:
 *  - Open trades get a `livePrice` property
 *  - P&L is recalculated from live price
 *  - R-multiple is recalculated if stop exists
 *
 * Includes sanity check: rejects prices wildly inconsistent with entry
 * to prevent cross-contamination (e.g. equity KITE at $179 vs crypto KITE-USD at $0.24).
 */
export function enrichTradesWithLivePrices(
  trades: TradeRowModel[],
  prices: LivePriceMap,
): TradeRowModel[] {
  return trades.map((trade) => {
    if (trade.status !== 'open') return trade;

    const sym = normalizeSymbol(trade.symbol);
    const livePrice = prices[sym];
    if (livePrice == null || livePrice <= 0) return trade;

    const entry = trade.entry.price;
    if (!entry || entry <= 0) return trade;

    // Sanity check: reject prices that are wildly inconsistent with entry
    if (!isSanePrice(livePrice, entry)) return trade;

    const qty = trade.qty || 0;
    const isLong = trade.side === 'long';

    const pnlUsd = isLong
      ? (livePrice - entry) * qty
      : (entry - livePrice) * qty;
    const pnlPct = ((livePrice - entry) / entry) * 100 * (isLong ? 1 : -1);

    let rMultiple = trade.rMultiple;
    if (trade.stop != null && trade.stop > 0) {
      const riskPerUnit = Math.abs(entry - trade.stop);
      rMultiple = riskPerUnit > 0 ? (isLong ? (livePrice - entry) : (entry - livePrice)) / riskPerUnit : undefined;
    }

    return {
      ...trade,
      exit: { price: livePrice, ts: new Date().toISOString() },
      pnlUsd,
      pnlPct,
      rMultiple,
      _isLive: true, // marker to distinguish from actual exits
    } as TradeRowModel & { _isLive?: boolean };
  });
}
