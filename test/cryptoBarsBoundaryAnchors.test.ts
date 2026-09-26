/**
 * CoinGecko history requests end on bar boundaries so identical URLs repeat (fetch-cache hits), without changing the
 * bars readers get; plus the incremental daily read the ingest worker uses.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = 86_400_000;
let series: number[][] = []; // CoinGecko rows: [candle CLOSE ms, o, h, l, c]
function makeSeries(throughCloseMs: number) {
  series = [];
  let c = 100;
  for (let t = Date.parse('2024-01-01T00:00:00Z'); t <= throughCloseMs; t += DAY) {
    const o = c; c = c * (1 + Math.sin(t / DAY / 7) * 0.01);
    series.push([t, o, Math.max(o, c) * 1.01, Math.min(o, c) * 0.99, c]);
  }
}

vi.mock('@/lib/coingecko', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getOHLCRange: vi.fn(async (_id: string, from: number, to: number) => {
    const rows = series.filter((r) => r[0] / 1000 > from && r[0] / 1000 <= to);
    // CoinGecko also returns the still-open candle (stamped at its coming close).
    const last = series[series.length - 1];
    if (last && to * 1000 > last[0]) rows.push([last[0] + DAY, last[4], last[4] * 1.002, last[4] * 0.998, last[4] * 1.001]);
    return rows;
  }),
  getMarketChartRange: vi.fn(async (_id: string, from: number, to: number) => ({
    prices: [],
    market_caps: [],
    total_volumes: [
      ...series.filter((r) => r[0] / 1000 >= from && r[0] / 1000 <= to).map((r) => [r[0], 1_000 + (r[0] / DAY) % 97] as [number, number]),
      [to * 1000, 5_555] as [number, number],
    ],
  })),
  resolveSymbolToId: vi.fn(async () => 'bitcoin'),
}));

import * as cg from '@/lib/coingecko';
import { cryptoRequestAnchors, fetchCryptoDailyIncrement, fetchCryptoSeries } from '@/lib/scanner/cryptoBars';

const ohlc = () => (cg.getOHLCRange as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, number, number, { cacheSeconds?: number } | undefined]>;
const chart = () => (cg.getMarketChartRange as unknown as ReturnType<typeof vi.fn>).mock.calls as Array<[string, number, number]>;

/** The daily closes the pre-change windows returned: (nowS − 360 d, nowS], nowS = now − 60 s. */
function legacyDailyOpens(nowMs: number): string[] {
  const nowS = Math.floor(nowMs / 1000) - 60;
  return series.filter((r) => r[0] / 1000 > nowS - 360 * 86_400 && r[0] / 1000 <= nowS).map((r) => new Date(r[0] - DAY).toISOString());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cryptoRequestAnchors', () => {
  it('trails now by ≥ 60 s, floors to the minute, and anchors the UTC day of that instant', () => {
    const a = cryptoRequestAnchors(Date.parse('2026-09-27T06:30:42.500Z'));
    expect(new Date(a.liveEndS * 1000).toISOString()).toBe('2026-09-27T06:29:00.000Z');
    expect(new Date(a.dayStartS * 1000).toISOString()).toBe('2026-09-27T00:00:00.000Z');
    const b = cryptoRequestAnchors(Date.parse('2026-09-27T00:00:30Z'));
    expect(new Date(b.dayStartS * 1000).toISOString()).toBe('2026-09-26T00:00:00.000Z');
    // The minute right after 00:00 UTC is not floored onto the boundary (keeps the new day's open candle).
    const c = cryptoRequestAnchors(Date.parse('2026-09-27T00:01:10Z'));
    expect(new Date(c.liveEndS * 1000).toISOString()).toBe('2026-09-27T00:00:10.000Z');
  });
});

describe('daily history windows', () => {
  for (const at of ['2026-09-27T00:05:00Z', '2026-09-27T06:00:17Z', '2026-09-27T23:59:59Z', '2026-09-27T00:01:10Z']) {
    it(`returns exactly the completed bars the old windows returned (${at})`, async () => {
      const now = Date.parse(at);
      makeSeries(Math.floor(now / DAY) * DAY);
      const s = await fetchCryptoSeries('BTC', 'daily', now, { coinId: 'bitcoin' });
      expect(s.bars.map((b) => b.t)).toEqual(legacyDailyOpens(now).filter((t) => Date.parse(t) + DAY <= now));
      expect(s.bars.length).toBeGreaterThanOrEqual(359);
      expect(s.partialBar).not.toBeNull(); // the open candle (current price) is still returned
      expect(ohlc()).toHaveLength(2);
      expect(chart()).toHaveLength(1);
      // Volumes still join (the latest completed bar keeps CoinGecko's live 24 h point, as before).
      expect(s.bars.at(-1)!.volume).toBe(5_555);
    });
  }

  it('completed windows keep the same URL all UTC day and are cached longer; the live window ends on a minute', async () => {
    makeSeries(Date.parse('2026-09-27T00:00:00Z'));
    await fetchCryptoSeries('BTC', 'daily', Date.parse('2026-09-27T06:00:17Z'), { coinId: 'bitcoin', dailyWindows: 4 });
    const morning = ohlc().map((c) => [c[1], c[2]]);
    vi.clearAllMocks();
    await fetchCryptoSeries('BTC', 'daily', Date.parse('2026-09-27T18:44:03Z'), { coinId: 'bitcoin', dailyWindows: 4 });
    const evening = ohlc().map((c) => [c[1], c[2]]);
    expect(evening.slice(1)).toEqual(morning.slice(1)); // windows 1..3 end on 00:00 UTC boundaries
    expect(evening[0]).not.toEqual(morning[0]); // window 0 is the live edge
    expect(evening[0][1] % 60).toBe(0);
    for (const c of ohlc().slice(1)) {
      expect(c[2] % 86_400).toBe(0);
      expect(c[2] - c[1]).toBeLessThanOrEqual(180 * 86_400);
      expect(c[3]?.cacheSeconds).toBe(6 * 3600);
    }
    expect(ohlc()[0][3]?.cacheSeconds).toBeUndefined();
  });

  it('hourly and 15m requests also end on a minute boundary', async () => {
    makeSeries(Date.parse('2026-09-27T00:00:00Z'));
    await fetchCryptoSeries('BTC', '1h', Date.parse('2026-09-27T06:00:17Z'), { coinId: 'bitcoin' });
    await fetchCryptoSeries('BTC', '15m', Date.parse('2026-09-27T06:00:17Z'), { coinId: 'bitcoin' }).catch(() => null);
    expect(ohlc()[0][2] % 60).toBe(0);
    expect(chart()[0][2] % 60).toBe(0);
  });
});

describe('fetchCryptoDailyIncrement', () => {
  it('reads only the gap (+2-day overlap) in 2 calls and returns completed bars with volumes', async () => {
    const now = Date.parse('2026-09-27T01:00:00Z');
    makeSeries(Date.parse('2026-09-27T00:00:00Z'));
    const heldLastOpen = Date.parse('2026-09-25T00:00:00Z');
    const inc = await fetchCryptoDailyIncrement('bitcoin', heldLastOpen, now);
    expect(ohlc()).toHaveLength(1);
    expect(chart()).toHaveLength(1);
    const [, from, to] = ohlc()[0];
    expect(from).toBe(heldLastOpen / 1000 - 2 * 86_400);
    expect(to % 60).toBe(0);
    expect(chart()[0][2] - chart()[0][1]).toBeGreaterThan(90 * 86_400); // daily-granularity volume points
    expect(inc!.bars.map((b) => b.t)).toEqual([
      '2026-09-23T00:00:00.000Z', '2026-09-24T00:00:00.000Z', '2026-09-25T00:00:00.000Z', '2026-09-26T00:00:00.000Z',
    ]);
    expect(inc!.bars.every((b) => typeof b.volume === 'number')).toBe(true);
  });

  it('returns null for a gap longer than one daily window (caller refetches the full history)', async () => {
    makeSeries(Date.parse('2026-09-27T00:00:00Z'));
    expect(await fetchCryptoDailyIncrement('bitcoin', Date.parse('2026-01-01T00:00:00Z'), Date.parse('2026-09-27T01:00:00Z'))).toBeNull();
    expect(ohlc()).toHaveLength(0);
  });

  it('throws when CoinGecko returns no OHLC at all', async () => {
    (cg.getOHLCRange as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    await expect(fetchCryptoDailyIncrement('bitcoin', Date.parse('2026-09-25T00:00:00Z'), Date.parse('2026-09-27T01:00:00Z'))).rejects.toThrow();
  });
});
