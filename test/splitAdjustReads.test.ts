import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  UPSERT_ACTIONS_SQL,
  corporateActionsFromPayload,
  isMissingRelation,
  loadCorporateActions,
  recordCorporateActions,
  splitAdjustStoredBars,
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

const prior = { t: '2024-06-07T00:00:00.000Z', open: 200, high: 210, low: 190, close: 200, volume: 1000 };
const splitDay = { t: '2024-06-10T00:00:00.000Z', open: 100, high: 105, low: 95, close: 100, volume: 2000 };

describe('split adjustment on stored raw bars', () => {
  beforeEach(() => {
    upsert.mockClear();
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

  it('stops getBars from writing daily, weekly, and monthly rows, and still writes intraday', async () => {
    await getBars('NVDA', 'daily');
    await getBars('NVDA', 'weekly');
    await getBars('NVDA', 'monthly');
    expect(upsert).not.toHaveBeenCalled();
    await getBars('NVDA', '60min');
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][1]).toBe('60min');
  });

  it('adjusts the six long-indicator reads and leaves the labellers raw', () => {
    const readers = [
      'app/api/scanner/bulk/route.ts',
      'app/api/scanner/run/route.ts',
      'lib/scoring/canonical/barStore.ts',
      'lib/admin/decisionEvidence.ts',
      'lib/scoring/canonical/regimeOverlayData.ts',
      'lib/jarvis/radar/collect.ts',
    ];
    for (const path of readers) expect(readFileSync(path, 'utf8'), path).toContain('splitAdjustStoredBars');
    for (const path of ['lib/outcomes/positionHorizonLabeller.ts', 'lib/outcomes/aiOutcomePrices.ts', 'worker/label-outcomes.ts']) {
      expect(readFileSync(path, 'utf8'), path).not.toContain('splitAdjustStoredBars');
    }
    const worker = readFileSync('worker/ingest-data.ts', 'utf8');
    expect(worker).toContain('recordCorporateActions(symbol, captured.payload');
    expect(worker.match(/TIME_SERIES_DAILY_ADJUSTED/g)).toHaveLength(1);
    const market = readFileSync('lib/marketData/index.ts', 'utf8');
    expect(market).toContain('if (!dailyFamily) await pgUpsertBars');
  });
});
