import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cpiYearOverYear, PUBLIC_CPI_SERIES, PUBLIC_FED_FUNDS_SERIES, PUBLIC_FRED_FAILURE_TTL_MS, PUBLIC_REAL_GDP_GROWTH_SERIES, PUBLIC_UNEMPLOYMENT_SERIES, PUBLIC_YIELD_SERIES } from '@/lib/macro/publicFred';

const mocks = vi.hoisted(() => ({
  q: vi.fn(() => { throw new Error('public macro must not query the database'); }),
  getPool: vi.fn(() => { throw new Error('public macro must not open a database pool'); }),
  avTakeToken: vi.fn(async () => undefined),
}));

vi.mock('@/lib/db', () => ({ q: mocks.q, getPool: mocks.getPool }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'ws-1' })) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: mocks.avTakeToken }));

const YIELDS = ['DGS10', 'DGS2', 'DGS3MO', 'DGS5', 'DGS30'] as const;
const PUBLIC_FRED_IDS = ['A191RL1Q225SBEA', 'CPIAUCSL', 'DFF', 'DGS10', 'DGS2', 'DGS30', 'DGS3MO', 'DGS5', 'UNRATE'];
const PUBLIC_INDICATORS = ['TREASURY_YIELD', 'FEDERAL_FUNDS_RATE', 'CPI', 'INFLATION', 'UNEMPLOYMENT', 'REAL_GDP'] as const;

function observationsFor(id: string) {
  if (id === 'CPIAUCSL') {
    return [
      { date: '2025-08-01', value: '100' },
      { date: '2025-09-01', value: '100.4' },
      { date: '2026-08-01', value: '104.5' },
      { date: '2026-09-01', value: '104.8' },
    ];
  }
  if (id === 'DFF') return [{ date: '2026-09-24', value: '.' }, { date: '2026-09-23', value: '4.50' }];
  if (id === 'UNRATE') return [{ date: '2026-08-01', value: '4.1' }, { date: '2026-07-01', value: '4.2' }];
  if (id === 'A191RL1Q225SBEA') return [{ date: '2026-07-01', value: '2.4' }, { date: '2026-04-01', value: '2.1' }];
  const level = id === 'DGS10' ? '5.20' : id === 'DGS2' ? '5.40' : '4.10';
  return [{ date: '2026-09-24', value: '.' }, { date: '2026-09-23', value: level }];
}

function stubFredFetch() {
  const urls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = String(input);
    urls.push(url);
    const parsed = new URL(url);
    if (parsed.hostname === 'api.stlouisfed.org') {
      const id = parsed.searchParams.get('series_id') ?? '';
      return new Response(JSON.stringify({ observations: observationsFor(id) }), { status: 200 });
    }
    if (parsed.hostname === 'fred.stlouisfed.org') {
      const id = parsed.searchParams.get('id') ?? '';
      const rows = observationsFor(id).filter((row) => row.value !== '.').map((row) => `${row.date},${row.value}`).join('\n');
      return new Response(`observation_date,${id}\n${rows}\n`, { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
  return urls;
}

describe('public FRED series map', () => {
  it('maps treasury maturities to DGS series and CPI to CPIAUCSL', () => {
    expect(PUBLIC_YIELD_SERIES).toEqual({
      '3month': 'DGS3MO',
      '2year': 'DGS2',
      '5year': 'DGS5',
      '10year': 'DGS10',
      '30year': 'DGS30',
    });
    expect(PUBLIC_CPI_SERIES).toBe('CPIAUCSL');
    expect(PUBLIC_FED_FUNDS_SERIES).toBe('DFF');
    expect(PUBLIC_UNEMPLOYMENT_SERIES).toBe('UNRATE');
    expect(PUBLIC_REAL_GDP_GROWTH_SERIES).toBe('A191RL1Q225SBEA');
    expect(Object.values(PUBLIC_YIELD_SERIES).sort()).toEqual([...YIELDS].sort());
  });

  it('derives inflation as the CPI index year-over-year percent', () => {
    const yoy = cpiYearOverYear([
      { date: '2026-09-01', value: 104.8 },
      { date: '2026-08-01', value: 104.5 },
      { date: '2025-09-01', value: 100.4 },
      { date: '2025-08-01', value: 100 },
    ]);
    expect(yoy).toEqual([
      { date: '2026-09-01', value: 4.38 },
      { date: '2026-08-01', value: 4.5 },
    ]);
  });
});

describe('public macro paths do not call Alpha Vantage', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.q.mockClear();
    mocks.getPool.mockClear();
    mocks.avTakeToken.mockClear();
    vi.stubEnv('ALPHA_VANTAGE_API_KEY', 'test-av-key');
    vi.stubEnv('FRED_API_KEY', 'test-fred-key');
    const realSetTimeout = global.setTimeout;
    vi.stubGlobal('setTimeout', ((fn: () => void, ms?: number) => {
      if (ms != null && ms < 1000) { fn(); return 0 as unknown as ReturnType<typeof setTimeout>; }
      return realSetTimeout(fn, ms);
    }) as unknown as typeof setTimeout);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('serves treasury, CPI, and inflation from FRED series', async () => {
    const urls = stubFredFetch();
    const { GET } = await import('../app/api/economic-indicators/route');
    const ten = await (await GET(new Request('http://localhost/api/economic-indicators?indicator=TREASURY_YIELD&maturity=10year') as any)).json();
    const cpi = await (await GET(new Request('http://localhost/api/economic-indicators?indicator=CPI') as any)).json();
    const inflation = await (await GET(new Request('http://localhost/api/economic-indicators?indicator=INFLATION') as any)).json();

    expect(urls.every((url) => url.includes('api.stlouisfed.org'))).toBe(true);
    expect(urls.map((url) => new URL(url).searchParams.get('series_id'))).toEqual(['DGS10', 'CPIAUCSL', 'CPIAUCSL']);
    expect(ten.latest).toEqual({ date: '2026-09-23', value: 5.2 });
    expect(cpi.latest).toEqual({ date: '2026-09-01', value: 104.8 });
    expect(inflation.latest).toEqual({ date: '2026-09-01', value: 4.38 });
    expect(inflation.unit).toBe('%');
    expect(mocks.avTakeToken).not.toHaveBeenCalled();
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('keeps every public dashboard series off Alpha Vantage', async () => {
    const urls = stubFredFetch();
    const { GET } = await import('../app/api/economic-indicators/route');
    const body = await (await GET(new Request('http://localhost/api/economic-indicators?all=true') as any)).json();
    const fred = urls.filter((url) => url.includes('api.stlouisfed.org')).map((url) => new URL(url).searchParams.get('series_id')).sort();

    expect(urls.some((url) => url.includes('alphavantage.co'))).toBe(false);
    expect(urls.every((url) => url.includes('stlouisfed.org'))).toBe(true);
    expect(fred).toEqual(PUBLIC_FRED_IDS);
    expect(body.rates.treasury10y.value).toBe(5.2);
    expect(body.rates.treasury2y.value).toBe(5.4);
    expect(body.rates.fedFunds).toMatchObject({ value: 4.5, date: '2026-09-23' });
    expect(body.inflation.cpi.value).toBe(104.8);
    expect(body.inflation.inflationRate.value).toBe(4.38);
    expect(body.employment.unemployment).toMatchObject({ value: 4.1, date: '2026-08-01' });
    expect(body.growth.realGDP).toMatchObject({ value: 2.4, date: '2026-07-01', unit: '%' });
    expect(body.source).toBe('Source: FRED (Federal Reserve Bank of St. Louis)');
    expect(body.asOf).toBe('2026-09-23');
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('sends no public macro request to Alpha Vantage', async () => {
    const urls = stubFredFetch();
    const { GET } = await import('../app/api/economic-indicators/route');
    for (const indicator of PUBLIC_INDICATORS) {
      const res = await GET(new Request(`http://localhost/api/economic-indicators?indicator=${indicator}`) as any);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.source).toBe('Source: FRED (Federal Reserve Bank of St. Louis)');
      expect(body.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const funds = await (await GET(new Request('http://localhost/api/economic-indicators?indicator=FEDERAL_FUNDS_RATE') as any)).json();
    const unemployment = await (await GET(new Request('http://localhost/api/economic-indicators?indicator=UNEMPLOYMENT') as any)).json();
    const gdp = await (await GET(new Request('http://localhost/api/economic-indicators?indicator=REAL_GDP') as any)).json();
    expect(funds.latest).toEqual({ date: '2026-09-23', value: 4.5 });
    expect(funds.unit).toBe('%');
    expect(unemployment.latest).toEqual({ date: '2026-08-01', value: 4.1 });
    expect(gdp.latest).toEqual({ date: '2026-07-01', value: 2.4 });
    expect(gdp.unit).toBe('%');
    expect(gdp.name).toBe('Real GDP, quarter-on-quarter annualised');
    expect(gdp.interval).toBe('quarterly');

    const before = urls.length;
    const retail = await GET(new Request('http://localhost/api/economic-indicators?indicator=RETAIL_SALES') as any);
    const missing = await GET(new Request('http://localhost/api/economic-indicators') as any);
    expect(retail.status).toBe(400);
    expect(missing.status).toBe(400);
    expect((await retail.json()).available).toEqual([...PUBLIC_INDICATORS]);
    expect(urls).toHaveLength(before);
    expect(urls.some((url) => url.includes('alphavantage.co'))).toBe(false);
    expect(urls.every((url) => url.includes('stlouisfed.org'))).toBe(true);
    const ids = urls.map((url) => new URL(url).searchParams.get('series_id')).sort();
    expect(ids).toEqual(['A191RL1Q225SBEA', 'CPIAUCSL', 'CPIAUCSL', 'DFF', 'DGS10', 'UNRATE']);
    expect(mocks.avTakeToken).not.toHaveBeenCalled();
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('does not fall back to Alpha Vantage when the FRED key is absent', async () => {
    vi.stubEnv('FRED_API_KEY', '');
    const urls = stubFredFetch();
    const { fetchMacroRegime } = await import('../lib/goldenEggFetchers');
    const regime = await fetchMacroRegime();
    expect(urls.some((url) => url.includes('alphavantage.co'))).toBe(false);
    expect(urls.every((url) => url.includes('fred.stlouisfed.org'))).toBe(true);
    expect(urls.map((url) => new URL(url).searchParams.get('id')).sort()).toEqual(PUBLIC_FRED_IDS);
    expect(regime).toMatchObject({
      riskState: 'risk_off',
      riskLevel: 'high',
      concerns: ['Inverted yield curve', 'Elevated inflation', 'High interest rates'],
      source: 'Source: FRED (Federal Reserve Bank of St. Louis)',
      asOf: '2026-09-23',
    });
    expect(regime?.observations).toEqual([
      { series: 'DGS10', label: '10-year Treasury', date: '2026-09-23', unavailable: false },
      { series: 'DGS2', label: '2-year Treasury', date: '2026-09-23', unavailable: false },
      { series: 'CPIAUCSL', label: 'CPI year-over-year', date: '2026-09-01', unavailable: false },
    ]);
    expect(mocks.avTakeToken).not.toHaveBeenCalled();
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('leaves the admin sector rotation treasury fetch on Alpha Vantage', () => {
    const rotation = readFileSync('lib/admin/sectorRotation.ts', 'utf8');
    const route = readFileSync('app/api/economic-indicators/route.ts', 'utf8');
    const egg = readFileSync('lib/goldenEggFetchers.ts', 'utf8');
    const macro = egg.slice(egg.indexOf('export async function fetchMacroRegime'));
    expect(rotation).toContain('https://www.alphavantage.co/query');
    expect(rotation).toContain('function=TREASURY_YIELD&interval=daily&maturity=');
    expect(rotation).toContain('function=FEDERAL_FUNDS_RATE&interval=daily');
    expect(route).not.toMatch(/alphavantage|ALPHA_VANTAGE|avTakeToken/);
    expect(route).toContain('loadPublicFredMacro');
    expect(macro).not.toMatch(/alphavantage|ALPHA_VANTAGE|TREASURY_YIELD|avTakeToken/);
    expect(macro).toContain('loadPublicFredMacro');
    expect(existsSync('app/api/economics/route.ts')).toBe(false);
  });

  it('returns null on a FRED outage and does not cache that miss for an hour', async () => {
    let now = Date.parse('2026-09-25T00:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      urls.push(String(input));
      throw new Error('fred down');
    }));
    const { GET } = await import('../app/api/economic-indicators/route');
    const { fetchMacroRegime } = await import('../lib/goldenEggFetchers');
    const first = await (await GET(new Request('http://localhost/api/economic-indicators?all=true') as any)).json();
    expect(first.label).toBe('FRED unavailable');
    expect(first.unavailable).toBe(true);
    expect(first.regime).toBeNull();
    expect(first.inflation.trend).toBeNull();
    expect(first.employment.trend).toBeNull();
    expect(first.failedSeries.map((row: { series: string }) => row.series).sort()).toEqual(PUBLIC_FRED_IDS);
    const afterFirst = urls.length;
    await GET(new Request('http://localhost/api/economic-indicators?all=true') as any);
    expect(urls).toHaveLength(afterFirst);
    now += PUBLIC_FRED_FAILURE_TTL_MS + 1000;
    await GET(new Request('http://localhost/api/economic-indicators?all=true') as any);
    expect(urls.length).toBeGreaterThan(afterFirst);

    urls.length = 0;
    const regime = await fetchMacroRegime();
    expect(regime).toBeNull();
    const regimeFetches = urls.length;
    expect(regimeFetches).toBeGreaterThan(0);
    expect(await fetchMacroRegime()).toBeNull();
    expect(urls).toHaveLength(regimeFetches);
    now += PUBLIC_FRED_FAILURE_TTL_MS + 1000;
    expect(await fetchMacroRegime()).toBeNull();
    expect(urls.length).toBeGreaterThan(regimeFetches);
    vi.spyOn(Date, 'now').mockRestore();
  });

  it('labels one failed series and leaves a null trend unset', async () => {
    const urls = stubFredFetch();
    const realFetch = global.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input: string) => {
      const url = String(input);
      if (new URL(url).searchParams.get('series_id') === 'UNRATE' || new URL(url).searchParams.get('id') === 'UNRATE') {
        urls.push(url);
        throw new Error('unrate down');
      }
      return realFetch(input);
    }));
    const { GET } = await import('../app/api/economic-indicators/route');
    const body = await (await GET(new Request('http://localhost/api/economic-indicators?all=true') as any)).json();
    expect(body.unavailable).toBe(false);
    expect(body.employment.unemployment).toMatchObject({ value: null, unavailable: true, seriesId: 'UNRATE' });
    expect(body.employment.trend).toBeNull();
    expect(body.failedSeries).toEqual([{ series: 'UNRATE', label: 'Unemployment' }]);
    expect(body.rates.treasury10y.value).toBe(5.2);
    expect(body.inflation.trend).toBe('elevated');
  });
});
