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
  // AV's monthly series (26 Sep 2026: COFFEE/ALUMINUM/COTTON latest is Jul 2026). SUGAR is set 4 months back so the
  // "old monthly value is still dropped" case is covered.
  const monthlyDate: Record<string, string> = { ALUMINUM: '2026-08-01', COTTON: '2026-08-01', COFFEE: '2026-07-01', SUGAR: '2026-05-01' };
  const quoteSymbols: string[] = [];
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SAT_26_SEP);
    process.env.ALPHA_VANTAGE_API_KEY = 'test';
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const u = new URL(url);
      const fn = u.searchParams.get('function')!;
      const json = (body: unknown) => ({ ok: true, json: async () => body });
      if (fn === 'GLOBAL_QUOTE') {
        const sym = u.searchParams.get('symbol')!;
        quoteSymbols.push(sym);
        // A dead listing still quoted by AV (JO did this: last trade 2023-06-14) must not be used as a live price.
        if (sym === 'CANE' || sym === 'JO') return json({ 'Global Quote': { '05. price': '54', '09. change': '0', '10. change percent': '0%', '07. latest trading day': '2023-06-14' } });
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
    // OV-16 reopened: coffee comes from AV's monthly COFFEE series, not the delisted JO ETN.
    expect(quoteSymbols).not.toContain('JO');
    expect(row('COFFEE')).toMatchObject({ source: 'LEGACY_MONTHLY', cadence: 'monthly', asOfLabel: 'monthly, as of Jul 2026', freshnessStatus: 'DELAYED', eligibleForGate: true, unit: 'cents/lb' });
    expect(row('COFFEE').sourceSymbol).toBeUndefined();
    // A stale proxy quote (CANE here, 2023) falls through to the commodity series; that series is 4 months old, so STALE.
    expect(row('SUGAR')).toMatchObject({ source: 'LEGACY_MONTHLY', freshnessStatus: 'STALE', eligibleForGate: false });
    expect(row('WTI')).toMatchObject({ cadence: 'live', asOfLabel: null });
    // OV-20: a proxy row is named and priced as the fund, never as the commodity.
    expect(row('WTI')).toMatchObject({ name: 'USO (WTI Crude Oil proxy)', commodityName: 'WTI Crude Oil', unit: '$ per USO share (fund price)', sourceSymbol: 'USO' });
    expect(row('BRENT').name).toBe('BNO (Brent Crude Oil proxy)');
    expect(row('ALUMINUM')).toMatchObject({ name: 'Aluminum', commodityName: 'Aluminum' });
    expect(body.dataHealth.staleSymbols).toEqual(['SUGAR']);
    expect(body.dataHealth.gateReady).toBe(true);
  }, 20_000);
});
