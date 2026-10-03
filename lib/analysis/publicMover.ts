/** CoinGecko top-movers usd_24h_change is a percentage; amounts below are USD. */
export function normalizeCryptoMover(coin: any, duration = '24h') {
  const price = Number(coin.usd ?? coin.current_price);
  const rawPct = coin.usd_24h_change ?? coin.price_change_percentage_24h;
  const pct = rawPct == null ? NaN : Number(rawPct);
  const amount = Number.isFinite(price) && Number.isFinite(pct) && pct > -100 ? price - price / (1 + pct / 100) : null;
  const cap = Number(coin.usd_market_cap ?? coin.market_cap);
  return {
    ticker:String(coin.symbol || '').toUpperCase(), price:String(price),
    change_amount:amount == null ? null : String(amount),
    change_percentage:Number.isFinite(pct) ? `${pct.toFixed(2)}%` : null,
    change_basis:`rolling_${duration}`, change_amount_currency:'USD',
    volume:coin.usd_24h_vol ?? coin.total_volume ?? null,
    market_cap:Number.isFinite(cap) && cap > 0 ? String(cap) : null,
    market_cap_rank:coin.market_cap_rank ?? null, asset_class:'crypto' as const,
  };
}
