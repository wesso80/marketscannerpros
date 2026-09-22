/** P/E can be repriced; an unverified share-class count cannot establish total company value. */
export function valuationAtPrice(price: number | null | undefined, eps: unknown, shares: unknown, providerMarketCap?: unknown) {
  const earnings = Number(eps), count = Number(shares), reportedCap = Number(providerMarketCap);
  const validPrice = typeof price === 'number' && Number.isFinite(price) && price > 0;
  return {
    pe: validPrice && Number.isFinite(earnings) && earnings > 0 ? price / earnings : null,
    marketCap: Number.isFinite(reportedCap) && reportedCap > 0 ? reportedCap : null,
    reportedShareValue: validPrice && Number.isFinite(count) && count > 0 ? price * count : null,
    basis: 'P/E = displayed price / reported TTM EPS. Market cap is the provider-reported snapshot, with valuation time unavailable; it is not repriced from an unverified share-class count. Forward P/E and PEG retain their provider snapshot basis.',
  };
}
