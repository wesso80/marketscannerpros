import { describe, expect, it } from 'vitest';
import { COINGECKO_ID_MAP } from '@/lib/coingecko';
import {
  allowUnclassifiedEquityBars,
  labelHorizonMove,
  publishScanChange,
  resolveOutcomeAsset,
  resolveOutcomeLabelAsset,
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

  it('does not label a coin from the other asset class when the move is under 50%', () => {
    const nowMs = signalAt + 3 * 24 * HOUR;
    const observedAtMs = signalAt + 30 * HOUR;
    const yfi = resolveOutcomeAsset({ symbol: 'YFI', declared: null, universeTypes: [], inCryptoMap: true });
    expect(yfi).toEqual({ status: 'ok', assetClass: 'crypto' });
    const yfiDecision = labelHorizonMove({
      direction: 'bullish', bandPct: 2, priceAtSignal: 100, nowMs, signalAtMs: signalAt, horizonMinutes,
      asset: yfi, otherClassOnly: true,
      observation: { price: 112, observedAtMs, live: false, barClass: 'equity' },
    });
    expect(yfiDecision).toMatchObject({ action: 'write', outcome: 'unknown', reason: 'wrong_asset' });

    const jup = resolveOutcomeAsset({ symbol: 'JUP', declared: null, universeTypes: [], inCryptoMap: Boolean(COINGECKO_ID_MAP.JUP) });
    expect(jup).toEqual({ status: 'ok', assetClass: 'crypto' });
    const jupDecision = labelHorizonMove({
      direction: 'bullish', bandPct: 2, priceAtSignal: 1, nowMs, signalAtMs: signalAt, horizonMinutes,
      asset: jup, otherClassOnly: true,
      observation: { price: 1.04, observedAtMs, live: false, barClass: 'equity' },
    });
    expect(jupDecision).toMatchObject({ action: 'write', outcome: 'unknown', reason: 'wrong_asset' });

    const beam = resolveOutcomeAsset({ symbol: 'BEAM', declared: null, universeTypes: ['equity'], inCryptoMap: true });
    expect(beam.status).toBe('ambiguous');
    const beamDecision = labelHorizonMove({
      direction: 'bullish', bandPct: 2, priceAtSignal: 100, nowMs, signalAtMs: signalAt, horizonMinutes,
      asset: beam,
      observation: { price: 108, observedAtMs, live: false, barClass: 'equity' },
    });
    expect(beamDecision).toMatchObject({ action: 'write', outcome: 'unknown', reason: 'ambiguous' });

    for (const decision of [yfiDecision, jupDecision, beamDecision]) {
      expect(decision.action === 'write' && decision.outcome).not.toBe('correct');
      expect(decision.action === 'write' && decision.outcome).not.toBe('wrong');
    }
  });

  it('still labels a same-class bar under 50%', () => {
    const decision = labelHorizonMove({
      direction: 'bullish', bandPct: 2, priceAtSignal: 100,
      nowMs: signalAt + 3 * 24 * HOUR, signalAtMs: signalAt, horizonMinutes,
      asset: cryptoAsset('JUP'),
      observation: { price: 108, observedAtMs: signalAt + 30 * HOUR, live: false, barClass: 'crypto' },
    });
    expect(decision).toMatchObject({ action: 'write', outcome: 'correct', reason: 'labelled' });
  });

  it('treats an unclassified equity bar as equity only when nothing says crypto', () => {
    expect(allowUnclassifiedEquityBars({ inCryptoMap: false, universeTypes: [] })).toBe(true);
    expect(allowUnclassifiedEquityBars({ inCryptoMap: false, universeTypes: ['equity'] })).toBe(true);
    expect(allowUnclassifiedEquityBars({ inCryptoMap: true, universeTypes: [] })).toBe(false);
    expect(allowUnclassifiedEquityBars({ inCryptoMap: false, universeTypes: ['crypto'] })).toBe(false);
    const decision = labelHorizonMove({
      direction: 'bullish', bandPct: 2, priceAtSignal: 100,
      nowMs: signalAt + 3 * 24 * HOUR, signalAtMs: signalAt, horizonMinutes,
      asset: resolveOutcomeAsset({ symbol: 'AAPL', declared: null, universeTypes: [], inCryptoMap: false }),
      observation: { price: 103, observedAtMs: signalAt + 30 * HOUR, live: false, barClass: 'equity' },
    });
    expect(decision).toMatchObject({ action: 'write', outcome: 'correct', reason: 'labelled' });
  });

  it('stores unknown for renamed tickers FTM and MATIC', () => {
    expect(COINGECKO_ID_MAP.FTM).toBe('fantom');
    expect(COINGECKO_ID_MAP.MATIC).toBe('matic-network');
    expect(COINGECKO_ID_MAP.POL).toBe('polygon-ecosystem-token');
    const nowMs = signalAt + 3 * 24 * HOUR;
    const observedAtMs = signalAt + 30 * HOUR;
    for (const symbol of ['FTM', 'MATIC']) {
      const asset = resolveOutcomeLabelAsset({
        symbol, declared: 'crypto', universeTypes: ['crypto'], inCryptoMap: true,
      });
      expect(asset.status).toBe('ambiguous');
      const decision = labelHorizonMove({
        direction: 'bullish', bandPct: 2, priceAtSignal: 100, nowMs, signalAtMs: signalAt, horizonMinutes,
        asset,
        observation: { price: 110, observedAtMs, live: false, barClass: 'crypto' },
      });
      expect(decision).toMatchObject({ action: 'write', outcome: 'unknown', reason: 'ambiguous' });
      expect(decision.action === 'write' && decision.outcome).not.toBe('correct');
      expect(decision.action === 'write' && decision.outcome).not.toBe('wrong');
    }
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
