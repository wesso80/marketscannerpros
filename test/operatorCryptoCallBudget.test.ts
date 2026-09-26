import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  avFetch: vi.fn(),
  getOHLC: vi.fn(),
  resolveSymbolToId: vi.fn(async () => null as string | null),
}));
vi.mock('@/lib/avRateGovernor', () => ({ avFetch: mocks.avFetch, avTryToken: vi.fn(async () => true) }));
vi.mock('@/lib/marketData', () => ({ getBars: vi.fn() }));
vi.mock('@/lib/scoring/canonical/regimeOverlayData', () => ({ vixWithAlphaVantagePrimary: vi.fn() }));
vi.mock('@/lib/coingecko', () => ({
  getOHLC: mocks.getOHLC,
  resolveSymbolToId: mocks.resolveSymbolToId,
  COINGECKO_ID_MAP: { BTC: 'bitcoin', ETH: 'ethereum' },
}));

import {
  cgOhlcToDailyBars,
  createOperatorProvider,
  getMarketSnapshot,
  resetCryptoLevelCache,
} from '@/lib/operator/market-data';

const NOW = Date.parse('2026-09-26T12:00:00Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** 25 daily CoinGecko candles ending today: [ms, o, h, l, c]; day i has high 100+i, low 90+i. */
function cgDaily(n = 25): number[][] {
  const today = Date.parse('2026-09-26T00:00:00Z');
  return Array.from({ length: n }, (_, k) => {
    const i = k;
    return [today - (n - 1 - k) * DAY, 95 + i, 100 + i, 90 + i, 96 + i];
  });
}

function avDailyPayload() {
  return {
    'Time Series (Digital Currency Daily)': {
      '2026-09-26': { '1. open': '60', '2. high': '62', '3. low': '59', '4. close': '61', '5. volume': '10' },
      '2026-09-25': { '1. open': '58', '2. high': '60.5', '3. low': '57', '4. close': '60', '5. volume': '10' },
    },
  };
}

function cryptoIntradayPayload() {
  return {
    'Time Series Crypto (15min)': {
      '2026-09-26 11:45:00': { '1. open': '61', '2. high': '62', '3. low': '60', '4. close': '61.5', '5. volume': '5' },
      '2026-09-26 11:30:00': { '1. open': '60', '2. high': '61', '3. low': '59', '4. close': '61', '5. volume': '4' },
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
  process.env.OPERATOR_CG_FETCH_ENABLED = 'true';
  resetCryptoLevelCache();
  mocks.avFetch.mockReset();
  mocks.getOHLC.mockReset();
  mocks.resolveSymbolToId.mockReset().mockResolvedValue(null);
});
afterEach(() => {
  vi.useRealTimers();
  delete process.env.OPERATOR_CG_FETCH_ENABLED;
});

const avFns = () => mocks.avFetch.mock.calls.map((c) => /function=([A-Z_]+)/.exec(String(c[0]))?.[1]);

describe('crypto bars go straight to Alpha Vantage (no CoinGecko call first)', () => {
  it('15m bars: one AV CRYPTO_INTRADAY call, zero CoinGecko calls', async () => {
    mocks.avFetch.mockResolvedValue(cryptoIntradayPayload());
    const bars = await createOperatorProvider({ waitForToken: true }).getBars('BTC', 'CRYPTO', '15m');
    expect(bars).toHaveLength(2);
    expect(avFns()).toEqual(['CRYPTO_INTRADAY']);
    expect(mocks.getOHLC).not.toHaveBeenCalled();
    expect(mocks.resolveSymbolToId).not.toHaveBeenCalled();
  });

  it('1D bars use AV DIGITAL_CURRENCY_DAILY, and the snapshot helper does the same', async () => {
    mocks.avFetch.mockResolvedValue(avDailyPayload());
    const bars = await createOperatorProvider({ waitForToken: true }).getBars('ETH', 'CRYPTO', '1D');
    expect(bars.map((b) => b.close)).toEqual([60, 61]);
    expect(avFns()).toEqual(['DIGITAL_CURRENCY_DAILY']);

    // getMarketSnapshot takes a token only if free (avTryToken) and calls fetch directly.
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => avDailyPayload() }));
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const snap = await getMarketSnapshot({ symbol: 'ETH', market: 'CRYPTO', timeframe: '1D' } as never).catch(() => null);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String((fetchSpy.mock.calls[0] as unknown[])[0])).toContain('function=DIGITAL_CURRENCY_DAILY');
      expect(snap?.latestBar?.close).toBe(61);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(mocks.getOHLC).not.toHaveBeenCalled();
  });
});

describe('crypto key levels: CoinGecko daily OHLC, 6h cache, AV fallback', () => {
  it('uses one CoinGecko daily-OHLC call (interval=daily), no AV call, and caches it for 6 hours', async () => {
    mocks.getOHLC.mockResolvedValue(cgDaily());
    const provider = createOperatorProvider({ waitForToken: true });
    const levels = await provider.getKeyLevels('BTC', 'CRYPTO');
    expect(mocks.getOHLC).toHaveBeenCalledWith('bitcoin', 30, { interval: 'daily' });
    expect(mocks.avFetch).not.toHaveBeenCalled();
    // previous day = second-to-last candle (i = 23)
    expect(levels.find((l) => l.category === 'PDH')?.price).toBe(123);
    expect(levels.find((l) => l.category === 'PDL')?.price).toBe(113);
    expect(levels.find((l) => l.category === 'MONTHLY_HIGH')?.price).toBe(124);
    expect(levels.some((l) => l.category === 'VWAP')).toBe(false); // no volume → no VWAP

    vi.setSystemTime(NOW + 5 * HOUR);
    await createOperatorProvider({ waitForToken: true }).getKeyLevels('BTC-USD', 'CRYPTO');
    expect(mocks.getOHLC).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW + 6 * HOUR + 1000);
    await provider.getKeyLevels('BTC', 'CRYPTO');
    expect(mocks.getOHLC).toHaveBeenCalledTimes(2);
  });

  it('concurrent requests for the same coin share one CoinGecko call', async () => {
    mocks.getOHLC.mockResolvedValue(cgDaily());
    const p = createOperatorProvider({ waitForToken: true });
    await Promise.all([p.getKeyLevels('BTC', 'CRYPTO'), p.getKeyLevels('BTC', 'CRYPTO'), p.getKeyLevels('btc', 'CRYPTO')]);
    expect(mocks.getOHLC).toHaveBeenCalledTimes(1);
  });

  it('CoinGecko failure falls back to AV daily levels, remembered briefly, then CoinGecko is retried', async () => {
    mocks.getOHLC.mockResolvedValue(null);
    mocks.avFetch.mockResolvedValue(avDailyPayload());
    const p = createOperatorProvider({ waitForToken: true });
    const levels = await p.getKeyLevels('BTC', 'CRYPTO');
    expect(avFns()).toEqual(['DIGITAL_CURRENCY_DAILY']);
    expect(levels.find((l) => l.category === 'PDH')?.price).toBe(60.5);

    vi.setSystemTime(NOW + 10 * 60_000);
    await p.getKeyLevels('BTC', 'CRYPTO');
    expect(mocks.getOHLC).toHaveBeenCalledTimes(1);
    expect(mocks.avFetch).toHaveBeenCalledTimes(1);

    vi.setSystemTime(NOW + 16 * 60_000);
    mocks.getOHLC.mockResolvedValue(cgDaily());
    const again = await p.getKeyLevels('BTC', 'CRYPTO');
    expect(mocks.getOHLC).toHaveBeenCalledTimes(2);
    expect(again.find((l) => l.category === 'PDH')?.price).toBe(123);
  });

  it('a total miss (both providers empty) is negatively cached for 5 minutes only', async () => {
    mocks.getOHLC.mockResolvedValue([]);
    mocks.avFetch.mockResolvedValue({});
    const p = createOperatorProvider({ waitForToken: true });
    expect(await p.getKeyLevels('BTC', 'CRYPTO')).toEqual([]);
    vi.setSystemTime(NOW + 4 * 60_000);
    await p.getKeyLevels('BTC', 'CRYPTO');
    expect(mocks.getOHLC).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 5 * 60_000 + 1000);
    await p.getKeyLevels('BTC', 'CRYPTO');
    expect(mocks.getOHLC).toHaveBeenCalledTimes(2);
  });

  it('with the CoinGecko kill-switch off, levels come from AV daily and CoinGecko is never called', async () => {
    delete process.env.OPERATOR_CG_FETCH_ENABLED;
    mocks.avFetch.mockResolvedValue(avDailyPayload());
    const levels = await createOperatorProvider({ waitForToken: true }).getKeyLevels('BTC', 'CRYPTO');
    expect(levels.length).toBeGreaterThan(0);
    expect(mocks.getOHLC).not.toHaveBeenCalled();
    expect(mocks.resolveSymbolToId).not.toHaveBeenCalled();
  });

  it('a symbol without a static id is resolved once; no id at all falls back to AV', async () => {
    mocks.resolveSymbolToId.mockResolvedValue(null);
    mocks.avFetch.mockResolvedValue(avDailyPayload());
    await createOperatorProvider({ waitForToken: true }).getKeyLevels('ZZZ', 'CRYPTO');
    expect(mocks.resolveSymbolToId).toHaveBeenCalledWith('ZZZ');
    expect(mocks.getOHLC).not.toHaveBeenCalled();
    expect(avFns()).toEqual(['DIGITAL_CURRENCY_DAILY']);
  });
});

describe('cgOhlcToDailyBars', () => {
  it('drops bad rows, sorts, and merges finer candles into one bar per UTC day', () => {
    const d = Date.parse('2026-09-25T00:00:00Z');
    const bars = cgOhlcToDailyBars([
      [d + 8 * HOUR, 11, 13, 10, 12],
      [d + 4 * HOUR, 10, 12, 9, 11],
      [d + DAY, 12, 14, 11, 13],
      [d + 2 * DAY, 1, 2, Number.NaN, 1],
      [d + 3 * DAY, 1, 2, 0.5],
    ], 'BTC');
    expect(bars).toEqual([
      expect.objectContaining({ timestamp: '2026-09-25', open: 10, high: 13, low: 9, close: 12, volume: 0, market: 'CRYPTO' }),
      expect.objectContaining({ timestamp: '2026-09-26', open: 12, high: 14, low: 11, close: 13 }),
    ]);
    expect(cgOhlcToDailyBars(null, 'BTC')).toEqual([]);
  });
});
