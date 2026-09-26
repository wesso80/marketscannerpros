/**
 * SC-12 guard: one CoinGecko coin = at most one scanner row.
 *
 * If two universe symbols resolve to the same coin (e.g. 'UNI' and a stray 'AP' or 'UNIUSD'), both rows would carry
 * identical data under different tickers. Keep one canonical symbol per coin and report the others as aliases.
 * Canonical = the symbol whose known CoinGecko id (static map) is that coin, then a symbol without a quote-currency
 * suffix, then the first in universe order.
 */
const QUOTE_SUFFIX = /[-_/]?(USDT|USDC|USD)$/i;

export function findCryptoAliases(
  entries: Array<{ symbol: string; coinId?: string | null }>,
  knownIds: Record<string, string> = {},
): Map<string, string> {
  const byCoin = new Map<string, string[]>();
  for (const { symbol, coinId } of entries) {
    if (!coinId) continue;
    const list = byCoin.get(coinId) ?? [];
    if (!list.includes(symbol)) list.push(symbol);
    byCoin.set(coinId, list);
  }
  const aliasOf = new Map<string, string>();
  for (const [coinId, symbols] of byCoin) {
    if (symbols.length < 2) continue;
    const rank = (s: string) => (knownIds[s.toUpperCase()] === coinId ? 0 : 2) + (QUOTE_SUFFIX.test(s) ? 1 : 0);
    const canonical = [...symbols].sort((a, b) => rank(a) - rank(b) || symbols.indexOf(a) - symbols.indexOf(b))[0];
    for (const s of symbols) if (s !== canonical) aliasOf.set(s, canonical);
  }
  return aliasOf;
}
