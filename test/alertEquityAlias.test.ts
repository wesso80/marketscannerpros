import { describe, expect, it } from 'vitest';
import { resolveAlertAsset } from '@/lib/alerts/alertAsset';
import { equityTickerSet } from '@/lib/symbols/equityTickers';
import { resolveScanAsset } from '@/lib/signals/outcomeGuard';

const EQUITY_ALIASES = ['CVX', 'MCD', 'PG', 'ABBV', 'PFE'] as const;

describe('explicit equity alert class beats a crypto alias', () => {
  it('these tickers are on the equity list, which is what tags them as both', () => {
    for (const symbol of EQUITY_ALIASES) expect(equityTickerSet().has(symbol), symbol).toBe(true);
  });

  it('the shared scan resolver still calls a crypto declaration plus an equity row ambiguous', () => {
    for (const symbol of EQUITY_ALIASES) {
      const asset = resolveScanAsset({
        symbol,
        market: 'CRYPTO',
        inCryptoMap: true,
        equitySymbols: EQUITY_ALIASES,
      });
      expect(asset.status, symbol).toBe('ambiguous');
    }
  });

  it('an explicit equity alert stays equity when the same ticker is also a coin', () => {
    for (const symbol of EQUITY_ALIASES) {
      expect(resolveAlertAsset({
        assetType: 'equity',
        symbol,
        inCryptoMap: true,
        equitySymbols: EQUITY_ALIASES,
      }), symbol).toEqual({ source: 'stock', skipped: false });
    }
    expect(resolveAlertAsset({
      assetType: 'EQUITY',
      symbol: 'cvx',
      inCryptoMap: true,
      equitySymbols: ['CVX'],
    })).toEqual({ source: 'stock', skipped: false });
  });

  it('a crypto alert on an equity ticker is still not priced as the coin', () => {
    expect(resolveAlertAsset({
      assetType: 'crypto',
      symbol: 'CVX',
      inCryptoMap: true,
      equitySymbols: ['CVX'],
    })).toMatchObject({ source: 'crypto', skipped: true });
    expect(resolveAlertAsset({
      assetType: 'crypto',
      symbol: 'BTC',
      inCryptoMap: true,
      equitySymbols: ['CVX'],
    })).toEqual({ source: 'crypto', skipped: false });
  });
});
