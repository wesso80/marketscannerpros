import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { q } from '@/lib/db';
import { pgReadBars } from '@/lib/marketData/store';
import {
  UPSERT_ACTIONS_SQL,
  corporateActionsFromPayload,
  isMissingRelation,
  loadCorporateActions,
  rawOhlcFromDailyPayload,
  recordCorporateActions,
  splitAdjustStoredBars,
  splitOnlyOhlcFromDailyPayload,
} from '@/lib/scanner/corporateActions';

const upsert = vi.hoisted(() => vi.fn(async () => 1));

vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));
vi.mock('@/lib/marketData/cache', () => ({
  rGet: vi.fn(async () => null),
  rSet: vi.fn(async () => undefined),
  CK: { bars: (s: string, t: string) => `bars:${s}:${t}` },
}));
vi.mock('@/lib/marketData/client', () => ({
  avFetchDailyBars: vi.fn(async () => ({
    bars: [{ date: '2026-06-10', ts: Date.parse('2026-06-10T00:00:00Z'), open: 10, high: 11, low: 9, close: 10, volume: 100 }],
    fetchedAt: new Date().toISOString(),
  })),
  avFetchIntradayBars: vi.fn(async () => ({
    bars: [{ date: '2026-06-10', ts: Date.parse('2026-06-10T14:00:00Z'), open: 10, high: 11, low: 9, close: 10, volume: 100 }],
    fetchedAt: new Date().toISOString(),
  })),
  avFetchQuote: vi.fn(),
  avFetchOverview: vi.fn(),
  avFetchEarnings: vi.fn(),
  avFetchOptionsChain: vi.fn(),
  avFetchNews: vi.fn(),
}));
vi.mock('@/lib/marketData/store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/marketData/store')>('@/lib/marketData/store');
  return { ...actual, pgUpsertBars: upsert };
});

import { getBars } from '@/lib/marketData';
import * as client from '@/lib/marketData/client';

const prior = { t: '2024-06-07T00:00:00.000Z', open: 200, high: 210, low: 190, close: 200, volume: 1000 };
const splitDay = { t: '2024-06-10T00:00:00.000Z', open: 100, high: 105, low: 95, close: 100, volume: 2000 };

describe('split adjustment on stored raw bars', () => {
  beforeEach(() => {
    upsert.mockClear();
    vi.mocked(client.avFetchDailyBars).mockClear();
    vi.mocked(q).mockReset();
    vi.mocked(q).mockImplementation(async () => []);
    vi.useRealTimers();
  });

  it('halves the pre-split close and doubles its volume, and leaves the split day alone', () => {
    const out = splitAdjustStoredBars([prior, splitDay], [{ session: '2024-06-10', splitCoefficient: 2, dividendAmount: 0 }]);
    expect(out[0]).toMatchObject({ open: 100, high: 105, low: 95, close: 100, volume: 2000 });
    expect(out[1]).toBe(splitDay);
    expect(prior.close).toBe(200);
  });

  it('compounds two later splits', () => {
    const bars = [
      { t: '2024-01-02T00:00:00.000Z', close: 400, volume: 100 },
      { t: '2024-06-10T00:00:00.000Z', close: 200, volume: 200 },
      { t: '2024-12-02T00:00:00.000Z', close: 100, volume: 400 },
    ];
    const out = splitAdjustStoredBars(bars, [
      { session: '2024-06-10', splitCoefficient: 2, dividendAmount: 0 },
      { session: '2024-12-02', splitCoefficient: 2, dividendAmount: 0 },
    ]);
    expect(out.map((bar) => bar.close)).toEqual([100, 100, 100]);
    expect(out.map((bar) => bar.volume)).toEqual([400, 400, 400]);
  });

  it('does not move a bar for a dividend when the split coefficient is 1', () => {
    const payload = {
      'Time Series (Daily)': {
        '2024-06-07': {
          '4. close': '200',
          '5. adjusted close': '100',
          '7. dividend amount': '0',
          '8. split coefficient': '1',
        },
        '2024-06-10': {
          '4. close': '100',
          '5. adjusted close': '99.5',
          '7. dividend amount': '0.50',
          '8. split coefficient': '1.0',
        },
      },
    };
    const actions = corporateActionsFromPayload(payload);
    expect(actions).toEqual([{ session: '2024-06-10', splitCoefficient: 1, dividendAmount: 0.5 }]);
    const out = splitAdjustStoredBars([prior], actions);
    expect(out[0]).toBe(prior);
    expect(out[0].close).toBe(200);
  });

  it('records split and dividend facts and ignores a missing table', async () => {
    const payload = {
      'Time Series (Daily)': {
        '2024-06-10': { '4. close': '1204.4', '5. adjusted close': '100', '7. dividend amount': '0', '8. split coefficient': '10' },
      },
    };
    const calls: unknown[][] = [];
    const written = await recordCorporateActions('nvda', payload, async (sql, params) => {
      calls.push([sql, params]);
    });
    expect(written).toBe(1);
    expect(calls[0][0]).toBe(UPSERT_ACTIONS_SQL);
    expect(calls[0][1]).toEqual(['NVDA', ['2024-06-10'], [10], [0]]);
    const missing = Object.assign(new Error('relation "equity_corporate_actions" does not exist'), { code: '42P01' });
    expect(isMissingRelation(missing)).toBe(true);
    await expect(recordCorporateActions('NVDA', payload, async () => { throw missing; })).resolves.toBe(0);
    await expect(loadCorporateActions(['NVDA'], async () => { throw missing; })).resolves.toEqual(new Map());
  });

  it('returns the fetched daily bars when recording corporate actions fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const secret = 'ada@example.com';
    const payload = {
      'Time Series (Daily)': {
        '2024-06-10': {
          '1. open': '100', '2. high': '110', '3. low': '90', '4. close': '100',
          '5. adjusted close': '99', '6. volume': '2000', '7. dividend amount': '0', '8. split coefficient': '2',
        },
      },
    };
    vi.mocked(client.avFetchDailyBars).mockResolvedValueOnce({
      bars: [{ date: '2024-06-10', ts: Date.parse('2024-06-10T00:00:00Z'), open: 100, high: 110, low: 90, close: 100, volume: 2000 }],
      fetchedAt: new Date().toISOString(),
      payload,
    });
    vi.mocked(q).mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO equity_corporate_actions')) throw new Error(`db down ${secret}`);
      if (sql.includes('symbol_universe')) return [];
      return [];
    });
    const env = await getBars('ZZZ', 'daily');
    expect(env.fromCache).toBe('av');
    expect(env.error).toBeUndefined();
    expect(env.data?.map((bar) => bar.close)).toEqual([100]);
    expect(upsert).toHaveBeenCalledTimes(1);
    const logged = warn.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
    expect(logged).toContain('[getBars] corporate action record failed for ZZZ');
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain('db down');
    warn.mockRestore();
  });

  it('stops getBars from writing daily, weekly, and monthly rows, and still writes intraday', async () => {
    await getBars('NVDA', 'daily');
    await getBars('NVDA', 'weekly');
    await getBars('NVDA', 'monthly');
    expect(upsert).not.toHaveBeenCalled();
    await getBars('NVDA', '60min');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][1]).toBe('60min');
  });

  it('adjusts the six long-indicator reads and keeps only the raw-entry labellers raw', () => {
    const readers = [
      'app/api/scanner/bulk/route.ts',
      'app/api/scanner/run/route.ts',
      'lib/scoring/canonical/barStore.ts',
      'lib/admin/decisionEvidence.ts',
      'lib/scoring/canonical/regimeOverlayData.ts',
      'lib/jarvis/radar/collect.ts',
    ];
    for (const path of readers) expect(readFileSync(path, 'utf8'), path).toContain('splitAdjustStoredBars');
    for (const path of ['lib/outcomes/positionHorizonLabeller.ts', 'lib/outcomes/aiOutcomePrices.ts']) {
      expect(readFileSync(path, 'utf8'), path).not.toContain('splitAdjustStoredBars');
    }
    const outcomeWorker = readFileSync('worker/label-outcomes.ts', 'utf8');
    expect(outcomeWorker).toContain('price_at_signal is the raw print');
    expect(outcomeWorker).toContain('positionHorizonLabeller and aiOutcomePrices are split-only');
    expect(outcomeWorker).not.toMatch(/splitAdjustStoredBars\s*\(/);
    const worker = readFileSync('worker/ingest-data.ts', 'utf8');
    expect(worker).toContain('recordCorporateActions(symbol, captured.payload');
    expect(worker.match(/TIME_SERIES_DAILY_ADJUSTED/g)).toHaveLength(1);
    const market = readFileSync('lib/marketData/index.ts', 'utf8');
    expect(market).toContain('else if (!dailyFamily)');
    expect(market).toContain('recordCorporateActions(symbol, payload)');
    const edge = readFileSync('lib/edge/outcomeLabeller.ts', 'utf8');
    expect(edge).toContain('price_at_signal is the raw print');
    expect(edge).toContain('positionHorizonLabeller and aiOutcomePrices are split-only');
    expect(readFileSync('lib/outcomes/positionHorizonLabeller.ts', 'utf8')).toContain('are split-only');
    expect(readFileSync('lib/outcomes/aiOutcomePrices.ts', 'utf8')).toContain('are split-only');
    for (const path of ['lib/outcomes/positionHorizonLabeller.ts', 'lib/outcomes/aiOutcomePrices.ts']) {
      expect(readFileSync(path, 'utf8'), path).not.toContain('splitAdjustStoredBars');
    }
  });

  it('returns one split-only basis from postgres and from the AV payload, and does not use the adjusted close', async () => {
    const payload = {
      'Time Series (Daily)': {
        '2024-06-07': {
          '1. open': '200', '2. high': '210', '3. low': '190', '4. close': '200',
          '5. adjusted close': '90', '6. volume': '1000', '7. dividend amount': '1.00', '8. split coefficient': '1',
        },
        '2024-06-10': {
          '1. open': '100', '2. high': '110', '3. low': '90', '4. close': '100',
          '5. adjusted close': '99', '6. volume': '2000', '7. dividend amount': '0', '8. split coefficient': '2',
        },
      },
    };
    const splitOnly = splitOnlyOhlcFromDailyPayload(payload);
    expect(splitOnly.map((bar) => bar.close)).toEqual([100, 100]);
    expect(splitOnly.map((bar) => bar.volume)).toEqual([2000, 2000]);
    expect(rawOhlcFromDailyPayload(payload).map((bar) => bar.close)).toEqual([200, 100]);

    vi.mocked(q).mockImplementation(async (sql: string) => {
      if (sql.includes('equity_corporate_actions')) {
        return [{ symbol: 'NVDA', session: '2024-06-10', split_coefficient: '2', dividend_amount: '1' }];
      }
      if (sql.includes('ohlcv_bars')) {
        return [
          { ts: new Date('2024-06-10T00:00:00.000Z'), open: '100', high: '110', low: '90', close: '100', volume: '2000' },
          { ts: new Date('2024-06-07T00:00:00.000Z'), open: '200', high: '210', low: '190', close: '200', volume: '1000' },
        ];
      }
      return [];
    });
    const stored = await pgReadBars('nvda', 'daily');
    expect(stored?.bars.map((bar) => bar.close)).toEqual([100, 100]);
    expect(stored?.bars.map((bar) => bar.volume)).toEqual([2000, 2000]);
    const intraday = await pgReadBars('nvda', '60min');
    expect(intraday?.bars[0].close).toBe(200);

    vi.mocked(client.avFetchDailyBars).mockResolvedValueOnce({
      bars: [{ date: '2024-06-10', ts: Date.parse('2024-06-10T00:00:00Z'), open: 99, high: 108.9, low: 89.1, close: 99, volume: 2000 }],
      fetchedAt: new Date().toISOString(),
      payload,
    });
    vi.mocked(q).mockImplementation(async (sql: string) => sql.includes('symbol_universe') ? [] : []);
    const missed = await getBars('ZZZ', 'daily');
    expect(missed.fromCache).toBe('av');
    expect(missed.data?.map((bar) => bar.close)).toEqual([100, 100]);
    expect(missed.data?.some((bar) => bar.close === 90 || bar.close === 99)).toBe(false);
    expect(vi.mocked(client.avFetchDailyBars)).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0]).toBe('ZZZ');
    expect(upsert.mock.calls[0][1]).toBe('daily');
    expect(upsert.mock.calls[0][2].map((bar: { close: number }) => bar.close)).toEqual([200, 100]);
  });

  it('serves a fresh raw store split-only and does not call Alpha Vantage', async () => {
    vi.useFakeTimers({ now: Date.parse('2026-10-10T15:00:00Z'), toFake: ['Date'] });
    const last = Date.parse('2026-10-09T00:00:00.000Z');
    const rows = Array.from({ length: 100 }, (_, i) => {
      const ts = new Date(last - i * 86_400_000);
      const close = ts.toISOString().slice(0, 10) < '2026-09-01' ? 200 : 100;
      return { ts, open: String(close), high: String(close + 1), low: String(close - 1), close: String(close), volume: '1000' };
    });
    vi.mocked(q).mockImplementation(async (sql: string) => {
      if (sql.includes('equity_corporate_actions')) {
        return [{ symbol: 'NVDA', session: '2026-09-01', split_coefficient: '2', dividend_amount: '0.4' }];
      }
      if (sql.includes('ohlcv_bars')) return rows;
      return [];
    });
    const env = await getBars('NVDA', 'daily');
    expect(env.fromCache).toBe('postgres');
    expect(vi.mocked(client.avFetchDailyBars)).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    const before = env.data?.find((bar) => bar.date === '2026-08-31');
    const onSplit = env.data?.find((bar) => bar.date === '2026-09-01');
    expect(before?.close).toBe(100);
    expect(before?.volume).toBe(2000);
    expect(onSplit?.close).toBe(100);
  });

  it('does not write daily bars for a worker-owned symbol, and still makes one AV call on a miss', async () => {
    const payload = {
      'Time Series (Daily)': {
        '2026-10-09': {
          '1. open': '50', '2. high': '51', '3. low': '49', '4. close': '50',
          '5. adjusted close': '40', '6. volume': '10', '8. split coefficient': '1',
        },
      },
    };
    vi.mocked(client.avFetchDailyBars).mockResolvedValueOnce({
      bars: [{ date: '2026-10-09', ts: Date.parse('2026-10-09T00:00:00Z'), open: 40, high: 40.8, low: 39.2, close: 40, volume: 10 }],
      fetchedAt: new Date().toISOString(),
      payload,
    });
    vi.mocked(q).mockImplementation(async (sql: string) => sql.includes('symbol_universe') ? [{ n: 1 }] : []);
    const env = await getBars('AAPL', 'daily');
    expect(env.data?.[0].close).toBe(50);
    expect(vi.mocked(client.avFetchDailyBars)).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
    expect(vi.mocked(q).mock.calls.some(([sql]) => String(sql).includes('equity_corporate_actions'))).toBe(false);
  });

  it('records a non-universe split from the same payload so the warm read matches the miss', async () => {
    const payload = {
      'Time Series (Daily)': {
        '2024-06-07': {
          '1. open': '1313', '2. high': '1320', '3. low': '1300', '4. close': '1313',
          '5. adjusted close': '100', '6. volume': '100', '7. dividend amount': '0', '8. split coefficient': '1',
        },
        '2024-06-10': {
          '1. open': '131.3', '2. high': '140', '3. low': '120', '4. close': '131.3',
          '5. adjusted close': '99', '6. volume': '1000', '7. dividend amount': '0', '8. split coefficient': '10',
        },
      },
    };
    vi.mocked(client.avFetchDailyBars).mockResolvedValue({
      bars: [{ date: '2024-06-10', ts: Date.parse('2024-06-10T00:00:00Z'), open: 99, high: 105, low: 90, close: 99, volume: 1000 }],
      fetchedAt: new Date().toISOString(),
      payload,
    });
    const recorded: unknown[][] = [];
    vi.mocked(q).mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes('INSERT INTO equity_corporate_actions')) {
        recorded.push(params ?? []);
        return [];
      }
      if (sql.includes('symbol_universe')) return [];
      if (sql.includes('ohlcv_bars')) {
        const written = upsert.mock.calls.at(-1)?.[2] as Array<{ ts: number; open: number; high: number; low: number; close: number; volume: number }> | undefined;
        if (!written) return [];
        const rows = [
          { ts: new Date('2024-01-02T00:00:00.000Z'), open: '1313', high: '1320', low: '1300', close: '1313', volume: '100' },
          ...written.map((bar) => ({
            ts: new Date(bar.ts), open: String(bar.open), high: String(bar.high), low: String(bar.low), close: String(bar.close), volume: String(bar.volume),
          })),
        ];
        return rows.sort((a, b) => b.ts.getTime() - a.ts.getTime());
      }
      if (sql.includes('equity_corporate_actions')) {
        return recorded.length
          ? [{ symbol: 'XYZ', session: '2024-06-10', split_coefficient: '10', dividend_amount: '0' }]
          : [];
      }
      return [];
    });

    const missed = await getBars('XYZ', 'daily');
    expect(missed.fromCache).toBe('av');
    expect(missed.data?.map((bar) => bar.close)).toEqual([131.3, 131.3]);
    expect(missed.data?.some((bar) => bar.close === 1313 || bar.close === 99 || bar.close === 100)).toBe(false);
    expect(vi.mocked(client.avFetchDailyBars)).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][2].map((bar: { close: number }) => bar.close)).toEqual([1313, 131.3]);
    expect(recorded).toHaveLength(1);
    expect(recorded[0][0]).toBe('XYZ');
    expect(recorded[0][1]).toEqual(['2024-06-10']);
    expect(recorded[0][2]).toEqual([10]);

    const warm = await pgReadBars('XYZ', 'daily');
    expect(warm?.bars.map((bar) => bar.close)).toEqual([131.3, 131.3, 131.3]);
    expect(warm?.bars.map((bar) => bar.date)).toEqual(['2024-01-02', '2024-06-07', '2024-06-10']);
    expect(vi.mocked(client.avFetchDailyBars)).toHaveBeenCalledTimes(1);

    const { loadEquityDailyOhlc } = await import('@/lib/outcomes/positionHorizonLabeller');
    const merged = await loadEquityDailyOhlc('XYZ');
    expect(merged.bars.map((bar) => bar.close)).toEqual([131.3, 131.3, 131.3]);
    expect(merged.bars.map((bar) => bar.day)).toEqual(['2024-01-02', '2024-06-07', '2024-06-10']);
    expect(merged.complete).toBe(true);
    // The merge's cache read is the same fetch the miss already made, plus one more only because the stored tail is still short of 100 bars.
    expect(vi.mocked(client.avFetchDailyBars)).toHaveBeenCalledTimes(2);
  });
});
