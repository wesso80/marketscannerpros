import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ q: vi.fn(), avDaily: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/marketData/client', () => ({ avFetchDailyBars: mocks.avDaily }));

import { parseFredCsv, fredCsvUrl } from '@/lib/macro/fredCsv';
import { classifyMarketRegime } from '@/lib/marketRegime';

const NOW = Date.UTC(2026, 8, 26, 3); // 26 Sep 2026 13:00 AEST
const dayStr = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString().slice(0, 10);

/** n daily closes ending `endOffset` days ago, newest first as the DB query returns them. */
function barRows(n: number, endOffset: number, close = (i: number) => 700 - i * 0.2) {
  return Array.from({ length: n }, (_, i) => ({ ts: new Date(NOW - (endOffset + i) * 86_400_000), close: close(i) }));
}
function macroRows(n: number, endOffset: number, value: number) {
  return Array.from({ length: n }, (_, i) => ({ observed_on: dayStr(endOffset + i), value }));
}
function csv(id: string, rows: Array<[string, string]>) {
  return [`observation_date,${id}`, ...rows.map(([d, v]) => `${d},${v}`)].join('\n');
}

type DbState = { vix: unknown[]; hy: unknown[]; spy: unknown[]; qqq: unknown[] };
function mockDb(state: DbState) {
  mocks.q.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM macro_series')) {
      if (params[0] === 'VIX') return state.vix;
      if (params[0] === 'CREDIT_HY_OAS') return state.hy;
      return [];
    }
    if (sql.includes('FROM ohlcv_bars')) return params[0] === 'SPY' ? state.spy : params[0] === 'QQQ' ? state.qqq : [];
    return [];
  });
}

async function freshLoader() {
  vi.resetModules();
  return (await import('@/lib/scoring/canonical/regimeOverlayData')).loadRegimeOverlayInputs;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mocks.q.mockReset();
  mocks.avDaily.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('FRED keyless CSV parsing', () => {
  it('parses fredgraph.csv, skips missing values, oldest first', () => {
    const rows = parseFredCsv('observation_date,VIXCLS\n2026-09-22,14.21\n2026-09-18,.\n2026-09-21,14.87\n2026-09-17,\njunk\n');
    expect(rows).toEqual([{ date: '2026-09-21', value: '14.87' }, { date: '2026-09-22', value: '14.21' }]);
    expect(fredCsvUrl('VIXCLS')).toBe('https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS');
    expect(fredCsvUrl('BAMLH0A0HYM2', '2026-01-01')).toContain('cosd=2026-01-01');
  });
});

describe('regime reason names each input date (OV-1)', () => {
  it('says which input is old instead of "latest VIX/SPY observation"', () => {
    const r = classifyMarketRegime({
      asOf: dayStr(108),
      vix: { level: 15, asOf: dayStr(108) },
      spy: { close: 110, sma50: 105, sma200: 100, asOf: new Date(NOW - 86_400_000).toISOString() },
    }, NOW);
    expect(r.available).toBe(false);
    if (r.available) return;
    expect(r.reason).toContain(`VIX as of ${dayStr(108)} (108 days old)`);
    expect(r.reason).toContain(`SPY as of ${dayStr(1)} (1 day old)`);
    expect(r.reason).not.toContain('VIX/SPY');
  });

  it('lists input dates and fallback sources when available', () => {
    const r = classifyMarketRegime({
      asOf: dayStr(4),
      vix: { level: 14.2, change5dPct: 1, asOf: dayStr(4), source: 'fred-csv' },
      spy: { close: 771, sma50: 761, sma200: 718, asOf: new Date(NOW - 86_400_000).toISOString(), source: 'stored' },
    }, NOW);
    expect(r).toMatchObject({ available: true, regime: 'TREND_UP' });
    if (!r.available) return;
    expect(r.reasons.join(' | ')).toContain(`Data: VIX as of ${dayStr(4)} (4 days old, FRED CSV), SPY as of ${dayStr(1)} (1 day old)`);
  });
});

describe('loadRegimeOverlayInputs stale-input fallbacks (OV-1)', () => {
  it('uses FRED CSV when stored VIX/HY OAS are stale, and keeps fresh stored SPY/QQQ without calling Alpha Vantage', async () => {
    mockDb({ vix: macroRows(6, 108, 18), hy: macroRows(21, 108, 3.5), spy: barRows(200, 1), qqq: barRows(200, 1) });
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('id=VIXCLS')) return new Response(csv('VIXCLS', [[dayStr(10), '16'], [dayStr(9), '15'], [dayStr(8), '15'], [dayStr(7), '14'], [dayStr(5), '14.87'], [dayStr(4), '14.21']]));
      if (url.includes('id=BAMLH0A0HYM2')) return new Response(csv('BAMLH0A0HYM2', Array.from({ length: 25 }, (_, i) => [dayStr(26 - i), (2.9 - i * 0.004).toFixed(3)] as [string, string])));
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const load = await freshLoader();
    const inputs = await load();
    expect(inputs.vix).toMatchObject({ level: 14.21, asOf: dayStr(4), source: 'fred-csv' });
    expect(inputs.asOf).toBe(dayStr(4));
    expect(inputs.hyOas).toMatchObject({ asOf: dayStr(2), source: 'fred-csv' });
    expect(inputs.spy).toMatchObject({ source: 'stored' });
    expect(mocks.avDaily).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.every(([u]) => String(u).startsWith('https://fred.stlouisfed.org/graph/fredgraph.csv?id='))).toBe(true);
    expect(classifyMarketRegime(inputs, NOW)).toMatchObject({ available: true });
  });

  it('fails soft: when FRED CSV is unreachable the stored (old) VIX is kept, never a default', async () => {
    mockDb({ vix: macroRows(6, 108, 18), hy: [], spy: barRows(200, 1), qqq: [] });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    mocks.avDaily.mockResolvedValue(null);
    const load = await freshLoader();
    const inputs = await load();
    expect(inputs.vix).toMatchObject({ level: 18, asOf: dayStr(108), source: 'stored' });
    expect(inputs.hyOas).toBeNull();
    expect(inputs.qqq).toBeNull();
    const r = classifyMarketRegime(inputs, NOW);
    expect(r.available).toBe(false);
  });

  it('fetches SPY/QQQ from Alpha Vantage (full, once per symbol) when stored bars are fewer than 200 or stale', async () => {
    mockDb({ vix: macroRows(6, 1, 15), hy: [], spy: barRows(150, 1), qqq: barRows(200, 30) });
    const avBars = Array.from({ length: 260 }, (_, i) => ({ date: dayStr(260 - i), ts: NOW - (260 - i) * 86_400_000, open: 1, high: 1, low: 1, close: 500 + i, volume: 1 }));
    mocks.avDaily.mockResolvedValue({ bars: avBars, fetchedAt: new Date(NOW).toISOString() });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const load = await freshLoader();
    const inputs = await load();
    expect(mocks.avDaily).toHaveBeenCalledTimes(2);
    expect(mocks.avDaily).toHaveBeenCalledWith('SPY', true);
    expect(mocks.avDaily).toHaveBeenCalledWith('QQQ', true);
    expect(inputs.spy).toMatchObject({ close: 759, source: 'alpha-vantage' });
    expect(inputs.qqq).toMatchObject({ source: 'alpha-vantage' });
    expect(inputs.vix).toMatchObject({ source: 'stored' });
  });

  it('keeps the stored trend when Alpha Vantage is not newer, and returns null (not a default) when neither has 200 bars', async () => {
    mockDb({ vix: macroRows(6, 1, 15), hy: [], spy: barRows(200, 30), qqq: barRows(50, 1) });
    mocks.avDaily.mockResolvedValue(null);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })));
    const load = await freshLoader();
    const inputs = await load();
    expect(inputs.spy).toMatchObject({ source: 'stored', asOf: new Date(NOW - 30 * 86_400_000).toISOString() });
    expect(inputs.qqq).toBeNull();
  });
});

describe('ingestFred without FRED_API_KEY (OV-1)', () => {
  it('uses the keyless CSV instead of ingesting nothing', async () => {
    const prev = process.env.FRED_API_KEY;
    delete process.env.FRED_API_KEY;
    try {
      mocks.q.mockResolvedValue([]);
      const fetchMock = vi.fn(async () => new Response(csv('VIXCLS', [[dayStr(5), '14.87'], [dayStr(4), '14.21']])));
      vi.stubGlobal('fetch', fetchMock);
      vi.resetModules();
      const { ingestFred } = await import('@/lib/macro/fred');
      const res = await ingestFred({ only: ['VIX'] });
      expect(res).toMatchObject({ ok: true, via: 'csv', ingested: 2, failed: 0 });
      expect(res.perSeries[0]).toMatchObject({ seriesKey: 'VIX', rows: 2, latest: dayStr(4) });
      expect(String(fetchMock.mock.calls[0][0])).toBe('https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS');
      const insert = mocks.q.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO macro_series ('));
      expect(insert?.[1]).toEqual(['VIX', dayStr(5), 14.87, 'VIX', dayStr(4), 14.21]);
    } finally {
      if (prev !== undefined) process.env.FRED_API_KEY = prev;
    }
  });

  it('reports failed series with reason fred-error', async () => {
    const prev = process.env.FRED_API_KEY;
    delete process.env.FRED_API_KEY;
    try {
      mocks.q.mockResolvedValue([]);
      vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
      vi.resetModules();
      const { ingestFred } = await import('@/lib/macro/fred');
      const res = await ingestFred({ only: ['VIX'] });
      expect(res).toMatchObject({ ok: false, reason: 'fred-error', via: 'csv', ingested: 0, failed: 1 });
    } finally {
      if (prev !== undefined) process.env.FRED_API_KEY = prev;
    }
  });
});
