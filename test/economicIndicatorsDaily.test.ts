import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { latestObservation, monthlyAverages, numericObservations } from '@/lib/macro/avRateSeries';

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'ws-1', cid: 'c', tier: 'pro' })) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: vi.fn(async () => undefined) }));

/**
 * Regression: the macro tab showed 10Y 4.68% on 25 Sep 2026 (the AUGUST monthly average) while the daily
 * close was ~5.1%, because TREASURY_YIELD / FEDERAL_FUNDS_RATE were requested without `interval`
 * (Alpha Vantage default = monthly).
 */

// Daily series newest-first, like Alpha Vantage: '.' on non-trading days, Aug + Sep 2026 + earlier months.
function dailySeries(latest: number, opts: { holidayFirst?: boolean } = {}) {
  const rows: Array<{ date: string; value: string }> = [];
  if (opts.holidayFirst) rows.push({ date: '2026-09-25', value: '.' });
  rows.push({ date: '2026-09-24', value: String(latest) }, { date: '2026-09-23', value: String(latest - 0.05) });
  rows.push({ date: '2026-09-07', value: '.' }); // Labor Day
  rows.push({ date: '2026-09-01', value: String(latest - 0.3) });
  // August: two observations averaging 4.68 for the 10Y-like level
  rows.push({ date: '2026-08-31', value: String(latest - 0.47) }, { date: '2026-08-03', value: String(latest - 0.49) });
  // Earlier months, one obs each (Jul 2026 back to Jan 2025)
  for (let m = 0; m < 19; m++) {
    const d = new Date(Date.UTC(2026, 6 - m, 15));
    rows.push({ date: d.toISOString().slice(0, 10), value: String(4 + m * 0.01) });
  }
  return { name: 'series', interval: 'daily', unit: 'percent', data: rows };
}

const NOW = Date.parse('2026-09-25T03:27:00Z'); // Fri 25 Sep 2026 1:27 PM AEST

describe('avRateSeries helpers', () => {
  it("skips '.' / non-numeric rows and returns the most recent numeric observation", () => {
    const s = dailySeries(5.16, { holidayFirst: true });
    expect(latestObservation(s)).toEqual({ date: '2026-09-24', value: 5.16 });
    expect(numericObservations(s).some((p) => !Number.isFinite(p.value))).toBe(false);
    expect(numericObservations({ data: [{ date: '2026-09-24', value: '' }, { date: 'x', value: '1' }, { date: '2026-09-23', value: 'abc' }] })).toEqual([]);
    expect(latestObservation({ Information: 'rate limited' })).toBeNull();
  });

  it('sorts newest first even if the provider order is not', () => {
    expect(latestObservation({ data: [{ date: '2026-09-01', value: '4.9' }, { date: '2026-09-24', value: '5.16' }] })?.value).toBe(5.16);
  });

  it('builds monthly averages of completed months only (current month excluded), newest first', () => {
    const hist = monthlyAverages(numericObservations(dailySeries(5.16)), 12, NOW);
    expect(hist).toHaveLength(12);
    expect(hist[0]).toEqual({ date: '2026-08-01', value: 4.68 }); // (4.69 + 4.67) / 2
    expect(hist[1].date).toBe('2026-07-01');
    expect(hist.every((p) => p.date < '2026-09-01')).toBe(true);
    // Once September has ended it is included.
    expect(monthlyAverages(numericObservations(dailySeries(5.16)), 12, Date.parse('2026-10-01T12:00:00Z'))[0].date).toBe('2026-09-01');
  });
});

describe('/api/economic-indicators uses daily rate data', () => {
  const urls: string[] = [];

  beforeEach(() => {
    vi.resetModules();
    urls.length = 0;
    vi.stubEnv('ALPHA_VANTAGE_API_KEY', 'test-key');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubGlobal('setTimeout', ((fn: () => void) => { fn(); return 0; }) as unknown as typeof setTimeout);
    const levels: Record<string, number> = { '10year': 5.16, '2year': 4.9, '3month': 4.4, '5year': 5.0, '30year': 5.3 };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      const u = new URL(url);
      const fn = u.searchParams.get('function');
      let body: unknown;
      if (fn === 'TREASURY_YIELD') {
        body = u.searchParams.get('interval') === 'daily'
          ? dailySeries(levels[u.searchParams.get('maturity') ?? '10year'], { holidayFirst: true })
          : { interval: 'monthly', data: [{ date: '2026-08-01', value: '4.68' }] };
      } else if (fn === 'FEDERAL_FUNDS_RATE') {
        body = u.searchParams.get('interval') === 'daily'
          ? { interval: 'daily', data: [{ date: '2026-09-24', value: '3.38' }, { date: '2026-09-15', value: '3.63' }, { date: '2026-08-15', value: '3.63' }] }
          : { interval: 'monthly', data: [{ date: '2026-08-01', value: '3.63' }] };
      } else {
        body = { data: [{ date: '2026-08-01', value: '3.1' }, { date: '2026-07-01', value: '3.0' }] };
      }
      return { json: async () => body } as Response;
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('dashboard (all=true): latest daily yields, observation date, monthly history, daily-derived curve', async () => {
    const { GET } = await import('../app/api/economic-indicators/route');
    const res = await GET(new Request('http://localhost/api/economic-indicators?all=true') as any);
    const body = await res.json();

    const rateUrls = urls.filter((u) => /function=(TREASURY_YIELD|FEDERAL_FUNDS_RATE)/.test(u));
    expect(rateUrls).toHaveLength(6);
    expect(rateUrls.every((u) => u.includes('interval=daily'))).toBe(true);
    expect(urls.filter((u) => /function=(CPI|INFLATION|UNEMPLOYMENT|REAL_GDP)/.test(u)).some((u) => u.includes('interval='))).toBe(false);

    expect(body.rates.treasury10y.value).toBe(5.16); // not the 4.68 August average; '.' row on 25 Sep skipped
    expect(body.rates.treasury10y.date).toBe('2026-09-24');
    expect(body.rates.treasury10y.history).toHaveLength(12);
    expect(body.rates.treasury10y.history[0]).toEqual({ date: '2026-08-01', value: 4.68 });
    expect(body.rates.treasury2y.value).toBe(4.9);
    expect(body.rates.treasury3m.value).toBe(4.4);
    expect(body.rates.yieldCurve.value).toBe(0.26);
    expect(body.rates.yieldCurve3m10y.value).toBe(0.76);
    expect(body.rates.fedFunds.value).toBe(3.38);
    expect(body.rates.fedFunds.date).toBe('2026-09-24');
    // determineRegime sees the daily 10Y (> 5%).
    expect(body.regime.description).toContain('High interest rate environment');
    // Non-rate indicators unchanged.
    expect(body.inflation.inflationRate.value).toBe(3.1);
  });

  it('single indicator path defaults rate series to daily and skips non-numeric rows', async () => {
    const { GET } = await import('../app/api/economic-indicators/route');
    const res = await GET(new Request('http://localhost/api/economic-indicators?indicator=TREASURY_YIELD&maturity=10year') as any);
    const body = await res.json();
    expect(urls[0]).toContain('interval=daily');
    expect(body.latest).toEqual({ date: '2026-09-24', value: 5.16 });
    expect(body.history.every((p: { value: number }) => Number.isFinite(p.value))).toBe(true);

    const res2 = await GET(new Request('http://localhost/api/economic-indicators?indicator=TREASURY_YIELD&maturity=10year&interval=monthly') as any);
    expect(urls[1]).toContain('interval=monthly');
    expect((await res2.json()).latest).toEqual({ date: '2026-08-01', value: 4.68 });

    await GET(new Request('http://localhost/api/economic-indicators?indicator=CPI') as any);
    expect(urls[2]).not.toContain('interval=');
  });
});
