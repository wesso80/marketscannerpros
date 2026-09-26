import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { buildOiObservation, compareOi24h, HOUR_MS, OI_METHOD, totalOiChange, type OiObservation } from '@/lib/crypto/oiComparisons';

const auth = vi.hoisted(() => ({ session: vi.fn(), internal: vi.fn() }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: auth.session }));
vi.mock('@/lib/entitlements', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/entitlements')>()), hasProAccess: (tier: string) => tier === 'pro' }));
vi.mock('@/lib/internalServiceAuth', () => ({ hasValidInternalServiceSecret: auth.internal }));
import { GET as ratios } from '@/app/api/long-short-ratio/route';
import { GET as liquidations } from '@/app/api/crypto/liquidations/route';
import { GET as history } from '@/app/api/crypto-derivatives/history/route';

const now = Date.UTC(2026, 8, 22, 12);
const row = (overrides = {}) => ({ market: 'A', symbol: 'BTCUSDT', openInterest: 100, lastTradedAt: now / 1000 - 10, ...overrides });
const current = (): OiObservation => buildOiObservation('BTC', [row()], now)!;
// Per-contract OI follows the snapshot value unless a test overrides the contracts themselves.
const previous = (overrides: Partial<OiObservation> = {}): OiObservation => {
  const value = overrides.value ?? 80;
  return { ...current(), value, contracts: { '["A","BTCUSDT"]': value }, observedAt: now - 24 * HOUR_MS - 10_000, ...overrides };
};

describe('observed OI comparison', () => {
  it('deduplicates contracts, counts venues and preserves observation time', () => {
    expect(buildOiObservation('BTC', [row(), row(), row({ market: 'B', openInterest: 50 })], now)).toMatchObject({ value: 150, exchanges: 2, observedAt: now - 10_000 });
  });
  it.each([{ openInterest: Number.NaN }, { openInterest: -1 }, { lastTradedAt: 0 }, { lastTradedAt: now / 1000 + 1 }, { lastTradedAt: now / 1000 - 901 }])('withholds invalid/currently stale observations: %j', invalid => {
    expect(buildOiObservation('BTC', [row(invalid)], now)).toBeNull();
  });
  it('compares the closest 24h observation on the same venue contracts', () => {
    expect(compareOi24h(current(), [previous({ value: 10, observedAt: now - 23 * HOUR_MS }), previous()], now)).toMatchObject({ change24h: 25, previousValue: 80 });
  });
  it.each([
    { contracts: { '["B","BTCUSDT"]': 80 } }, { method: 'legacy' as typeof OI_METHOD }, { symbol: 'ETH' },
    { observedAt: now - HOUR_MS }, { observedAt: now - 48 * HOUR_MS }, { value: 0 }, { value: Number.NaN },
  ])('withholds an incompatible or mistimed baseline: %j', invalid => {
    expect(compareOi24h(current(), [previous(invalid)], now).change24h).toBeNull();
  });
  it('first observation is unknown, whereas an observed unchanged position is zero', () => {
    expect(compareOi24h(current(), [], now).change24h).toBeNull();
    expect(compareOi24h(current(), [previous({ value: 100 })], now).change24h).toBe(0);
  });
  it('weights aggregate change by actual OI and withholds it unless compared coins hold >= 90% of current OI', () => {
    expect(totalOiChange([{ value: 110, previousValue: 100 }, { value: 20, previousValue: 10 }])).toBeCloseTo(18.1818);
    expect(totalOiChange([{ value: 110, previousValue: 100 }, { value: 20, previousValue: null }])).toBeNull(); // 85% covered
    expect(totalOiChange([{ value: 110, previousValue: 100 }, { value: 5, previousValue: null }])).toBeCloseTo(10); // 96% covered
  });
  it('does not derive directional short/long positioning from a change in total OI', () => {
    const observation = compareOi24h(current(), [previous({ value: 200 })], now);
    expect(observation.change24h).toBe(-50);
    expect(observation).not.toHaveProperty('longShortRatio');
  });
});

describe('unsupported observations stay unavailable', () => {
  beforeEach(() => { auth.session.mockResolvedValue({ workspaceId: 'test', tier: 'pro' }); auth.internal.mockReturnValue(false); });
  it('does not substitute funding for account ratios when the exchange feed is down', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const response = await ratios(new NextRequest('http://localhost/api/long-short-ratio'));
    fetchSpy.mockRestore();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ available: false, average: null, coins: [], timestamp: null, model: null });
  });
  it('publishes exchange-reported OKX account ratios, never a funding proxy', async () => {
    const hourStart = Math.floor(Date.now() / 3_600_000) * 3_600_000 - 3_600_000;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      expect(url).toContain('/api/v5/rubik/stat/contracts/long-short-account-ratio');
      expect(url).not.toContain('funding');
      const ratio = url.includes('ccy=BTC') ? '1.5' : '1';
      return new Response(JSON.stringify({ code: '0', msg: '', data: [[String(hourStart), ratio], [String(hourStart - 3_600_000), '9']] }), { status: 200 });
    });
    const response = await ratios(new NextRequest('http://localhost/api/long-short-ratio'));
    fetchSpy.mockRestore();
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ available: true, model: 'exchange-reported-account-ratio', source: 'okx', freshnessStatus: 'fresh' });
    const btc = result.coins.find((c: any) => c.symbol === 'BTC');
    expect(btc).toMatchObject({ longShortRatio: 1.5, longAccount: 60, shortAccount: 40, timestamp: hourStart });
    expect(result.coins).toHaveLength(5);
  });
  it('does not publish recent contract counts as 24h USD liquidation totals', async () => {
    const result = await (await liquidations(new NextRequest('http://localhost/api/crypto/liquidations'))).json();
    expect(result).toMatchObject({ available: false, summary: null, coins: [], timeframe: null, timestamp: null });
  });
  it('does not connect incompatible historical observations into a chart', async () => {
    const result = await (await history(new NextRequest('http://localhost/api/crypto-derivatives/history?symbol=BTC'))).json();
    expect(result).toMatchObject({ available: false, snapshots: [], count: 0 });
  });
  it('retains the authentication boundary', async () => {
    auth.session.mockResolvedValue(null);
    expect((await ratios(new NextRequest('http://localhost/api/long-short-ratio'))).status).toBe(401);
    expect((await liquidations(new NextRequest('http://localhost/api/crypto/liquidations'))).status).toBe(401);
  });
});
