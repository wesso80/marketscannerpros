import { describe, expect, it } from 'vitest';
import { COINGECKO_ID_MAP } from '@/lib/coingecko';
import {
  labelHorizonMove,
  publishScanChange,
  resolveOutcomeAsset,
  resolveScanAsset,
  SUSPECT_MOVE_PCT,
} from '@/lib/signals/outcomeGuard';
import { guardScanChangePercent } from '@/lib/admin/scanMoveGuard';
import { barsToNoSetupIntelligence } from '@/lib/admin/serializer';
import type { Bar } from '@/types/operator';

const HOUR = 60 * 60 * 1000;

function cryptoAsset(symbol: string) {
  return resolveOutcomeAsset({
    symbol,
    declared: 'crypto',
    universeTypes: ['crypto'],
    inCryptoMap: true,
  });
}

describe('outcome horizon guard', () => {
  const signalAt = Date.parse('2026-02-01T15:00:00Z');
  const horizonMinutes = 1440;

  it('does not label a closed window from a live price', () => {
    const decision = labelHorizonMove({
      direction: 'bullish',
      bandPct: 2,
      priceAtSignal: 1,
      nowMs: Date.parse('2026-10-09T00:00:00Z'),
      signalAtMs: signalAt,
      horizonMinutes,
      asset: cryptoAsset('YFI'),
      observation: { price: 1070, observedAtMs: Date.parse('2026-10-09T00:00:00Z'), live: true },
    });
    expect(decision).toMatchObject({ action: 'write', outcome: 'unknown', reason: 'expired', priceLater: null });
  });

  it('labels from a bar inside the horizon window', () => {
    const decision = labelHorizonMove({
      direction: 'bullish',
      bandPct: 2,
      priceAtSignal: 100,
      nowMs: signalAt + 3 * 24 * HOUR,
      signalAtMs: signalAt,
      horizonMinutes,
      asset: resolveOutcomeAsset({ symbol: 'AAPL', declared: 'equity', universeTypes: ['equity'], inCryptoMap: false }),
      observation: { price: 103, observedAtMs: signalAt + horizonMinutes * 60_000 + HOUR, live: false },
    });
    expect(decision).toMatchObject({ action: 'write', outcome: 'correct', reason: 'labelled' });
  });

  it('marks a ticker that is both a coin and a stock unknown', () => {
    const asset = resolveOutcomeAsset({
      symbol: 'YFI',
      declared: 'equity',
      universeTypes: ['equity'],
      inCryptoMap: Boolean(COINGECKO_ID_MAP.YFI),
    });
    expect(asset.status).toBe('ambiguous');
    const decision = labelHorizonMove({
      direction: 'bullish',
      bandPct: 2,
      priceAtSignal: 1,
      nowMs: Date.parse('2026-10-09T00:00:00Z'),
      signalAtMs: signalAt,
      horizonMinutes,
      asset,
      observation: { price: 20, observedAtMs: signalAt + 20 * HOUR, live: false },
    });
    expect(decision).toMatchObject({ action: 'write', outcome: 'unknown', reason: 'ambiguous' });
  });

  it('does not call a move over 50% correct or wrong', () => {
    expect(SUSPECT_MOVE_PCT).toBe(50);
    const decision = labelHorizonMove({
      direction: 'bullish',
      bandPct: 2,
      priceAtSignal: 1,
      nowMs: signalAt + 3 * 24 * HOUR,
      signalAtMs: signalAt,
      horizonMinutes,
      asset: cryptoAsset('FTM'),
      observation: { price: 11, observedAtMs: signalAt + 30 * HOUR, live: false },
    });
    expect(decision).toMatchObject({ action: 'write', outcome: 'unknown', reason: 'suspect' });
    if (decision.action === 'write') expect(decision.pctMove).toBeCloseTo(1000, 0);
  });
});

describe('admin crypto scan uses the same resolver and cap', () => {
  it('does not publish a JUP-style move of +15,456%', () => {
    expect(COINGECKO_ID_MAP.JUP).toBeTruthy();
    const asset = resolveScanAsset({ symbol: 'JUP', market: 'CRYPTO', inCryptoMap: true, equitySymbols: [] });
    expect(asset).toEqual({ status: 'ok', assetClass: 'crypto' });
    expect(publishScanChange(15456, asset, 'crypto')).toEqual({ changePercent: null, withheld: 'suspect' });
    expect(guardScanChangePercent('JUP', 'CRYPTO', 15456)).toEqual({ changePercent: null, withheld: 'suspect' });
  });

  it('does not publish an ENJ-style move of +85%', () => {
    expect(COINGECKO_ID_MAP.ENJ).toBeTruthy();
    expect(guardScanChangePercent('ENJ', 'CRYPTO', 85)).toEqual({ changePercent: null, withheld: 'suspect' });
    const bars: Bar[] = [{
      symbol: 'ENJ', market: 'CRYPTO', timeframe: '15m', timestamp: '2026-10-08T12:00:00Z',
      open: 0.2, high: 0.2, low: 0.2, close: 0.2, volume: 1,
    }];
    const snap = barsToNoSetupIntelligence({
      symbol: 'ENJ', timeframe: '15m', market: 'CRYPTO', bars, scanTimestamp: '2026-10-08T12:00:00Z', dayChangePercent: 85,
    });
    expect(snap.changePercent).toBe(0);
    expect(snap.moveWithheld).toBe('suspect');
  });

  it('withholds a coin that is also an equity ticker, even when the move is small', () => {
    const asset = resolveScanAsset({ symbol: 'JUP', market: 'CRYPTO', inCryptoMap: true, equitySymbols: ['JUP'] });
    expect(asset.status).toBe('ambiguous');
    expect(publishScanChange(3, asset, 'crypto')).toEqual({ changePercent: null, withheld: 'ambiguous' });
    // BEAM is on both the equity biotech list and the crypto gaming list.
    expect(guardScanChangePercent('BEAM', 'CRYPTO', 4).withheld).toBe('ambiguous');
  });

  it('still publishes an ordinary crypto day change', () => {
    expect(guardScanChangePercent('JUP', 'CRYPTO', 3.25)).toMatchObject({ changePercent: 3.25, withheld: null });
  });

  it('does not resolve Chevron CVX to a coin', () => {
    expect(COINGECKO_ID_MAP.CVX).toBeUndefined();
    const asset = resolveScanAsset({ symbol: 'CVX', market: 'EQUITIES', inCryptoMap: false, equitySymbols: ['CVX'] });
    expect(asset).toEqual({ status: 'ok', assetClass: 'equity' });
    expect(publishScanChange(1.2, asset, 'equity')).toEqual({ changePercent: 1.2, withheld: null });
    // If a caller treated the Convex search hit as a coin-map match, the equity declaration blocks it.
    const collided = resolveScanAsset({ symbol: 'CVX', market: 'EQUITIES', inCryptoMap: true, equitySymbols: ['CVX'] });
    expect(collided.status).toBe('ambiguous');
    expect(publishScanChange(1.2, collided, 'equity').withheld).toBe('ambiguous');
  });
});
