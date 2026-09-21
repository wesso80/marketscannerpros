import type { CoinGeckoPrice } from '@/lib/coingecko';

/** A completed daily candle is not a current quote. Use provider-stamped spot data. */
export function buildObservedCryptoQuote(point: CoinGeckoPrice | undefined, nowMs = Date.now()) {
  if (!point || !Number.isFinite(point.usd) || point.usd <= 0 || !point.last_updated_at ||
      nowMs - point.last_updated_at * 1000 > 15 * 60_000 || point.last_updated_at * 1000 > nowMs + 60_000) return null;
  const changePct = typeof point.usd_24h_change === 'number' && Number.isFinite(point.usd_24h_change) && point.usd_24h_change > -100
    ? point.usd_24h_change : null;
  const prevClose = changePct === null ? null : point.usd / (1 + changePct / 100);
  const updatedAt = new Date(point.last_updated_at * 1000).toISOString();
  return {
    price: point.usd, open: null, high: null, low: null, prevClose,
    volume: typeof point.usd_24h_vol === 'number' && Number.isFinite(point.usd_24h_vol) && point.usd_24h_vol >= 0 ? point.usd_24h_vol : null,
    changeAmt: prevClose === null ? null : point.usd - prevClose, changePct,
    latestDay: updatedAt.slice(0, 10), updatedAt, source: 'coingecko_simple_price',
  };
}
