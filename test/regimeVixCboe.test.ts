/**
 * VIX comes from Cboe's free daily CSV first. FRED (stored VIXCLS, then its keyless CSV) is the fallback
 * when Cboe errors, times out, or parses to nothing. Alpha Vantage INDEX_DATA is not called for VIX.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ q: vi.fn(), avDaily: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/marketData/client', () => ({ avFetchDailyBars: mocks.avDaily }));

import { CBOE_VIX_SOURCE_LABEL, CBOE_VIX_TIMEOUT_MS, parseCboeVixCsv } from '@/lib/macro/cboeVix';
import { classifyMarketRegime } from '@/lib/marketRegime';

const NOW = Date.UTC(2026, 9, 6, 16); // Tue 6 Oct 2026 12:00 ET, during the session

/** Oldest-first Cboe file. A bad row and a blank row sit around the last valid close (10/05/2026, 15.52). */
const CBOE_CSV = [
  'DATE,OPEN,HIGH,LOW,CLOSE',
  '09/28/2026,16.160000,16.620000,15.680000,16.070000',
  '09/29/2026,16.170000,16.440000,15.730000,16.040000',
  '09/30/2026,15.930000,16.610000,15.620000,16.340000',
  '10/01/2026,16.330000,17.590000,16.210000,16.390000',
  '10/02/2026,16.150000,16.240000,15.300000,15.310000',
  '10/03/2026,1,2,3,not-a-close',
  '10/05/2026,16.240000,16.380000,15.480000,15.520000',
  '',
  ',',
  '10/06/2026,1,2,3,xx',
].join('\n');

const FRED_CSV = [
  'observation_date,VIXCLS',
  '2026-09-25,16.50',
  '2026-09-28,16.07',
  '2026-09-29,16.04',
  '2026-09-30,16.34',
  '2026-10-01,16.39',
  '2026-10-02,16.11',
].join('\n');

function barRows(n: number, endOffset: number) {
  return Array.from({ length: n }, (_, i) => ({ ts: new Date(NOW - (endOffset + i) * 86_400_000), close: 700 - i * 0.2 }));
}
function macroRows(n: number, endDate: string, value: number) {
  return Array.from({ length: n }, (_, i) => ({ observed_on: endDate, value: value + i }));
}
function mockDb(vix: unknown[]) {
  mocks.q.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM macro_series')) return params[0] === 'VIX' ? vix : [];
    if (sql.includes('FROM ohlcv_bars')) return params[0] === 'SPY' || params[0] === 'QQQ' ? barRows(200, 1) : [];
    return [];
  });
}
async function freshLoader() {
  vi.resetModules();
  return (await import('@/lib/scoring/canonical/regimeOverlayData')).loadRegimeOverlayInputs;
}

let prevKey: string | undefined;
beforeEach(() => {
  prevKey = process.env.ALPHA_VANTAGE_API_KEY;
  process.env.ALPHA_VANTAGE_API_KEY = 'test-key';
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  mocks.q.mockReset();
  mocks.avDaily.mockReset();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (prevKey === undefined) delete process.env.ALPHA_VANTAGE_API_KEY; else process.env.ALPHA_VANTAGE_API_KEY = prevKey;
});

describe('Cboe VIX CSV parsing', () => {
  it('keeps the last valid row and reads MM/DD/YYYY as a US calendar date', () => {
    const rows = parseCboeVixCsv(CBOE_CSV);
    expect(rows.map((r) => r.on)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05']);
    expect(rows[rows.length - 1]).toEqual({ on: '2026-10-05', value: 15.52 });
    expect(rows.some((r) => r.on === '2026-10-03' || r.on === '2026-10-06')).toBe(false);
    expect(parseCboeVixCsv('DATE,OPEN,HIGH,LOW,CLOSE\n\n13/40/2026,1,2,3,9\n')).toEqual([]);
    expect(parseCboeVixCsv('')).toEqual([]);
  });
});

describe('regime VIX: Cboe first, FRED fallback', () => {
  it('uses the Cboe close first and labels the source', async () => {
    mockDb(macroRows(6, '2026-09-01', 18));
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('VIX_History.csv')) return new Response(CBOE_CSV);
      if (String(url).includes('id=VIXCLS')) return new Response(FRED_CSV);
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const inputs = await (await freshLoader())();
    expect(inputs.vix).toMatchObject({ level: 15.52, asOf: '2026-10-05', source: 'cboe', note: null });
    expect(inputs.asOf).toBe('2026-10-05');
    expect(inputs.vix!.change5dPct).toBeCloseTo((15.52 / 16.07 - 1) * 100, 6);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('id=VIXCLS'))).toBe(false);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('INDEX_DATA'))).toBe(false);

    const cboeCall = fetchMock.mock.calls.find(([u]) => String(u).includes('VIX_History.csv'));
    expect(String(cboeCall?.[0])).toBe('https://cdn.cboe.com/api/global/us_indices/daily_prices/VIX_History.csv');
    expect(cboeCall?.[1]).toMatchObject({
      redirect: 'follow',
      headers: { 'User-Agent': expect.stringMatching(/Mozilla\/5\.0/) },
    });
    expect(cboeCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
    expect(CBOE_VIX_TIMEOUT_MS).toBe(10_000);

    const regime = classifyMarketRegime(inputs, NOW);
    expect(regime).toMatchObject({ available: true, stale: false });
    if (regime.available) expect(regime.reasons.join(' | ')).toContain(`VIX as of 2026-10-05 (1 day old, ${CBOE_VIX_SOURCE_LABEL})`);

    const { defaultCrossAssetDeps } = await import('@/lib/crossAsset/liveInputs');
    expect(await defaultCrossAssetDeps.vix()).toMatchObject({ level: 15.52, asOf: '2026-10-05', source: CBOE_VIX_SOURCE_LABEL });
  });

  it('falls back to FRED when Cboe returns a non-200', async () => {
    mockDb(macroRows(6, '2026-09-01', 18));
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('VIX_History.csv')) return new Response(CBOE_CSV, { status: 503 });
      if (String(url).includes('id=VIXCLS')) return new Response(FRED_CSV);
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const inputs = await (await freshLoader())();
    expect(inputs.vix).toMatchObject({ level: 16.11, asOf: '2026-10-02', source: 'fred-csv' });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('VIX_History.csv'))).toBe(true);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('id=VIXCLS'))).toBe(true);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('INDEX_DATA'))).toBe(false);
  });

  it('falls back to FRED when the Cboe fetch times out', async () => {
    mockDb(macroRows(6, '2026-09-01', 18));
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('VIX_History.csv')) {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }
      if (String(url).includes('id=VIXCLS')) return new Response(FRED_CSV);
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const inputs = await (await freshLoader())();
    expect(inputs.vix).toMatchObject({ level: 16.11, asOf: '2026-10-02', source: 'fred-csv' });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('INDEX_DATA'))).toBe(false);
  });

  it('falls back to FRED when the Cboe file parses to nothing', async () => {
    mockDb(macroRows(6, '2026-09-01', 18));
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('VIX_History.csv')) return new Response('DATE,OPEN,HIGH,LOW,CLOSE\n\nnot,a,row\n');
      if (String(url).includes('id=VIXCLS')) return new Response(FRED_CSV);
      return new Response('', { status: 404 });
    }));
    const inputs = await (await freshLoader())();
    expect(inputs.vix).toMatchObject({ level: 16.11, asOf: '2026-10-02', source: 'fred-csv' });
  });

  it('does not call Alpha Vantage INDEX_DATA for VIX', async () => {
    mockDb(macroRows(6, '2026-09-01', 18));
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).includes('VIX_History.csv')) return new Response(CBOE_CSV);
      return new Response('', { status: 404 });
    }));
    const first = await (await freshLoader())();
    expect(first.vix).toMatchObject({ source: 'cboe', level: 15.52 });

    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(String(url));
      if (String(url).includes('VIX_History.csv')) return new Response('denied', { status: 403 });
      if (String(url).includes('id=VIXCLS')) return new Response(FRED_CSV);
      return new Response(JSON.stringify({ Note: 'You are not yet entitled to index data access.' }), { status: 200 });
    }));
    const second = await (await freshLoader())();
    expect(second.vix).toMatchObject({ source: 'fred-csv', level: 16.11 });
    expect(urls.some((u) => u.includes('INDEX_DATA') || u.includes('alphavantage.co'))).toBe(false);
  });
});
