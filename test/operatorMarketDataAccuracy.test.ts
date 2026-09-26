import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  avFetch: vi.fn(),
  avTryToken: vi.fn(async () => true),
  getBars: vi.fn(),
  vix: vi.fn(),
}));
vi.mock('@/lib/avRateGovernor', () => ({ avFetch: mocks.avFetch, avTryToken: mocks.avTryToken }));
vi.mock('@/lib/marketData', () => ({ getBars: mocks.getBars }));
vi.mock('@/lib/scoring/canonical/regimeOverlayData', () => ({ vixWithAlphaVantagePrimary: mocks.vix }));
vi.mock('@/lib/coingecko', () => ({ getOHLC: vi.fn(async () => null), resolveSymbolToId: vi.fn(async () => null), COINGECKO_ID_MAP: {} }));

import {
  createOperatorProvider,
  memoizeProvider,
  normalizeAvBarTimestamp,
  resetEntitlementDowngrade,
  vixStateFromLevel,
} from '@/lib/operator/market-data';
import { computeFeatureVector } from '@/lib/operator/feature-engine';

const NOW = Date.parse('2026-09-25T18:00:00Z');

function intradayPayload() {
  return {
    'Time Series (15min)': {
      '2026-09-25 13:45:00': { '1. open': '101', '2. high': '102', '3. low': '100', '4. close': '101.5', '5. volume': '1000' },
      '2026-09-25 13:30:00': { '1. open': '100', '2. high': '101', '3. low': '99', '4. close': '101', '5. volume': '900' },
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
  delete process.env.OPERATOR_AV_ENTITLEMENT;
  delete process.env.OPERATOR_CG_FETCH_ENABLED;
  resetEntitlementDowngrade();
  mocks.avFetch.mockReset();
  mocks.getBars.mockReset();
  mocks.vix.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('bar timestamps', () => {
  it('parses US equity intraday stamps as New York time (DST-aware) and crypto as UTC; daily stays a date', () => {
    expect(normalizeAvBarTimestamp('2026-09-25 15:45:00', 'EQUITIES')).toBe('2026-09-25T19:45:00.000Z'); // EDT
    expect(normalizeAvBarTimestamp('2026-01-15 15:45:00', 'EQUITIES')).toBe('2026-01-15T20:45:00.000Z'); // EST
    expect(normalizeAvBarTimestamp('2026-09-25 15:45:00', 'CRYPTO')).toBe('2026-09-25T15:45:00.000Z');
    expect(normalizeAvBarTimestamp('2026-09-25', 'EQUITIES')).toBe('2026-09-25');
  });

  it('bars returned by the provider carry the corrected instant, oldest first', async () => {
    mocks.avFetch.mockResolvedValue(intradayPayload());
    const bars = await createOperatorProvider({ waitForToken: true }).getBars('AAPL', 'EQUITIES', '15m');
    expect(bars.map((b) => b.timestamp)).toEqual(['2026-09-25T17:30:00.000Z', '2026-09-25T17:45:00.000Z']);
  });
});

describe('equity entitlement (configurable, graceful fallback)', () => {
  it('requests entitlement=realtime by default, through the rate governor', async () => {
    mocks.avFetch.mockResolvedValue(intradayPayload());
    await createOperatorProvider({ waitForToken: true }).getBars('AAPL', 'EQUITIES', '15m');
    expect(mocks.avFetch).toHaveBeenCalledTimes(1);
    expect(String(mocks.avFetch.mock.calls[0][0])).toContain('entitlement=realtime');
    // regular-session bars only (no thin post-market bar as the "latest" bar after the close)
    expect(String(mocks.avFetch.mock.calls[0][0])).toContain('extended_hours=false');
  });

  it('honours OPERATOR_AV_ENTITLEMENT', async () => {
    process.env.OPERATOR_AV_ENTITLEMENT = 'delayed';
    mocks.avFetch.mockResolvedValue(intradayPayload());
    await createOperatorProvider({ waitForToken: true }).getBars('AAPL', 'EQUITIES', '15m');
    expect(String(mocks.avFetch.mock.calls[0][0])).toContain('entitlement=delayed');
    process.env.OPERATOR_AV_ENTITLEMENT = 'none';
    await createOperatorProvider({ waitForToken: true }).getBars('AAPL', 'EQUITIES', '15m');
    expect(String(mocks.avFetch.mock.calls[1][0])).not.toContain('entitlement=');
  });

  it('retries once without the parameter when the key is not entitled, and remembers the downgrade', async () => {
    process.env.OPERATOR_AV_ENTITLEMENT = 'delayed';
    const onAvCall = vi.fn();
    mocks.avFetch
      .mockRejectedValueOnce(new Error('AV info error: Your API key is not yet entitled to 15-minute delayed US market data'))
      .mockResolvedValue(intradayPayload());
    const provider = createOperatorProvider({ waitForToken: true, onAvCall });
    const bars = await provider.getBars('AAPL', 'EQUITIES', '15m');
    expect(bars).toHaveLength(2);
    expect(String(mocks.avFetch.mock.calls[0][0])).toContain('entitlement=delayed');
    expect(String(mocks.avFetch.mock.calls[1][0])).not.toContain('entitlement=');
    await provider.getBars('MSFT', 'EQUITIES', '15m');
    expect(String(mocks.avFetch.mock.calls[2][0])).not.toContain('entitlement=');
    expect(onAvCall).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-entitlement errors (e.g. quota) and returns no bars', async () => {
    mocks.avFetch.mockRejectedValueOnce(new Error('AV quota exceeded: premium plans...'));
    const bars = await createOperatorProvider({ waitForToken: true }).getBars('AAPL', 'EQUITIES', '15m');
    expect(bars).toEqual([]);
    expect(mocks.avFetch).toHaveBeenCalledTimes(1);
  });
});

describe('daily bars / key levels come from the lib/marketData cache', () => {
  it('equity key levels use cached daily bars and make no direct AV call', async () => {
    mocks.getBars.mockResolvedValue({
      data: [
        { date: '2026-09-24', ts: Date.parse('2026-09-24'), open: 99, high: 104, low: 98, close: 103, volume: 10 },
        { date: '2026-09-23', ts: Date.parse('2026-09-23'), open: 97, high: 100, low: 96, close: 99, volume: 10 },
      ],
    });
    const levels = await createOperatorProvider({ waitForToken: true }).getKeyLevels('AAPL', 'EQUITIES');
    expect(mocks.getBars).toHaveBeenCalledWith('AAPL', 'daily');
    expect(mocks.avFetch).not.toHaveBeenCalled();
    // bars are sorted oldest first, so the previous day is 09-23
    expect(levels.find((l) => l.category === 'PDH')?.price).toBe(100);
  });
});

describe('crypto is never looked up as a US stock ticker', () => {
  it('uses the crypto endpoint (CoinGecko off) instead of TIME_SERIES_INTRADAY', async () => {
    mocks.avFetch.mockResolvedValue({});
    await createOperatorProvider({ waitForToken: true }).getBars('BTC', 'CRYPTO', '15m');
    const url = String(mocks.avFetch.mock.calls[0][0]);
    expect(url).toContain('function=CRYPTO_INTRADAY');
    expect(url).not.toContain('TIME_SERIES_INTRADAY');
    expect(url).not.toContain('entitlement=');
  });
});

describe('VIX / cross-market', () => {
  it('maps levels to states and missing VIX to unknown', () => {
    expect(vixStateFromLevel(null)).toBe('unknown');
    expect(vixStateFromLevel(Number.NaN)).toBe('unknown');
    expect(vixStateFromLevel(15)).toBe('normal');
    expect(vixStateFromLevel(25)).toBe('cautious');
    expect(vixStateFromLevel(35)).toBe('elevated');
  });

  it('missing or stale VIX is unknown (no made-up 20)', async () => {
    mocks.vix.mockResolvedValueOnce(null);
    expect((await createOperatorProvider().getCrossMarketState()).vixState).toBe('unknown');
    mocks.vix.mockResolvedValueOnce({ rows: [{ on: '2026-09-10', value: 14 }] });
    expect((await createOperatorProvider().getCrossMarketState()).vixState).toBe('unknown');
    mocks.vix.mockResolvedValueOnce({ rows: [{ on: '2026-09-24', value: 24 }] });
    expect((await createOperatorProvider().getCrossMarketState()).vixState).toBe('cautious');
  });

  it('unknown VIX adds no cross-market confidence', () => {
    const bars = Array.from({ length: 60 }, (_, i) => ({
      symbol: 'AAPL', market: 'EQUITIES' as const, timeframe: '15m',
      timestamp: new Date(NOW - (60 - i) * 900_000).toISOString(),
      open: 100 + i * 0.1, high: 100.5 + i * 0.1, low: 99.5 + i * 0.1, close: 100.2 + i * 0.1, volume: 1000,
    }));
    const base = {
      symbol: 'AAPL', market: 'EQUITIES' as const, timeframe: '15m', bars, keyLevels: [],
      eventSnapshot: { isActive: false, severity: null, nextEventAt: null },
    };
    const score = (vixState: string) =>
      computeFeatureVector({ ...base, crossMarketSnapshot: { vixState, dxyState: 'neutral', breadthState: 'neutral' } } as never).features.crossMarketScore;
    // 0.5 base + 0.1 (DXY neutral); VIX contributes nothing when unknown
    expect(score('unknown')).toBeCloseTo(0.6, 6);
    expect(score('normal')).toBeCloseTo(0.8, 6);
  });

  it('memoizeProvider reads VIX once and each bar series once per run', async () => {
    const base = {
      getBars: vi.fn(async () => []),
      getKeyLevels: vi.fn(async () => []),
      getCrossMarketState: vi.fn(async () => ({ vixState: 'normal', dxyState: 'neutral', breadthState: 'neutral' })),
      getEventWindow: vi.fn(async () => ({ isActive: false, severity: null, nextEventAt: null })),
    };
    const p = memoizeProvider(base as never);
    await Promise.all([p.getBars('AAPL', 'EQUITIES', '15m'), p.getBars('aapl', 'EQUITIES', '15M'), p.getCrossMarketState(), p.getCrossMarketState()]);
    await p.getKeyLevels('AAPL', 'EQUITIES');
    await p.getKeyLevels('AAPL', 'EQUITIES');
    expect(base.getBars).toHaveBeenCalledTimes(1);
    expect(base.getCrossMarketState).toHaveBeenCalledTimes(1);
    expect(base.getKeyLevels).toHaveBeenCalledTimes(1);
  });
});
