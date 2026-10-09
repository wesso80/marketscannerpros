/**
 * Crypto alert prices: one CoinGecko /simple/price call per chunk, explicit coin ids only.
 *
 * Before: alerts-price-check called getPriceBySymbol once per symbol. That is one
 * /simple/price request each, and an unmapped ticker fell through to /search
 * (CVX → Convex Finance). 41 symbols × 288 runs/day ≈ 11,808 price calls/day.
 *
 * After: unique symbols are resolved from COINGECKO_ID_MAP, then fetched in chunks
 * of ALERT_CG_CHUNK (100). 41 symbols = 1 call/run = 288 calls/day.
 * getSimplePrices keeps its 30 second cache (next.revalidate).
 * Ambiguous or unmapped tickers are skipped. Nothing here writes alert rows.
 */
import { COINGECKO_ID_MAP, getSimplePrices, type CoinGeckoPrice } from '@/lib/coingecko';
import { resolveScanAsset, symbolBase } from '@/lib/symbols/assetResolution';
import { equityTickerList, equityTickerSet } from '@/lib/symbols/equityTickers';

/** CoinGecko accepts a long ids list; 100 keeps the URL small and is one call for the live alert set (~41). */
export const ALERT_CG_CHUNK = 100;

export type AlertCryptoSkip = { symbol: string; reason: string };
export type AlertCryptoQuote = { price: number; change24h: number };

export type AlertCryptoResolution =
  | { action: 'price'; symbol: string; coinId: string }
  | { action: 'skip'; symbol: string; reason: string };

export function resolveAlertCryptoSymbol(
  symbol: string,
  equitySymbols: readonly string[],
  coinMap: Readonly<Record<string, string>>,
): AlertCryptoResolution {
  const base = symbolBase(symbol);
  const coinId = coinMap[symbol.trim().toUpperCase()] || coinMap[base] || '';
  const asset = resolveScanAsset({
    symbol,
    market: 'CRYPTO',
    inCryptoMap: Boolean(coinId),
    equitySymbols,
  });
  if (asset.status === 'ambiguous') {
    return { action: 'skip', symbol: base, reason: `${asset.reason}; not priced` };
  }
  if (!coinId) {
    return { action: 'skip', symbol: base, reason: `${base} is not in the coin map; not priced` };
  }
  return { action: 'price', symbol: base, coinId };
}

export function chunkCoinIds(ids: string[], size = ALERT_CG_CHUNK): string[][] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const step = Math.max(1, size);
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += step) out.push(unique.slice(i, i + step));
  return out;
}

type PriceMap = Record<string, CoinGeckoPrice> | null;

export async function fetchAlertCryptoQuotes(
  symbols: string[],
  deps: {
    coinMap?: Readonly<Record<string, string>>;
    equitySymbols?: readonly string[];
    chunkSize?: number;
    getPrices?: (ids: string[]) => Promise<PriceMap>;
  } = {},
): Promise<{ quotes: Record<string, AlertCryptoQuote>; skipped: AlertCryptoSkip[]; calls: number }> {
  const coinMap = deps.coinMap ?? COINGECKO_ID_MAP;
  const equitySymbols = deps.equitySymbols ?? equityTickerList();
  const getPrices = deps.getPrices ?? ((ids) => getSimplePrices(ids, { include_24h_change: true }));
  const quotes: Record<string, AlertCryptoQuote> = {};
  const skipped: AlertCryptoSkip[] = [];
  const idToSymbols = new Map<string, string[]>();

  for (const raw of symbols) {
    const resolved = resolveAlertCryptoSymbol(raw, equitySymbols, coinMap);
    if (resolved.action === 'skip') {
      if (!skipped.some((row) => row.symbol === resolved.symbol)) skipped.push({ symbol: resolved.symbol, reason: resolved.reason });
      continue;
    }
    const list = idToSymbols.get(resolved.coinId) ?? [];
    if (!list.includes(resolved.symbol)) list.push(resolved.symbol);
    idToSymbols.set(resolved.coinId, list);
  }

  const chunks = chunkCoinIds([...idToSymbols.keys()], deps.chunkSize ?? ALERT_CG_CHUNK);
  let calls = 0;
  for (const ids of chunks) {
    calls += 1;
    const prices = await getPrices(ids);
    if (!prices) continue;
    for (const id of ids) {
      const point = prices[id];
      if (!point || !Number.isFinite(point.usd)) continue;
      for (const symbol of idToSymbols.get(id) ?? []) {
        quotes[symbol] = { price: point.usd, change24h: Number.isFinite(point.usd_24h_change) ? Number(point.usd_24h_change) : 0 };
      }
    }
  }
  return { quotes, skipped, calls };
}

/** Read-only. id, symbol, and type only. Lists crypto alerts that this checker will skip. */
export function affectedCryptoAlertsSql(
  coinMap: Readonly<Record<string, string>> = COINGECKO_ID_MAP,
  equitySymbols: readonly string[] = [...equityTickerSet()],
): string {
  const sqlList = (values: string[]) => values.map((value) => `'${value.replace(/'/g, '')}'`).join(', ');
  const equity = [...new Set(equitySymbols.map((symbol) => symbolBase(symbol)))].sort();
  const coins = [...new Set(Object.keys(coinMap).map((symbol) => symbolBase(symbol)))].sort();
  return `SELECT id, symbol, asset_type AS type
FROM alerts
WHERE lower(asset_type) = 'crypto'
  AND (
    upper(symbol) IN (${sqlList(equity)})
    OR upper(symbol) NOT IN (${sqlList(coins)})
  );`;
}
