/** Revalue only metrics whose denominator is actually available. */
export function valuationAtPrice(price: number | null | undefined, eps: unknown, shares: unknown) {
  const earnings = Number(eps), count = Number(shares);
  const validPrice = typeof price === 'number' && Number.isFinite(price) && price > 0;
  return {
    pe: validPrice && Number.isFinite(earnings) && earnings > 0 ? price / earnings : null,
    marketCap: validPrice && Number.isFinite(count) && count > 0 ? price * count : null,
    basis: 'P/E = displayed price / reported TTM EPS; market cap = displayed price × reported shares. Denominators are from the latest provider fundamentals snapshot.',
  };
}
