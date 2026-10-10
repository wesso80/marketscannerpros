/** Fields the crypto search widget renders. Everything else from the coin payload stays on the server. */
export function searchWidgetCoin(coin: {
  id?: string;
  symbol?: string;
  name?: string;
  market_cap_rank?: number;
  image?: { small?: string };
  market_data?: {
    current_price?: { usd?: number };
    market_cap?: { usd?: number };
    total_volume?: { usd?: number };
    high_24h?: { usd?: number };
    low_24h?: { usd?: number };
    ath?: { usd?: number };
    ath_change_percentage?: { usd?: number };
    price_change_percentage_24h?: number;
    price_change_percentage_7d?: number;
    price_change_percentage_30d?: number;
  };
}) {
  const market = coin.market_data;
  return {
    id: coin.id,
    symbol: coin.symbol,
    name: coin.name,
    market_cap_rank: coin.market_cap_rank,
    image: coin.image?.small ? { small: coin.image.small } : undefined,
    market_data: {
      current_price: { usd: market?.current_price?.usd },
      market_cap: { usd: market?.market_cap?.usd },
      total_volume: { usd: market?.total_volume?.usd },
      high_24h: { usd: market?.high_24h?.usd },
      low_24h: { usd: market?.low_24h?.usd },
      ath: { usd: market?.ath?.usd },
      ath_change_percentage: { usd: market?.ath_change_percentage?.usd },
      price_change_percentage_24h: market?.price_change_percentage_24h,
      price_change_percentage_7d: market?.price_change_percentage_7d,
      price_change_percentage_30d: market?.price_change_percentage_30d,
    },
  };
}

/** Crypto rows keep their symbol. Price and percent columns are left blank so a download is not a CoinGecko feed. */
export function csvCellForAsset(assetType: string | null | undefined, value: string, crypto: boolean): string {
  if (!crypto) return value;
  return String(assetType || '').toLowerCase() === 'crypto' ? '' : value;
}
