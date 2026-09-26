import { COINGECKO_ID_MAP, symbolToId } from '@/lib/coingecko';
import { mentionsCompany } from '@/lib/equityNewsRelevance';

/**
 * Crypto relevance check for the CoinGecko news feed.
 *
 * CoinGecko's general /news feed (no coin_id) mixes in general-market and political stories (e.g. "NetApp (NTAP)
 * Stock…", a Maine Senate race). Its `related_coin_ids` can't be used to filter: they are auto-tagged from ordinary
 * words (CoinGecko's own example tags an EU cloud-tender story with `could` and `union-2`). So a news item counts as
 * crypto-relevant only if its title names crypto explicitly. Guides are CoinGecko's own coin-specific explainers
 * and always pass.
 */

const CRYPTO_TERMS = [
  // General
  'crypto\\w*', 'blockchains?', 'stablecoins?', 'altcoins?', 'memecoins?', 'meme ?coins?', 'defi', 'nfts?', 'web3',
  'tokeni[sz]ation', 'tokeni[sz]ed', 'tokens?', 'on-?chain', 'airdrops?', 'hash ?rate', 'cbdcs?', 'satoshi',
  'digital assets?', 'layer[- ]?[12]',
  // Major networks and tokens
  // (Everyday words that double as coin names — ripple, avalanche, optimism, stellar, DOGE the US department — are
  // left out so they can't let unrelated stories through.)
  'bitcoin\\w*', 'btc', 'ethereum', 'ether', 'eth', 'solana', 'xrp', 'bnb', 'cardano', 'dogecoin', 'tether', 'usdt',
  'usdc', 'litecoin', 'polkadot', 'chainlink', 'tron', 'toncoin', 'monero', 'shiba inu', 'arbitrum', 'hedera', 'aptos',
  // Crypto-native firms
  'coinbase', 'binance', 'kraken', 'bybit', 'okx', 'metamask', 'microstrategy', 'saylor',
];

const CRYPTO_TITLE_RE = new RegExp(`(?:^|[^a-z0-9])(?:${CRYPTO_TERMS.join('|')})(?![a-z0-9])`, 'i');

export interface NewsItemLike {
  title?: string | null;
  type?: string | null;
}

/** True when the item is a CoinGecko guide or its title names a crypto asset, network, firm or concept. */
export function isCryptoRelevantNews(item: NewsItemLike): boolean {
  if (item.type === 'guide') return true;
  return typeof item.title === 'string' && CRYPTO_TITLE_RE.test(item.title);
}

/**
 * Name used by the shared ticker-relevance rule (lib/equityNewsRelevance.ts) for a coin: its CoinGecko id as words
 * ("BTC" -> "bitcoin", "SHIB" -> "shiba inu"). Accepts a ticker (BTC, BTC-USD, CRYPTO:BTC) or a CoinGecko id.
 */
export function cryptoNewsName(symbolOrId: string): string | null {
  const raw = symbolOrId.trim().replace(/^CRYPTO:/i, '');
  const id = symbolToId(raw.replace(/[-/]?(USDT|USD)$/i, '')) ?? (Object.values(COINGECKO_ID_MAP).includes(raw.toLowerCase()) ? raw.toLowerCase() : null);
  return id ? id.replace(/-\d+$/, '').replace(/-/g, ' ') : null;
}

/** Plain ticker for a CoinGecko id ("bitcoin" -> "BTC"), or null when the id isn't in the map. */
export function cryptoSymbolForId(coinId: string): string | null {
  const id = coinId.trim().toLowerCase();
  const entry = Object.entries(COINGECKO_ID_MAP).find(([sym, v]) => v === id && /^[A-Z0-9]+$/.test(sym) && !/(USDT|USD)$/.test(sym));
  return entry ? entry[0] : null;
}

/**
 * Coin-specific CoinGecko feed (/news?coin_id=...): CoinGecko auto-tags coins from ordinary words, so a news item is
 * kept only when its title names the coin or its ticker (shared mentionsCompany rule). Guides are coin explainers
 * and always pass.
 */
export function isCoinRelevantNews(item: NewsItemLike, coinId: string): boolean {
  if (item.type === 'guide') return true;
  if (typeof item.title !== 'string') return false;
  return mentionsCompany(item.title, cryptoSymbolForId(coinId) ?? '', cryptoNewsName(coinId));
}

/** Drop repeats of the same headline, including full-width/half-width punctuation variants (NFKC). */
export function dedupeNewsByTitle<T extends { title?: string | null }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = String(item.title ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}]+/gu, '');
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
