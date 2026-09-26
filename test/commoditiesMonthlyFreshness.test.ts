import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isMonthlyObservationCurrent, monthlyAsOfLabel, monthsBehind } from '@/lib/commodityFreshness';

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws1' }) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/rateLimit', () => ({ deepAnalysisLimiter: { check: () => ({ allowed: true }) }, getClientIP: () => '1.1.1.1' }));

const SAT_26_SEP = Date.parse('2026-09-26T08:00:00Z');

describe('monthly commodity freshness rule (OV-16)', () => {
  it('counts months, not days', () => {
    expect(monthsBehind('2026-08-01', SAT_26_SEP)).toBe(1);
    expect(isMonthlyObservationCurrent('2026-08-01', SAT_26_SEP)).toBe(true);  // 56 days old — used to be STALE (>45d)
    expect(isMonthlyObservationCurrent('2026-07-01', SAT_26_SEP)).toBe(true);
    expect(isMonthlyObservationCurrent('2026-06-01', SAT_26_SEP)).toBe(false);
    expect(isMonthlyObservationCurrent('garbage', SAT_26_SEP)).toBe(false);
    expect(monthlyAsOfLabel('2026-08-01')).toBe('monthly, as of Aug 2026');
    expect(monthlyAsOfLabel('')).toBeNull();
  });
});

describe('GET /api/commodities keeps current monthly series and does not report them as stale', () => {
  const monthlyDate: Record<string, string> = { ALUMINUM: '2026-08-01', COTTON: '2026-08-01', COFFEE: '2026-05-01' };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SAT_26_SEP);
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = new URL(url);
      const fn = u.searchParams.get('function')!;
      const json = (body: unknown) => ({ ok: true, json: async () => body });
      if (fn === 'GLOBAL_QUOTE') {
        if (u.searchParams.get('symbol') === 'JO') return json({}); // delisted ETN → COFFEE falls back to monthly
        return json({ 'Global Quote': { '05. price': '20', '09. change': '0.2', '10. change percent': '1%', '07. latest trading day': '2026-09-25' } });
      }
      if (fn === 'GOLD_SILVER_SPOT') return json({ price: '2500' });
      const d = monthlyDate[fn] ?? '2026-09-25';
      return json({ data: [{ date: d, value: '100' }, { date: '2026-04-01', value: '99' }] });
    }));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('labels ALUMINUM/COTTON "monthly, as of Aug 2026", keeps them out of staleSymbols, and still drops a 4-month-old value', async () => {
    const { GET } = await import('@/app/api/commodities/route');
    const body = await (await GET(new NextRequest('https://example.test/api/commodities'))).json();
    const row = (s: string) => body.commodities.find((c: any) => c.symbol === s);
    for (const s of ['ALUMINUM', 'COTTON']) {
      expect(row(s)).toMatchObject({ cadence: 'monthly', asOfLabel: 'monthly, as of Aug 2026', freshnessStatus: 'DELAYED', eligibleForGate: true });
    }
    expect(row('COFFEE')).toMatchObject({ cadence: 'monthly', freshnessStatus: 'STALE', eligibleForGate: false });
    expect(row('WTI')).toMatchObject({ cadence: 'live', asOfLabel: null });
    expect(body.dataHealth.staleSymbols).toEqual(['COFFEE']);
    expect(body.dataHealth.gateReady).toBe(true);
  }, 20_000);
});
