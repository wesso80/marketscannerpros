/**
 * Crypto alert prices: one CoinGecko /simple/price call per chunk.
 *
 * Symbols are stripped the way the old client did (BTC-USD → BTC) before the
 * coin map. FTM and MATIC use their current ids for alerts only.
 * A ticker that is not in the map is searched once and cached (Redis, 7 days,
 * or the in-process map when Redis is absent). An equity ticker is never searched.
 * An exact symbol match with the best market-cap rank wins. A tie stays unresolved.
 *
 * Before: one /simple/price per symbol (41 × 288 runs ≈ 11,808/day).
 * After: one batched call per run for the mapped set, plus at most one search
 * per coin that is not cached yet.
 */
import { COINGECKO_ID_MAP, getSimplePrices, searchCoins, type CoinGeckoPrice } from '@/lib/coingecko';
import { resolveScanAsset } from '@/lib/symbols/assetResolution';
import { equityTickerList, equityTickerSet } from '@/lib/symbols/equityTickers';
import { getRedis } from '@/lib/redis';

export const ALERT_CG_CHUNK = 100;
export const ALERT_COIN_SEARCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PRICE_UNAVAILABLE = 'Price unavailable for this symbol';

/** Alert pricing only. Outcome labelling does not use this. */
export const ALERT_COIN_ID_OVERRIDE: Readonly<Record<string, string>> = {
  FTM: 'sonic',
  MATIC: 'polygon-ecosystem-token',
};

const CACHE_PREFIX = 'cg:alert-coin:';
const memoryCoinCache = new Map<string, { id: string | null; expiresAt: number }>();

export type AlertCryptoSkip = { symbol: string; reason: string; detail: string };
export type AlertCryptoQuote = { price: number; change24h: number };
export type SearchCoin = { id: string; name: string; symbol: string; market_cap_rank: number | null };

export type AlertCryptoResolution =
  | { action: 'price'; symbol: string; coinId: string }
  | { action: 'search'; symbol: string }
  | { action: 'skip'; symbol: string; detail: string };

/** BTC-USD, BTC/USD, BTCUSDT, and BTC all become BTC. */
export function alertSymbolKey(symbol: string): string {
  const compact = symbol.toUpperCase().trim().replace(/[-_/]/g, '');
  const stripped = compact.replace(/USDT$/, '').replace(/USDC$/, '').replace(/USD$/, '');
  return stripped.length >= 2 ? stripped : compact;
}

export function mapAlertCoinId(
  symbol: string,
  equitySymbols: readonly string[],
  coinMap: Readonly<Record<string, string>>,
): AlertCryptoResolution {
  const key = alertSymbolKey(symbol);
  const coinId = ALERT_COIN_ID_OVERRIDE[key] || coinMap[key] || '';
  const asset = resolveScanAsset({
    symbol: key,
    market: 'CRYPTO',
    inCryptoMap: Boolean(coinId),
    equitySymbols,
  });
  if (asset.status === 'ambiguous' || equitySymbols.some((row) => alertSymbolKey(row) === key)) {
    const detail = asset.status === 'ambiguous' ? asset.reason : `${key} is an equity ticker`;
    return { action: 'skip', symbol: key, detail };
  }
  if (coinId) return { action: 'price', symbol: key, coinId };
  return { action: 'search', symbol: key };
}

/** Exact symbol only. Best (lowest) market-cap rank wins. Equal best ranks stay unresolved. */
export function pickAlertSearchId(symbol: string, coins: readonly SearchCoin[]): string | null {
  const key = alertSymbolKey(symbol);
  const exact = coins.filter((coin) => alertSymbolKey(String(coin.symbol || '')) === key && coin.id);
  if (exact.length === 0) return null;
  const ranked = exact.map((coin) => ({
    id: coin.id,
    rank: coin.market_cap_rank != null && coin.market_cap_rank > 0 ? coin.market_cap_rank : Number.POSITIVE_INFINITY,
  }));
  ranked.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
  if (ranked.length > 1 && ranked[0].rank === ranked[1].rank) return null;
  return ranked[0].id;
}

export function chunkCoinIds(ids: string[], size = ALERT_CG_CHUNK): string[][] {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const step = Math.max(1, size);
  const out: string[][] = [];
  for (let i = 0; i < unique.length; i += step) out.push(unique.slice(i, i + step));
  return out;
}

type PriceMap = Record<string, CoinGeckoPrice> | null;

async function readCoinCache(symbol: string, now: number): Promise<string | null | undefined> {
  const local = memoryCoinCache.get(symbol);
  if (local && local.expiresAt > now) return local.id;
  const redis = getRedis();
  if (!redis) return undefined;
  try {
    const raw = await redis.get<string>(`${CACHE_PREFIX}${symbol}`);
    if (raw == null) return undefined;
    const id = raw === '' ? null : String(raw);
    memoryCoinCache.set(symbol, { id, expiresAt: now + ALERT_COIN_SEARCH_TTL_MS });
    return id;
  } catch {
    return undefined;
  }
}

async function writeCoinCache(symbol: string, id: string | null, now: number): Promise<void> {
  memoryCoinCache.set(symbol, { id, expiresAt: now + ALERT_COIN_SEARCH_TTL_MS });
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(`${CACHE_PREFIX}${symbol}`, id ?? '', { ex: Math.floor(ALERT_COIN_SEARCH_TTL_MS / 1000) });
  } catch {
    /* The in-process copy still stops a second search in this process. */
  }
}

export function clearAlertCoinCacheForTests(): void {
  memoryCoinCache.clear();
}

export async function fetchAlertCryptoQuotes(
  symbols: string[],
  deps: {
    coinMap?: Readonly<Record<string, string>>;
    equitySymbols?: readonly string[];
    chunkSize?: number;
    now?: number;
    getPrices?: (ids: string[]) => Promise<PriceMap>;
    search?: (symbol: string) => Promise<{ coins: SearchCoin[] } | null>;
    cache?: {
      get: (symbol: string) => Promise<string | null | undefined>;
      set: (symbol: string, id: string | null) => Promise<void>;
    };
  } = {},
): Promise<{ quotes: Record<string, AlertCryptoQuote>; skipped: AlertCryptoSkip[]; calls: number; searches: number }> {
  if (symbols.length === 0) return { quotes: {}, skipped: [], calls: 0, searches: 0 };
  const coinMap = deps.coinMap ?? COINGECKO_ID_MAP;
  const equitySymbols = deps.equitySymbols ?? equityTickerList();
  const getPrices = deps.getPrices ?? ((ids) => getSimplePrices(ids, { include_24h_change: true }));
  const search = deps.search ?? (async (symbol: string) => {
    const found = await searchCoins(symbol);
    return found ? { coins: found.coins } : null;
  });
  const now = deps.now ?? Date.now();
  const cache = deps.cache ?? {
    get: (symbol: string) => readCoinCache(symbol, now),
    set: (symbol: string, id: string | null) => writeCoinCache(symbol, id, now),
  };

  const quotes: Record<string, AlertCryptoQuote> = {};
  const skipped: AlertCryptoSkip[] = [];
  const idToSymbols = new Map<string, string[]>();
  let searches = 0;
  const seen = new Set<string>();

  for (const raw of symbols) {
    const resolved = mapAlertCoinId(raw, equitySymbols, coinMap);
    if (seen.has(resolved.symbol)) continue;
    seen.add(resolved.symbol);
    if (resolved.action === 'skip') {
      skipped.push({ symbol: resolved.symbol, reason: PRICE_UNAVAILABLE, detail: resolved.detail });
      continue;
    }
    let coinId = resolved.action === 'price' ? resolved.coinId : '';
    if (resolved.action === 'search') {
      const cached = await cache.get(resolved.symbol);
      if (cached !== undefined) {
        coinId = cached ?? '';
        if (!coinId) {
          skipped.push({ symbol: resolved.symbol, reason: PRICE_UNAVAILABLE, detail: `${resolved.symbol} stayed unresolved in the coin cache` });
          continue;
        }
      } else {
        searches += 1;
        const found = await search(resolved.symbol);
        const picked = pickAlertSearchId(resolved.symbol, found?.coins ?? []);
        await cache.set(resolved.symbol, picked);
        if (!picked) {
          skipped.push({ symbol: resolved.symbol, reason: PRICE_UNAVAILABLE, detail: `${resolved.symbol} has no single exact coin match` });
          continue;
        }
        coinId = picked;
      }
    }
    const list = idToSymbols.get(coinId) ?? [];
    if (!list.includes(resolved.symbol)) list.push(resolved.symbol);
    idToSymbols.set(coinId, list);
  }

  const chunks = chunkCoinIds([...idToSymbols.keys()], deps.chunkSize ?? ALERT_CG_CHUNK);
  let calls = 0;
  const priced = new Set<string>();
  for (const ids of chunks) {
    calls += 1;
    let prices: PriceMap = null;
    try {
      prices = await getPrices(ids);
    } catch {
      prices = null;
    }
    if (!prices) continue;
    for (const id of ids) {
      const point = prices[id];
      if (!point || !Number.isFinite(point.usd)) continue;
      for (const symbol of idToSymbols.get(id) ?? []) {
        quotes[symbol] = { price: point.usd, change24h: Number.isFinite(point.usd_24h_change) ? Number(point.usd_24h_change) : 0 };
        priced.add(symbol);
      }
    }
  }
  for (const [id, names] of idToSymbols) {
    for (const symbol of names) {
      if (priced.has(symbol)) continue;
      skipped.push({ symbol, reason: PRICE_UNAVAILABLE, detail: `${symbol} (${id}) was missing from the batch price response` });
    }
  }
  return { quotes, skipped, calls, searches };
}

/** Read-only. id, symbol, and type only. */
export function affectedCryptoAlertsSql(
  coinMap: Readonly<Record<string, string>> = { ...COINGECKO_ID_MAP, ...ALERT_COIN_ID_OVERRIDE },
  equitySymbols: readonly string[] = [...equityTickerSet()],
): string {
  const sqlList = (values: string[]) => values.map((value) => `'${value.replace(/'/g, '')}'`).join(', ');
  const equity = [...new Set(equitySymbols.map((symbol) => alertSymbolKey(symbol)))].sort();
  const coins = [...new Set(Object.keys(coinMap).map((symbol) => alertSymbolKey(symbol)))].sort();
  const base = `upper(regexp_replace(symbol, '[-_/]?(USDT|USDC|USD)$', '', 'i'))`;
  return `SELECT id, symbol, asset_type AS type
FROM alerts
WHERE lower(asset_type) = 'crypto'
  AND (
    ${base} IN (${sqlList(equity)})
    OR ${base} NOT IN (${sqlList(coins)})
  );`;
}
