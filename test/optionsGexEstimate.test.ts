/**
 * Fix 1 + 2: /api/options/gex used to run the full options analyzer (~4 Alpha Vantage calls) and then return
 * dealerGamma: null, and the dealer-delta (DEX) maths assumed the opposite dealer positioning to the GEX maths.
 * Now the route builds a labelled GEX estimate from one expiry of the shared chain (all strikes), and GEX/DEX
 * share one convention: dealers long calls, short puts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const m = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'test-key';
  return { av: {} as Record<string, unknown>, calls: [] as string[], session: { workspaceId: 'w1', cid: 'cus_1', tier: 'pro' } as any };
});
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => m.session) }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));
vi.mock('@/lib/redis', () => ({ getCached: vi.fn(async () => null), setCached: vi.fn(async () => true), CACHE_KEYS: {}, CACHE_TTL: {} }));
vi.mock('@/lib/avRateGovernor', () => ({
  avTakeToken: vi.fn(async () => undefined),
  avFetch: vi.fn(async (url: string) => {
    const fn = new URL(url).searchParams.get('function') || '';
    m.calls.push(fn === 'GLOBAL_QUOTE' ? `GLOBAL_QUOTE:${new URL(url).searchParams.get('entitlement')}` : fn);
    const v = m.av[fn];
    if (v instanceof Error) throw v;
    return v ?? null;
  }),
}));

import { GET as gexGET } from '../app/api/options/gex/route';
import { clearSharedOptionsChainCache } from '../lib/options/chainCache';
import {
  calculateDealerGammaFromContracts,
  calculateDealerGammaSnapshot,
  pickGexExpiry,
  type GexContractInput,
} from '../lib/options-gex';
import { dealerOverlayFromGexPayload } from '../lib/options/gexOverlay';

const EXP = '2030-01-18';
function row(type: 'call' | 'put', strike: number, oi = 1000, gamma = 0.02, expiration = EXP) {
  return {
    contractID: `XYZ300118${type === 'call' ? 'C' : 'P'}${strike}`, symbol: 'XYZ', expiration, strike: strike.toFixed(2), type,
    mark: '2.00', bid: '1.95', ask: '2.05', volume: '50', open_interest: String(oi), date: '2026-09-25',
    implied_volatility: '0.30', delta: type === 'call' ? '0.50' : '-0.50', gamma: String(gamma),
  };
}
const chain = (rows: unknown[]) => ({ endpoint: 'Realtime Options', message: 'success', data: rows });
const quote = { 'Global Quote': { '05. price': '100.00' } };
const sample = { message: 'This is a premium endpoint. ***THE SAMPLE DATA SCHEMA BELOW IS ARTIFICIAL***', data: [{ ...row('call', 20), symbol: 'XXYYZZ', contractID: 'XXYYZZ999999C00020000' }] };
const call = () => gexGET(new NextRequest('http://localhost/api/options/gex?symbol=XYZ&scanMode=intraday_1h'));

beforeEach(() => {
  m.av = {}; m.calls = [];
  clearSharedOptionsChainCache();
});

describe('GEX / DEX convention (dealers long calls, short puts)', () => {
  const c = (type: 'call' | 'put', strike: number, delta: number): GexContractInput => ({ strike, openInterest: 1000, type, gamma: 0.02, delta });

  it('calls add gamma, puts subtract; DEX is + for long calls and + for short puts (no contradictory sign)', () => {
    const callsOnly = calculateDealerGammaFromContracts([c('call', 100, 0.5)], 100, EXP);
    const putsOnly = calculateDealerGammaFromContracts([c('put', 100, -0.5)], 100, EXP);
    expect(callsOnly.netGexUsd).toBeGreaterThan(0);
    expect(putsOnly.netGexUsd).toBeLessThan(0);
    // Dealer long 1000 calls of delta 0.5 → +0.5·1000·100·$100; dealer short 1000 puts of delta −0.5 → also +.
    expect(callsOnly.netDexUsd).toBeCloseTo(0.5 * 1000 * 100 * 100);
    expect(putsOnly.netDexUsd).toBeCloseTo(0.5 * 1000 * 100 * 100);
    // A put delta reported with the wrong sign still gets the put treatment.
    expect(calculateDealerGammaFromContracts([c('put', 100, 0.5)], 100, EXP).netDexUsd).toBeCloseTo(putsOnly.netDexUsd);
  });

  it('mirror chain (calls ↔ puts) gives exactly the opposite GEX — symmetric for long and short', () => {
    const a = [c('call', 100, 0.5), c('call', 105, 0.3), c('put', 95, -0.3)];
    const b = a.map((x) => ({ ...x, type: x.type === 'call' ? 'put' as const : 'call' as const }));
    expect(calculateDealerGammaFromContracts(b, 100, EXP).netGexUsd).toBeCloseTo(-calculateDealerGammaFromContracts(a, 100, EXP).netGexUsd);
  });

  it('uses every strike of the expiry (gexStrikes) instead of only the ~10 top-OI strikes when available', () => {
    const top = [c('call', 100, 0.5)];
    const all = [...top, ...[90, 92, 94, 96, 98].map((k) => c('put', k, -0.3))];
    const oi = { expirationDate: EXP, highOIStrikes: top.map((x) => ({ ...x, volume: 0 })), gexStrikes: all } as any;
    expect(calculateDealerGammaSnapshot(oi, 100).netGexUsd).toBeCloseTo(calculateDealerGammaFromContracts(all, 100, EXP).netGexUsd);
    expect(calculateDealerGammaSnapshot({ ...oi, gexStrikes: undefined }, 100).netGexUsd).toBeGreaterThan(0);
  });

  it('picks the requested expiry, else the one nearest this Friday (never an expired one)', () => {
    const rows = [row('call', 100, 1, 0.01, '2026-09-25'), row('call', 100, 1, 0.01, '2026-10-02'), row('call', 100, 1, 0.01, '2026-10-16')];
    expect(pickGexExpiry(rows, '2026-09-26')).toBe('2026-10-02');
    expect(pickGexExpiry(rows, '2026-09-26', '2026-10-16')).toBe('2026-10-16');
    expect(pickGexExpiry(rows, '2026-09-26', '2026-09-25')).toBe('2026-10-02');
  });
});

describe('GET /api/options/gex', () => {
  const rows = [95, 100, 105, 110].map((k) => row('call', k)).concat([90, 95, 100, 105].map((k) => row('put', k, 400)));

  it('returns a labelled estimate (expiry, asOf, convention) from one chain call + one realtime quote — no analyzer run', async () => {
    m.av = { REALTIME_OPTIONS_FMV: chain(rows), GLOBAL_QUOTE: quote };
    const body = await (await call()).json();
    expect(body.success).toBe(true);
    expect(body.data.available).toBe(true);
    expect(body.data.estimate).toBe(true);
    expect(body.data.dealerPositionVerified).toBe(false);
    expect(body.data.expirationDate).toBe(EXP);
    expect(body.data.asOf).toBe('2026-09-25');
    expect(body.data.convention).toMatch(/dealers long calls, short puts/);
    expect(body.data.dealerGamma.regime).toMatch(/LONG_GAMMA|SHORT_GAMMA|NEUTRAL/);
    expect(body.data.dealerGamma.netGexUsd).toBeGreaterThan(0); // call OI 1000 vs put OI 400
    expect(body.data.strikesUsed).toBe(5);
    expect(m.calls).toEqual(['REALTIME_OPTIONS_FMV', 'GLOBAL_QUOTE:realtime']);

    // Second view within the TTL reuses the cached chain: only the spot quote is fetched.
    m.calls = [];
    await call();
    expect(m.calls).toEqual(['GLOBAL_QUOTE:realtime']);
  });

  it('unusable chain → "unavailable" without spending the quote call', async () => {
    m.av = { REALTIME_OPTIONS_FMV: sample, HISTORICAL_OPTIONS: { data: [] }, GLOBAL_QUOTE: quote };
    const body = await (await call()).json();
    expect(body.data.available).toBe(false);
    expect(body.data.dealerGamma).toBeNull();
    expect(m.calls).not.toContain('GLOBAL_QUOTE:realtime');

    clearSharedOptionsChainCache(); m.calls = [];
    m.av = { REALTIME_OPTIONS_FMV: chain([row('call', 100), row('put', 100)]), GLOBAL_QUOTE: quote }; // too few strikes
    const thin = await (await call()).json();
    expect(thin.data.available).toBe(false);
    expect(thin.data.reason).toMatch(/Not enough strikes/);
    expect(m.calls).toEqual(['REALTIME_OPTIONS_FMV']);
  });
});

describe('Intraday Charts overlay mapping', () => {
  it('shows only a computed estimate; anything else is unavailable (never a default NEUTRAL)', () => {
    expect(dealerOverlayFromGexPayload({ success: true, data: { available: false, dealerGamma: null } })).toBeNull();
    // The old route's payload (dealerGamma null) must not turn into NEUTRAL.
    expect(dealerOverlayFromGexPayload({ success: true, data: { dealerGamma: null, dealerPositionVerified: false } })).toBeNull();
    expect(dealerOverlayFromGexPayload({ success: false })).toBeNull();
    const overlay = dealerOverlayFromGexPayload({
      success: true,
      data: {
        available: true, estimate: true, expirationDate: EXP, asOf: '2026-09-25',
        dealerGamma: { regime: 'NEUTRAL' },
        dealerIntelligence: { dealerStructure: { callWall: 105, putWall: 95, gammaFlip: null, topNodes: [] }, attention: { triggered: false } },
      },
    });
    expect(overlay).toMatchObject({ regime: 'NEUTRAL', estimate: true, expirationDate: EXP, asOf: '2026-09-25', structure: { callWall: 105, putWall: 95, gammaFlip: null } });
  });
});
