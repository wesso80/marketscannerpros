import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Regression (after #26): MSP Terminal › Capital Pressure (useFlow → GET /api/flow, equity path) still showed
 * "Blocked: NO-TRADE MODE: data health stale" for COST. Alpha Vantage options responses are
 * `{ endpoint, message, data: [...] }` with the snapshot date on each CONTRACT, not at the top level, so
 * fetchOptionsChain always returned dataDate=null → analyzer freshness 'STALE' → genuine-fallback flag + score 20
 * → flow-trade-permission "NO-TRADE MODE: data health stale".
 * These tests run the real fetchOptionsChain on AV-shaped payloads, the analyzer's dataQuality mapping, the real
 * /api/flow route and capital-flow engine, down to the permission text the Terminal card renders.
 */

vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'ws-1', cid: 'c', tier: 'pro_trader' })) }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: vi.fn(async () => undefined), avFetch: vi.fn(async () => null) }));
vi.mock('@/lib/state-machine-store', () => ({ getLatestStateMachine: vi.fn(async () => null), upsertStateMachine: vi.fn(async () => undefined) }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));
vi.mock('@/lib/redis', () => ({ getCached: vi.fn(async () => null), setCached: vi.fn(async () => undefined), CACHE_KEYS: { bars: (s: string) => `bars:${s}` }, CACHE_TTL: {} }));
vi.mock('@/lib/coingecko', () => ({ getDerivativesForSymbols: vi.fn(), getGlobalData: vi.fn(), getOHLC: vi.fn(), resolveSymbolToId: vi.fn(), COINGECKO_ID_MAP: {} }));
vi.mock('@/lib/options-confluence-analyzer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/options-confluence-analyzer')>();
  return {
    ...actual,
    // analyzeForOptions is large (confluence scan etc.); reproduce ONLY its chain → dataQuality step with the real helpers.
    optionsAnalyzer: {
      analyzeForOptions: vi.fn(async (symbol: string) => {
        const chain = await actual.fetchOptionsChain(symbol);
        const dq = chain
          ? { ...actual.chainDataQualityFields(chain), contractsCount: { calls: chain.calls.length, puts: chain.puts.length } }
          : { optionsChainSource: 'none', freshness: 'STALE', lastUpdated: new Date().toISOString() };
        return {
          currentPrice: 896.46,
          expectedMove: { selectedExpiry: 14 },
          openInterestAnalysis: chain ? { totalCallOI: 60000, totalPutOI: 45000, pcRatio: 0.75, expirationDate: chain.selectedExpiry, highOIStrikes: [] } : null,
          dataQuality: dq,
          dataConfidenceCaps: ['EOD options data - confidence capped (not realtime)', 'DTE excludes market holidays (approx.)'],
        };
      }),
    },
  };
});

// 2026-09-25 05:24Z = Fri 25 Sep 3:24 PM AEST = Fri 01:24 ET (the signed-in live check).
const NOW = Date.parse('2026-09-25T05:24:00Z');

function contract(symbol: string, type: 'call' | 'put', strike: number, date: string, expiration = '2026-10-02') {
  return {
    contractID: `${symbol}261002${type === 'call' ? 'C' : 'P'}${strike}`, symbol, expiration, strike: strike.toFixed(2), type,
    last: '5.00', mark: '5.00', bid: '4.90', bid_size: '10', ask: '5.10', ask_size: '10', volume: '100', open_interest: '1500',
    date, implied_volatility: '0.22', delta: type === 'call' ? '0.50' : '-0.50', gamma: '0.01', theta: '-0.1', vega: '0.2', rho: '0.01',
  };
}
// Exactly AV's shape: no top-level date.
const histPayload = (date: string, symbol = 'COST') => ({
  endpoint: 'Historical Options', message: 'success',
  data: [880, 890, 900, 910].flatMap((k) => [contract(symbol, 'call', k, date), contract(symbol, 'put', k, date)]),
});
// AV premium endpoint without entitlement: artificial sample schema.
const samplePayload = { endpoint: 'Realtime Options', message: 'This is a premium endpoint. ***THE SAMPLE DATA SCHEMA BELOW IS ARTIFICIAL***', data: [contract('XXYYZZ', 'call', 20, '2049-99-99', '2099-99-99')] };

function stubAv(opts: { realtime?: unknown; historical?: unknown }) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(url);
    const fn = new URL(url).searchParams.get('function');
    const body = fn === 'REALTIME_OPTIONS' ? (opts.realtime ?? { Information: 'not entitled' }) : fn === 'HISTORICAL_OPTIONS' ? (opts.historical ?? { data: [] }) : {};
    return { status: 200, json: async () => body } as Response;
  }));
  return calls;
}

async function flowFor(symbol: string) {
  const { GET } = await import('../app/api/flow/route');
  const res = await GET(new Request(`http://localhost/api/flow?symbol=${symbol}&marketType=equity`) as any);
  const body = await res.json();
  const fd = body.data;
  const perm = fd.flow_trade_permission;
  // Same text the Terminal Capital Pressure card renders (app/tools/terminal/page.tsx).
  const cardText = `${!perm ? 'Permission unavailable.' : perm.blocked ? `Blocked: ${perm.noTradeMode?.reason || 'permission conditions not met'}` : 'Permission conditions met.'}`;
  return { fd, perm, cardText, gate: fd.brain_decision_v1.state_machine.gates.data_health };
}

beforeEach(async () => {
  vi.resetModules();
  (await import('@/lib/options/chainCache')).clearSharedOptionsChainCache();
  vi.stubEnv('ALPHA_VANTAGE_API_KEY', 'test-key');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('chainDataDate', () => {
  it('reads the per-contract date when the payload has no top-level date', async () => {
    const { chainDataDate } = await import('@/lib/options-confluence-analyzer');
    const p = histPayload('2026-09-24');
    expect(chainDataDate(p, p.data)).toBe('2026-09-24');
    expect(chainDataDate({ date: '2026-09-23' }, p.data)).toBe('2026-09-23'); // top-level still honoured
    expect(chainDataDate(samplePayload, samplePayload.data)).toBeNull(); // "2049-99-99" is not a date
    expect(chainDataDate({}, [])).toBeNull();
  });
});

describe('fetchOptionsChain (real) on Alpha Vantage-shaped payloads', () => {
  it('HISTORICAL_OPTIONS chain gets its data date and EOD freshness', async () => {
    stubAv({ historical: histPayload('2026-09-24') });
    const { fetchOptionsChain, chainDataQualityFields } = await import('@/lib/options-confluence-analyzer');
    const chain = await fetchOptionsChain('COST');
    expect(chain?.dataDate).toBe('2026-09-24');
    expect(chain?.sourceFunction).toBe('HISTORICAL_OPTIONS');
    expect(chainDataQualityFields(chain!)).toEqual({ optionsChainSource: 'alpha_vantage', freshness: 'EOD', lastUpdated: '2026-09-24' });
  });

  it('skips an artificial premium sample chain and falls through to HISTORICAL_OPTIONS', async () => {
    const calls = stubAv({ realtime: samplePayload, historical: histPayload('2026-09-24') });
    const { fetchOptionsChain } = await import('@/lib/options-confluence-analyzer');
    const chain = await fetchOptionsChain('COST');
    expect(calls.some((u) => u.includes('REALTIME_OPTIONS'))).toBe(true);
    expect(chain?.sourceFunction).toBe('HISTORICAL_OPTIONS');
    expect(chain?.calls.every((c) => c.symbol === 'COST')).toBe(true);
  });

  it('a realtime chain gets its data date and REALTIME freshness', async () => {
    stubAv({ realtime: histPayload('2026-09-24') });
    const { fetchOptionsChain, chainDataQualityFields } = await import('@/lib/options-confluence-analyzer');
    const chain = await fetchOptionsChain('COST');
    expect(chainDataQualityFields(chain!).freshness).toBe('REALTIME');
    expect(chain?.dataDate).toBe('2026-09-24');
  });
});

describe('GET /api/flow (Terminal › Capital Pressure) data-health permission', () => {
  it('normal EOD equity chain (previous session): no "data health stale", data-health gate passes', async () => {
    stubAv({ historical: histPayload('2026-09-24') });
    const r = await flowFor('COST');
    expect(r.gate.pass).toBe(true);
    expect(r.gate.score).toBeGreaterThanOrEqual(55);
    expect(r.fd.data_health.fallback_active).toBe(false);
    expect(r.perm.noTradeMode.reason).not.toMatch(/data health stale/i);
    expect(r.cardText).not.toMatch(/data health stale/i);
  });

  it('realtime chain: no "data health stale"', async () => {
    stubAv({ realtime: histPayload('2026-09-25') });
    const r = await flowFor('COST');
    expect(r.gate.pass).toBe(true);
    expect(r.cardText).not.toMatch(/data health stale/i);
  });

  it('EOD chain older than the previous session → "NO-TRADE MODE: data health stale"', async () => {
    stubAv({ historical: histPayload('2026-09-22') });
    const r = await flowFor('COST');
    expect(r.gate.pass).toBe(false);
    expect(r.cardText).toBe('Blocked: NO-TRADE MODE: data health stale');
  });

  it('no usable chain (only the premium sample, no historical) → "NO-TRADE MODE: data health stale"', async () => {
    stubAv({ realtime: samplePayload, historical: { data: [] } });
    const r = await flowFor('COST');
    expect(r.fd.data_health.fallback_active).toBe(true);
    expect(r.gate.pass).toBe(false);
    expect(r.cardText).toBe('Blocked: NO-TRADE MODE: data health stale');
  });
});
