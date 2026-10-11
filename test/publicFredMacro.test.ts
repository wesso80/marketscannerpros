import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cpiYearOverYear, PUBLIC_CPI_SERIES, PUBLIC_YIELD_SERIES } from '@/lib/macro/publicFred';

const mocks = vi.hoisted(() => ({
  q: vi.fn(() => { throw new Error('public macro must not query the database'); }),
  getPool: vi.fn(() => { throw new Error('public macro must not open a database pool'); }),
  avTakeToken: vi.fn(async () => undefined),
}));

vi.mock('@/lib/db', () => ({ q: mocks.q, getPool: mocks.getPool }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'ws-1' })) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: mocks.avTakeToken }));

const YIELDS = ['DGS10', 'DGS2', 'DGS3MO', 'DGS5', 'DGS30'] as const;

function observationsFor(id: string) {
  if (id === 'CPIAUCSL') {
    return [
      { date: '2025-08-01', value: '100' },
      { date: '2025-09-01', value: '100.4' },
      { date: '2026-08-01', value: '104.5' },
      { date: '2026-09-01', value: '104.8' },
    ];
  }
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
    if (parsed.hostname === 'www.alphavantage.co') {
      return new Response(JSON.stringify({ data: [{ date: '2026-09-23', value: '4.33' }] }), { status: 200 });
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

  it('keeps the dashboard yield and CPI reads off Alpha Vantage', async () => {
    const urls = stubFredFetch();
    const { GET } = await import('../app/api/economic-indicators/route');
    const body = await (await GET(new Request('http://localhost/api/economic-indicators?all=true') as any)).json();
    const av = urls.filter((url) => url.includes('alphavantage.co'));
    const fred = urls.filter((url) => url.includes('api.stlouisfed.org')).map((url) => new URL(url).searchParams.get('series_id')).sort();

    expect(av.some((url) => /function=(TREASURY_YIELD|CPI|INFLATION)(&|$)/.test(url))).toBe(false);
    expect(av.map((url) => new URL(url).searchParams.get('function')).sort()).toEqual(['FEDERAL_FUNDS_RATE', 'REAL_GDP', 'UNEMPLOYMENT']);
    expect(fred).toEqual(['CPIAUCSL', 'DGS10', 'DGS2', 'DGS30', 'DGS3MO', 'DGS5']);
    expect(body.rates.treasury10y.value).toBe(5.2);
    expect(body.rates.treasury2y.value).toBe(5.4);
    expect(body.inflation.cpi.value).toBe(104.8);
    expect(body.inflation.inflationRate.value).toBe(4.38);
    expect(body.source).toBe('Source: FRED (Federal Reserve Bank of St. Louis)');
    expect(body.asOf).toBe('2026-09-23');
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('does not fall back to Alpha Vantage when the FRED key is absent', async () => {
    vi.stubEnv('FRED_API_KEY', '');
    const urls = stubFredFetch();
    const { fetchMacroRegime } = await import('../lib/goldenEggFetchers');
    const regime = await fetchMacroRegime();
    expect(urls.some((url) => url.includes('alphavantage.co'))).toBe(false);
    expect(urls.every((url) => url.includes('fred.stlouisfed.org'))).toBe(true);
    expect(urls.map((url) => new URL(url).searchParams.get('id')).sort()).toEqual(['CPIAUCSL', 'DGS10', 'DGS2', 'DGS30', 'DGS3MO', 'DGS5']);
    expect(regime).toEqual({
      riskState: 'risk_off',
      riskLevel: 'high',
      concerns: ['Inverted yield curve', 'Elevated inflation', 'High interest rates'],
    });
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
    expect(route).not.toContain('function=TREASURY_YIELD');
    expect(route).toContain('loadPublicFredMacro');
    expect(macro).not.toMatch(/alphavantage|ALPHA_VANTAGE|TREASURY_YIELD|avTakeToken/);
    expect(macro).toContain('loadPublicFredMacro');
  });
});
