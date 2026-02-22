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
  'aztec', 'orca', 'grk', 'io', 'drea', 'rndr',
]);

function normalizeSymbol(raw: string): string {
  let s = raw.toUpperCase().trim();
  s = s.replace(/[-_/]?USDT?$/i, '');
  s = s.replace(/[-_/]?EUR$/i, '');
  s = s.replace(/[-_/]?PERP$/i, '');
  return s;
}

function isLikelyCrypto(symbol: string): boolean {
  const s = normalizeSymbol(symbol).toLowerCase();
  if (CRYPTO_SYMBOLS.has(s)) return true;
  // Symbols ending with -USD or containing USD hint at crypto
  if (symbol.toUpperCase().includes('USD')) return true;
  // Short symbols (1-3 chars) default to crypto
  if (s.length <= 3) return true;
  return false;
}

async function fetchPrice(symbol: string): Promise<number | null> {
  const s = normalizeSymbol(symbol);
  const isCrypto = isLikelyCrypto(symbol);
  const type = isCrypto ? 'crypto' : 'stock';

  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=${type}&market=USD&_t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.ok && typeof json.price === 'number') return json.price;
  } catch { /* ignore */ }

  // Fallback: try the other type
  const fallbackType = isCrypto ? 'stock' : 'crypto';
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(s)}&type=${fallbackType}&market=USD&_t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.ok && typeof json.price === 'number') return json.price;
  } catch { /* ignore */ }

  return null;
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

  // Deduplicate open trade symbols
  const openSymbols = Array.from(
    new Set(
      trades
        .filter((t) => t.status === 'open')
        .map((t) => normalizeSymbol(t.symbol))
        .filter((s) => s.length > 0)
    )
  );

  const refreshPrices = useCallback(async () => {
    if (openSymbols.length === 0) return;
    setLoading(true);

    const newPrices: LivePriceMap = { ...prices };
    // Fetch in batches of 5 to avoid rate limits
    for (let i = 0; i < openSymbols.length; i += 5) {
      const batch = openSymbols.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(async (sym) => {
          const price = await fetchPrice(sym);
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
