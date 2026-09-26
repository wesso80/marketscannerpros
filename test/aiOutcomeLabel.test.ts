import { describe, expect, it } from 'vitest';
import { nyWallTimeToUtcMs } from '@/lib/time/nyWallClock';
import {
  classifyOutcome,
  equityDailyToPriceBars,
  horizonPassed,
  normalizeAssetClass,
  normalizeCryptoSymbol,
  normalizeDirection,
  parseAvCryptoDailyBars,
  parseAvIntradayBars,
  pctMove,
  priceAtOrAfter,
} from '@/lib/outcomes/aiOutcomeLabel';

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

describe('nyWallTimeToUtcMs', () => {
  it('treats Alpha Vantage equity stamps as New York time, DST-aware', () => {
    expect(iso(nyWallTimeToUtcMs('2026-09-25 15:00:00'))).toBe('2026-09-25T19:00:00.000Z'); // EDT
    expect(iso(nyWallTimeToUtcMs('2026-01-15 15:00:00'))).toBe('2026-01-15T20:00:00.000Z'); // EST
    expect(iso(nyWallTimeToUtcMs('2026-03-09 09:30'))).toBe('2026-03-09T13:30:00.000Z'); // first EDT session
    expect(iso(nyWallTimeToUtcMs('2026-11-02 09:30'))).toBe('2026-11-02T14:30:00.000Z'); // first EST session
    expect(nyWallTimeToUtcMs('not a time')).toBeNull();
  });
});

describe('direction and asset normalisation', () => {
  it('only LONG/SHORT are directions; nothing defaults to LONG', () => {
    expect(normalizeDirection('long')).toBe('LONG');
    expect(normalizeDirection(' SHORT ')).toBe('SHORT');
    for (const v of [null, undefined, '', 'NEUTRAL', 'VALID', 'HIGH_CONFLUENCE', 'BULLISH']) {
      expect(normalizeDirection(v)).toBeNull();
    }
  });

  it('maps recorder asset types and crypto pairs', () => {
    expect(normalizeAssetClass('equities')).toBe('equity');
    expect(normalizeAssetClass('equity')).toBe('equity');
    expect(normalizeAssetClass('CRYPTO')).toBe('crypto');
    expect(normalizeAssetClass('forex')).toBeNull();
    expect(normalizeCryptoSymbol('btc-usd')).toBe('BTC');
    expect(normalizeCryptoSymbol('ETHUSDT')).toBe('ETH');
    expect(normalizeCryptoSymbol('SOL')).toBe('SOL');
  });
});

describe('classifyOutcome', () => {
  it('scores LONG and SHORT symmetrically around the 1% threshold', () => {
    expect(classifyOutcome('LONG', 1.5)).toBe('correct');
    expect(classifyOutcome('LONG', -1.5)).toBe('wrong');
    expect(classifyOutcome('SHORT', -1.5)).toBe('correct');
    expect(classifyOutcome('SHORT', 1.5)).toBe('wrong');
    expect(classifyOutcome('LONG', 0.5)).toBe('neutral');
    expect(classifyOutcome('SHORT', -0.5)).toBe('neutral');
  });

  it('pctMove rounds to 4 dp', () => {
    expect(pctMove(100, 102.123456)).toBe(2.1235);
    expect(pctMove(100, 98)).toBe(-2);
  });
});

describe('priceAtOrAfter / horizonPassed', () => {
  const T = Date.parse('2026-09-24T14:00:00Z');
  const bars = [
    { closeTime: T - 3_600_000, close: 99 },
    { closeTime: T, close: 100 },
    { closeTime: T + 3_600_000, close: 101 },
  ];

  it('returns the first completed close at or after the horizon', () => {
    expect(priceAtOrAfter(bars, T - 60_000, T + 10 * 3_600_000)).toEqual({ price: 100, at: T });
    expect(priceAtOrAfter(bars, T + 1, T + 10 * 3_600_000)).toEqual({ price: 101, at: T + 3_600_000 });
  });

  it('ignores bars that have not closed yet and returns null when data does not reach the horizon', () => {
    expect(priceAtOrAfter(bars, T + 1, T + 30 * 60_000)).toBeNull();
    expect(priceAtOrAfter(bars, T + 2 * 3_600_000, T + 10 * 3_600_000)).toBeNull();
  });

  it('a horizon has only passed once signal_at + horizon <= now', () => {
    const signal = Date.parse('2026-09-24T14:00:00Z');
    expect(horizonPassed(signal, '4h', signal + 4 * 3_600_000 - 1)).toBe(false);
    expect(horizonPassed(signal, '4h', signal + 4 * 3_600_000)).toBe(true);
    expect(horizonPassed(signal, '24h', signal + 23 * 3_600_000)).toBe(false);
  });
});

describe('Alpha Vantage payload parsing', () => {
  it('equity intraday: bar stamped at its NY start, closes one interval later', () => {
    const json = {
      'Meta Data': { '6. Time Zone': 'US/Eastern' },
      'Time Series (60min)': {
        '2026-09-25 15:00:00': { '4. close': '101.5' },
        '2026-09-25 14:00:00': { '4. close': '100.5' },
      },
    };
    expect(parseAvIntradayBars(json, 60, 'NY').map((b) => [iso(b.closeTime), b.close])).toEqual([
      ['2026-09-25T19:00:00.000Z', 100.5],
      ['2026-09-25T20:00:00.000Z', 101.5],
    ]);
  });

  it('crypto intraday uses UTC stamps', () => {
    const json = {
      'Meta Data': { '7. Time Zone': 'UTC' },
      'Time Series Crypto (60min)': { '2026-09-25 15:00:00': { '4. close': '65000' } },
    };
    expect(iso(parseAvIntradayBars(json, 60, 'UTC')[0].closeTime)).toBe('2026-09-25T16:00:00.000Z');
  });

  it('equity daily bars close at the session close, including early closes', () => {
    const out = equityDailyToPriceBars([{ date: '2026-09-25', close: 10 }, { date: '2026-11-27', close: 11 }]);
    expect(out.map((b) => iso(b.closeTime))).toEqual(['2026-09-25T20:00:00.000Z', '2026-11-27T18:00:00.000Z']);
  });

  it('crypto daily bars close at the next UTC midnight and read either close field', () => {
    const json = {
      'Time Series (Digital Currency Daily)': {
        '2026-09-24': { '4. close': '64000' },
        '2026-09-25': { '4a. close (USD)': '65000' },
      },
    };
    expect(parseAvCryptoDailyBars(json).map((b) => [iso(b.closeTime), b.close])).toEqual([
      ['2026-09-25T00:00:00.000Z', 64000],
      ['2026-09-26T00:00:00.000Z', 65000],
    ]);
  });
});
