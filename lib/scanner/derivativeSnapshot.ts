import type { DerivativeTicker } from '@/lib/coingecko';

/** Sum observed USD OI without reconverting it using a different spot price. */
export function summarizeDerivativeSnapshot(symbol: string, snapshot: DerivativeTicker[]) {
  const base = symbol.toUpperCase().replace(/[-/]?(USDT|USD)$/, '');
  const contracts = new Map<string, DerivativeTicker>();
  for (const ticker of snapshot) {
    if (ticker.index_id.toUpperCase() !== base || ticker.contract_type !== 'perpetual' ||
        !Number.isFinite(ticker.open_interest) || ticker.open_interest <= 0 ||
        !Number.isFinite(Number(ticker.price)) || Number(ticker.price) <= 0 ||
        !Number.isFinite(ticker.last_traded_at) || ticker.last_traded_at <= 0 ||
        !Number.isFinite(new Date(ticker.last_traded_at * 1000).getTime())) continue;
    const key = `${ticker.market}:${ticker.symbol}`;
    const previous = contracts.get(key);
    if (!previous || ticker.last_traded_at > previous.last_traded_at) contracts.set(key, ticker);
  }
  const rows = [...contracts.values()];
  if (!rows.length) return null;
  return {
    openInterest: rows.reduce((sum, t) => sum + t.open_interest, 0),
    openInterestCoin: rows.reduce((sum, t) => sum + t.open_interest / Number(t.price), 0),
    // This feed does not specify each contract's funding period. Comparing or
    // averaging these rates would combine potentially different horizons.
    fundingRate: undefined,
    longShortRatio: undefined,
    oiChangePercent: undefined,
    basisPercent: undefined,
    contracts: rows.length,
    observedAt: new Date(Math.min(...rows.map(t => t.last_traded_at)) * 1000).toISOString(),
  };
}
