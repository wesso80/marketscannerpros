/**
 * MV-1: the market regime's VIX comes from Alpha Vantage INDEX_DATA (same-day close) first, with FRED (stored
 * VIXCLS, then its keyless CSV) as the fallback. FRED's 1–3 day lag was what kept the "stale inputs" note on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ q: vi.fn(), avDaily: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/marketData/client', () => ({ avFetchDailyBars: mocks.avDaily }));
import { parseIndexDataCloses } from '@/lib/macro/avIndexData';
import { classifyMarketRegime } from '@/lib/marketRegime';

const NOW = Date.UTC(2026, 8, 28, 3); // Mon 28 Sep 2026 13:00 AEST (Sun 23:00 ET)
const dayStr = (offset: number) => new Date(NOW - offset * 86_400_000).toISOString().slice(0, 10);
const FRI = '2026-09-25';

function indexPayload(closes: Array<[string, string]>) {
  return { symbol: 'VIX', name: 'Cboe Volatility Index', interval: 'daily', data: closes.map(([date, close]) => ({ date, open: close, high: close, low: close, close })) };
}
const AV_VIX = indexPayload([[FRI, '14.87'], ['2026-09-24', '15.10'], ['2026-09-23', '15.30'], ['2026-09-22', '14.21'], ['2026-09-21', '14.90'], ['2026-09-18', '14.81']]);

function barRows(n: number, endOffset: number) {
  return Array.from({ length: n }, (_, i) => ({ ts: new Date(NOW - (endOffset + i) * 86_400_000), close: 700 - i * 0.2 }));
}
function macroRows(n: number, endOffset: number, value: number) {
  return Array.from({ length: n }, (_, i) => ({ observed_on: dayStr(endOffset + i), value }));
}
function mockDb(vix: unknown[]) {
  mocks.q.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM macro_series')) return params[0] === 'VIX' ? vix : [];
    if (sql.includes('FROM ohlcv_bars')) return params[0] === 'SPY' || params[0] === 'QQQ' ? barRows(200, 3) : [];
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

describe('INDEX_DATA parsing', () => {
  it('reads the documented { data: [{ date, close }] } shape, newest first, skipping bad rows', () => {
    const rows = parseIndexDataCloses({ data: [{ date: '2026-09-24', close: '15.10' }, { date: FRI, close: '14.87' }, { date: 'x', close: '1' }, { date: '2026-09-23', close: '' }] });
    expect(rows).toEqual([{ on: FRI, value: 14.87 }, { on: '2026-09-24', value: 15.1 }]);
    expect(parseIndexDataCloses({ Information: 'rate limit' })).toEqual([]);
    expect(parseIndexDataCloses(null)).toEqual([]);
  });
});

describe('regime VIX: Alpha Vantage primary, FRED fallback', () => {
  it('uses Alpha Vantage when FRED is lagging, so the regime is no longer stale', async () => {
    mockDb(macroRows(6, 7, 18)); // FRED stored VIXCLS last on Mon 21 Sep (a week behind)
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('function=INDEX_DATA') && url.includes('symbol=VIX') && url.includes('interval=daily')) return new Response(JSON.stringify(AV_VIX));
      if (url.includes('id=VIXCLS')) return new Response(`observation_date,VIXCLS\n${dayStr(7)},18\n`);
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const inputs = await (await freshLoader())();
    expect(inputs.vix).toMatchObject({ level: 14.87, asOf: FRI, source: 'alpha-vantage' });
    expect(inputs.vix!.change5dPct).toBeCloseTo((14.87 / 14.81 - 1) * 100, 6);
    expect(inputs.asOf).toBe(FRI);
    // Alpha Vantage is current: FRED's VIXCLS CSV is not even asked (other FRED series still are).
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('id=VIXCLS'))).toBe(false);
    const r = classifyMarketRegime(inputs, NOW);
    expect(r).toMatchObject({ available: true, stale: false });
    if (r.available) expect(r.reasons.join(' | ')).toContain(`VIX as of ${FRI} (3 days old, Alpha Vantage)`);
  });

  it('falls back to FRED when Alpha Vantage refuses (and logs Alpha Vantage\'s message)', async () => {
    mockDb(macroRows(6, 3, 16)); // FRED stored VIXCLS through Fri 25 Sep
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('function=INDEX_DATA')) return new Response(JSON.stringify({ Information: 'Thank you for using Alpha Vantage! This is a premium endpoint.' }));
      return new Response('', { status: 404 });
    }));
    const inputs = await (await freshLoader())();
    expect(inputs.vix).toMatchObject({ level: 16, asOf: dayStr(3), source: 'stored' });
    expect((console.warn as any).mock.calls.map((c: unknown[]) => c.join(' ')).join('\n')).toContain('[avIndexData] INDEX_DATA VIX failed: Thank you for using Alpha Vantage! This is a premium endpoint.');
    // #157 follow-up: the reason reaches the regime response (signals[0].detail), not only the server log.
    expect(inputs.vix!.note).toBe('Alpha Vantage VIX unavailable: Thank you for using Alpha Vantage! This is a premium endpoint.');
    const r = classifyMarketRegime(inputs, NOW);
    if (r.available) expect(r.reasons).toContain(inputs.vix!.note);
  });

  it('an entitlement refusal sent as an AV "Note" is reported in AV\'s words, not as "quota exceeded"', async () => {
    mockDb(macroRows(6, 3, 16));
    const msg = 'You are not yet entitled to index data access. Please subscribe to any of our 150, 300, 600, or 1200 requests per minute premium plans.';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('function=INDEX_DATA') ? new Response(JSON.stringify({ Note: msg })) : new Response('', { status: 404 })));
    const inputs = await (await freshLoader())();
    expect(inputs.vix).toMatchObject({ source: 'stored', note: `Alpha Vantage VIX unavailable: ${msg}` });
    expect(inputs.vix!.note).not.toContain('quota');
  });

  it('falls back to FRED when there is no Alpha Vantage key (no call made)', async () => {
    delete process.env.ALPHA_VANTAGE_API_KEY;
    mockDb(macroRows(6, 3, 16));
    const fetchMock = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
    const inputs = await (await freshLoader())();
    expect(inputs.vix).toMatchObject({ source: 'stored', level: 16, note: 'Alpha Vantage VIX unavailable: no Alpha Vantage key configured' });
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('INDEX_DATA'))).toBe(false);
  });

  it('keeps FRED when it is newer than an old Alpha Vantage series', async () => {
    mockDb(macroRows(6, 3, 16)); // FRED through Fri 25 Sep
    const oldAv = indexPayload([['2026-09-10', '20'], ['2026-09-09', '21']]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('INDEX_DATA') ? new Response(JSON.stringify(oldAv)) : new Response('', { status: 404 })));
    const inputs = await (await freshLoader())();
    expect(inputs.vix).toMatchObject({ source: 'stored', asOf: dayStr(3), note: 'Alpha Vantage VIX latest 2026-09-10 is older than FRED' });
  });

  it('uses an Alpha Vantage series that is stale but still newer than FRED', async () => {
    mockDb(macroRows(6, 20, 16));
    const avOlder = indexPayload([['2026-09-18', '19'], ['2026-09-17', '18']]);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('INDEX_DATA') ? new Response(JSON.stringify(avOlder)) : new Response('', { status: 404 })));
    const inputs = await (await freshLoader())();
    expect(inputs.vix).toMatchObject({ source: 'alpha-vantage', asOf: '2026-09-18', level: 19, note: null });
  });
});
