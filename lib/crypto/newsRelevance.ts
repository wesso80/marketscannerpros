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
