/**
 * W1 acceptance (research identity and selected expiry): an explicit expiry is carried from the request through the
 * computation, the response and the cache key; an unlisted expiry is reported and never replaced; the same ticker as an
 * equity and as a crypto never shares a packet or a DVE reading. Warm both orders. Providers, writes and the network are
 * faked: no market data is requested and no signal or engine event is written for an explicit-expiry packet.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = 'test-key-not-real';
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  const asOf = day(-1), e1 = day(9), e2 = day(16), unlisted = day(30);
  // Two expiries with different open interest, so their put/call ratios differ (e1: 0.5, e2: 2.0).
  const row = (expiration: string, type: string, strike: number, oi: number) => ({ contractID: `${expiration}${type}${strike}`, expiration, type, strike: String(strike), open_interest: String(oi), volume: '10', implied_volatility: '0.3', date: asOf, bid: '1', ask: '1.1', mark: '1.05', last: '1.05' });
  const chain = [100, 105, 110].flatMap((k) => [row(e1, 'call', k, 2000), row(e1, 'put', k, 1000), row(e2, 'call', k, 500), row(e2, 'put', k, 1000)]);
  return { e1, e2, unlisted, asOf, chain };
});

vi.mock('@/lib/options/chainCache', async (orig) => ({
  ...(await orig<typeof import('@/lib/options/chainCache')>()),
  fetchSharedOptionsChain: vi.fn(async () => ({ rows: h.chain, provider: 'HISTORICAL_OPTIONS', quoteBasis: 'previous_session', asOfDate: h.asOf, quoteCoverage: 1 })),
}));
vi.mock('@/lib/goldenEggFetchers', async (orig) => {
  const actual = await orig<typeof import('@/lib/goldenEggFetchers')>();
  return {
    ...actual,
    // Same ticker, two assets: equity around 105, crypto around 60,000.
    fetchPrice: vi.fn(async (_s: string, assetClass: string) => {
      const base = assetClass === 'crypto' ? 60_000 : 105;
      const dates: string[] = []; for (let d = Date.now() - 300 * 86_400_000; dates.length < 300; d += 86_400_000) dates.push(new Date(d).toISOString().slice(0, 10));
      const closes = dates.map((_, i) => base * (1 + Math.sin(i / 9) * 0.02));
      return { price: base, change: 0, changePct: 0, high: base, low: base, volume: 1e6, avgVolume: 1e6, priceTs: new Date().toISOString(), source: `fake-${assetClass}`,
        historicalCloses: closes, historicalOpens: closes, historicalHighs: closes.map((c) => c * 1.01), historicalLows: closes.map((c) => c * 0.99), historicalDates: dates, historicalVolumes: closes.map(() => 1e6),
        lastCompletedBarAt: dates[dates.length - 2], barInterval: 'daily' };
    }),
    // The real snapshot builder (expiry selection included), wrapped to observe the expiry it receives.
    fetchOptionsSnapshot: vi.fn(actual.fetchOptionsSnapshot),
    fetchIndicators: vi.fn(async () => null),
    fetchMPE: vi.fn(async () => null),
    fetchTimeConfluence: vi.fn(async () => null),
    fetchMacroRegime: vi.fn(async () => null),
    fetchCryptoDerivatives: vi.fn(async () => null),
  };
});
vi.mock('@/lib/avRateGovernor', () => ({ avFetch: vi.fn(async () => { throw new Error('network denied in test'); }), avTakeToken: vi.fn(async () => undefined) }));
vi.mock('@/lib/macro/calendar/feed', () => ({ buildCalendarFeed: vi.fn(async () => null) }));
vi.mock('@/lib/goldenEgg/companyOverview', () => ({ getFundamentalsSummary: vi.fn(async () => null) }));
vi.mock('@/lib/scoring/canonical/regimeOverlayData', () => ({ loadRegimeOverlayInputs: vi.fn(async () => null) }));
vi.mock('@/lib/onDemandFetch', () => ({ getQuote: vi.fn(async () => null), getIndicators: vi.fn(async () => null) }));
vi.mock('@/lib/coingecko', () => ({ getGlobalData: vi.fn(async () => null), getAggregatedFundingRates: vi.fn(async () => []), getAggregatedOpenInterest: vi.fn(async () => []) }));
vi.mock('@/lib/scanner/cryptoBars', () => ({ fetchCryptoSeries: vi.fn(async () => null) }));
vi.mock('@/lib/signalRecorder', () => ({ recordSignal: vi.fn(async () => undefined) }));
vi.mock('@/lib/brain/engineBridge', () => ({ recordEngineEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'w1', tier: 'pro' })) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => true }));

import { computeGoldenEgg } from '@/lib/goldenEgg/engine';
import { fetchOptionsSnapshot } from '@/lib/goldenEggFetchers';
import { recordSignal } from '@/lib/signalRecorder';
import { summarizeChain } from '@/lib/goldenEgg/optionsChain';
import { GET as dveGET } from '@/app/api/dve/route';

const ge = (symbol: string, assetClass: 'equity' | 'crypto', expiry?: string) => computeGoldenEgg({ symbol, timeframe: 'daily', assetClass, expiry });

describe('expiry selection (pure)', () => {
  it('default, explicit and unlisted expiry', () => {
    expect(summarizeChain(h.chain as any, 105)!.expiry).toBe(h.e1);
    expect(summarizeChain(h.chain as any, 105, { expiry: h.e2 })!.expiry).toBe(h.e2);
    expect(summarizeChain(h.chain as any, 105, { expiry: h.unlisted })).toBeNull();
  });
});

describe('Golden Egg packet: expiry in request, computation, response and cache identity', () => {
  it.each([['default first', [undefined, h.e2]], ['explicit first', [h.e2, undefined]]] as const)('two expiries, warm %s, keep their own observations', async (_label, order) => {
    const sym = `EXP${order[0] ? 'B' : 'A'}`;
    const out: Record<string, any> = {};
    for (const e of order) out[e ?? 'default'] = (await ge(sym, 'equity', e)).payload;
    // Warm again, in reverse order: served from cache, still the right expiry each.
    for (const e of [...order].reverse()) { const r = await ge(sym, 'equity', e); expect(r.cached).toBe(true); expect(r.payload.canonical!.options!.expiry).toBe(e ?? h.e1); }
    expect(out.default.canonical.options.expiry).toBe(h.e1);
    expect(out.default.canonical.options.putCallOi).toBe(0.5);
    expect(out.default.optionsRequest).toBeUndefined();
    expect(out[h.e2].canonical.options.expiry).toBe(h.e2);
    expect(out[h.e2].canonical.options.putCallOi).toBe(2);
    expect(out[h.e2].optionsRequest).toEqual({ expiry: h.e2, status: 'used' });
  });
  it('an unlisted explicit expiry is reported and never replaced by the default, cold or warm', async () => {
    const cold = await ge('EXPC', 'equity', h.unlisted);
    expect(cold.payload.canonical!.options).toBeNull();
    expect(cold.payload.optionsRequest).toEqual({ expiry: h.unlisted, status: 'unavailable' });
    expect(cold.warnings.join(' ')).toContain('no other expiry was substituted');
    const warm = await ge('EXPC', 'equity', h.unlisted);
    expect(warm.cached).toBe(true);
    expect(warm.payload.canonical!.options).toBeNull();
    expect(warm.warnings.join(' ')).toContain('no other expiry was substituted');
    // The default packet for the same ticker is computed separately.
    expect((await ge('EXPC', 'equity')).payload.canonical!.options!.expiry).toBe(h.e1);
  });
  it('the expiry reaches the chain request; crypto ignores it', async () => {
    vi.mocked(fetchOptionsSnapshot).mockClear();
    await ge('EXPD', 'equity', h.e2);
    expect(vi.mocked(fetchOptionsSnapshot).mock.calls[0][2]).toMatchObject({ expiry: h.e2 });
    const c = await ge('EXPD', 'crypto', h.e2);
    expect(c.payload.optionsRequest).toBeUndefined();
  });
  it('an explicit-expiry packet writes no signal record', async () => {
    vi.mocked(recordSignal).mockClear();
    await ge('EXPE', 'equity', h.e2);
    expect(recordSignal).not.toHaveBeenCalled();
  });
  it.each([['equity first', ['equity', 'crypto']], ['crypto first', ['crypto', 'equity']]] as const)('same ticker as equity and crypto, warm %s', async (_l, order) => {
    const sym = `SAME${order[0] === 'equity' ? 'E' : 'C'}`;
    for (const a of order) await ge(sym, a);
    for (const a of [...order].reverse()) {
      const r = await ge(sym, a);
      expect(r.cached).toBe(true);
      expect(r.payload.meta.price).toBe(a === 'crypto' ? 60_000 : 105);
      expect(r.payload.canonical!.assetClass).toBe(a);
    }
  });
});

describe('DVE route: asset identity before the cache, expiry in the key', () => {
  const call = async (qs: string) => (await dveGET(new NextRequest(`https://example.test/api/dve?${qs}`))).json();
  beforeEach(() => vi.mocked(fetchOptionsSnapshot).mockClear());
  it.each([['equity first', ['equity', 'crypto']], ['crypto first', ['crypto', 'equity']]] as const)('same ticker as equity and crypto, warm %s', async (_l, order) => {
    const sym = `DV${order[0] === 'equity' ? 'E' : 'C'}`;
    for (const a of order) expect((await call(`symbol=${sym}&type=${a}`)).cached).toBe(false);
    for (const a of [...order].reverse()) {
      const r = await call(`symbol=${sym}&type=${a}`);
      expect(r.cached).toBe(true);
      expect(r.price).toBe(a === 'crypto' ? 60_000 : 105);
    }
  });
  it('two expiries and an unlisted one keep separate readings and report the request', async () => {
    const d1 = await call('symbol=DVX&type=equity');
    const d2 = await call(`symbol=DVX&type=equity&expiry=${h.e2}`);
    const d3 = await call(`symbol=DVX&type=equity&expiry=${h.unlisted}`);
    expect([d1.cached, d2.cached, d3.cached]).toEqual([false, false, false]);
    expect(d1.optionsRequest).toBeUndefined();
    expect(d2.optionsRequest).toEqual({ expiry: h.e2, status: 'used' });
    expect(d3.optionsRequest).toEqual({ expiry: h.unlisted, status: 'unavailable' });
    expect(vi.mocked(fetchOptionsSnapshot).mock.calls.map((c) => (c[2] as any)?.expiry ?? null)).toEqual([null, h.e2, h.unlisted]);
    expect((await call(`symbol=DVX&type=equity&expiry=${h.unlisted}`)).optionsRequest).toEqual({ expiry: h.unlisted, status: 'unavailable' });
  });
  it('rejects a malformed expiry', async () => {
    const r = await dveGET(new NextRequest('https://example.test/api/dve?symbol=DVY&expiry=next-friday'));
    expect(r.status).toBe(400);
  });
});
