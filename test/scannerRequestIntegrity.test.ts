import { describe, expect, it } from 'vitest';
import { scannerTimeframe, proTimeframe } from '../lib/scanner/timeframes';
import { summarizeDerivativeSnapshot } from '../lib/scanner/derivativeSnapshot';
import type { DerivativeTicker } from '../lib/coingecko';

const ticker = (values: Partial<DerivativeTicker> = {}): DerivativeTicker => ({
  market: 'Venue A', symbol: 'ETHUSDT', index_id: 'ETH', contract_type: 'perpetual',
  price: '2000', open_interest: 2000000, last_traded_at: 1790000000,
  funding_rate: 0.01, ...values,
} as DerivativeTicker);

describe('scanner request and derivatives integrity', () => {
  it('preserves a requested 30-minute horizon and rejects unsupported horizons', () => {
    expect(scannerTimeframe('30m')).toBe('30m');
    expect(proTimeframe('daily')).toBe('1d');
    expect(scannerTimeframe('1d')).toBe('daily');
    expect(() => scannerTimeframe('4h')).toThrow();
    expect(() => proTimeframe('weekly')).toThrow();
  });
  it('deduplicates each venue contract and sums actual USD notional, with no unsupported funding comparison', () => {
    const result = summarizeDerivativeSnapshot('ETH-USD', [ticker(), ticker({ open_interest: 3000000, last_traded_at: 1790000010 }), ticker({ market: 'Venue B', price: '2500', open_interest: 1000000 }), ticker({ index_id: 'BTC' })]);
    expect(result).toMatchObject({ contracts: 2, openInterest: 4000000, openInterestCoin: 1900, observedAt: new Date(1790000000000).toISOString() });
    expect(result?.fundingRate).toBeUndefined();
    expect(result?.oiChangePercent).toBeUndefined();
    expect(result?.longShortRatio).toBeUndefined();
  });
  it('rejects invalid prices, observation dates and non-perpetual contracts', () => {
    expect(summarizeDerivativeSnapshot('ETH', [ticker({ price: 'Infinity' }), ticker({ last_traded_at: NaN }), ticker({ last_traded_at: 1e20 }), ticker({ contract_type: 'futures' }), ticker({ open_interest: -1 })])).toBeNull();
  });
});
