/**
 * RS-16 — Fragility could hang on "Loading Market Fragility…": no client or server timeout, and a cold cache fetched
 * 27 symbols one after another with no per-call timeout. Now: limited parallel fetching with a time budget, per-call
 * timeouts, one shared in-flight load, a route budget (503 + retry), and a client timeout with a Retry button.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: vi.fn(async () => undefined) }));
vi.mock('@/lib/coingecko', () => ({ getMarketChartHistory: vi.fn(async () => ({ prices: Array.from({ length: 300 }, (_, i) => [Date.parse('2025-11-01') + i * 86_400_000, 100 + i]) })) }));

import { loadFragilityInput, type DailySeriesResult } from '@/lib/intelligence/data/marketDataProvider';
import { FRAGILITY_SYMBOLS } from '@/lib/intelligence/engines/fragility';
import { clearFragilityCache, resolveFragility } from '@/lib/intelligence/fragilityService';

const bars = (n = 300) => Array.from({ length: n }, (_, i) => ({ date: new Date(Date.parse('2025-11-01') + i * 86_400_000).toISOString().slice(0, 10), close: 100 + Math.sin(i / 5) * 5 + i * 0.05, high: 101 + i * 0.05 }));
const ok = (provider: DailySeriesResult['provider']): DailySeriesResult => ({ bars: bars(), provider });

const ENV = { ...process.env };
beforeEach(() => {
  process.env.INTELLIGENCE_LIVE_DATA = 'true';
  process.env.FRED_API_KEY = 'k';
  process.env.ALPHA_VANTAGE_API_KEY = 'k';
  clearFragilityCache();
});
afterEach(() => { process.env = { ...ENV }; vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('loadFragilityInput: limited parallelism and a time budget', () => {
  it('fetches with at most 4 calls in flight and still loads every symbol', async () => {
    let inFlight = 0, maxInFlight = 0, calls = 0;
    const slow = (provider: DailySeriesResult['provider']) => async () => {
      calls++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return ok(provider);
    };
    const input = await loadFragilityInput({ alphaVantage: slow('alpha-vantage'), fred: slow('fred'), coingecko: slow('coingecko'), derivedTotal3: async () => ({ bars: null, provider: 'derived', error: 'n/a' }) });
    expect(maxInFlight).toBe(4);
    expect(maxInFlight).toBeGreaterThan(1); // no longer one after another
    expect(calls).toBe(FRAGILITY_SYMBOLS.length - 1);
    expect(input.timedOut).toBeUndefined();
    expect(input.sourceStatus).toBe('PARTIAL'); // TOTAL3 is honestly unavailable
  });

  it('a provider that never answers cannot hold the load: skipped symbols are reported as timed out', async () => {
    const never = () => new Promise<DailySeriesResult>(() => undefined);
    const t0 = Date.now();
    const input = await loadFragilityInput(
      { alphaVantage: never, fred: async () => ok('fred'), coingecko: async () => ok('coingecko'), derivedTotal3: async () => ({ bars: null, provider: 'derived' }) },
      { budgetMs: 60 },
    );
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(input.timedOut!.length).toBeGreaterThan(0);
    expect(input.sourceStatus === 'PARTIAL' || input.sourceStatus === 'DATA_UNAVAILABLE').toBe(true);
    for (const s of input.timedOut!) expect(input.series[s as keyof typeof input.series]).toBeUndefined();
  });
});

describe('resolveFragility: shared in-flight load and stale fallback', () => {
  function stubProviders(fail = false) {
    const fetchMock = vi.fn(async (url: string) => {
      if (fail) throw new Error('provider down');
      if (url.includes('alphavantage')) {
        const ts: Record<string, Record<string, string>> = {};
        for (const b of bars()) ts[b.date] = { '4. close': String(b.close), '2. high': String(b.high) };
        return { json: async () => ({ 'Time Series (Daily)': ts }) };
      }
      return { json: async () => ({ observations: bars().map((b) => ({ date: b.date, value: String(b.close) })) }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('concurrent cold requests share one provider load', async () => {
    const fetchMock = stubProviders();
    const [a, b] = await Promise.all([resolveFragility(), resolveFragility()]);
    expect(a).toBe(b);
    expect(a.isLive).toBe(true);
    const avFredSymbols = FRAGILITY_SYMBOLS.length - 3; // minus BTC/ETH (CoinGecko) and TOTAL3 (derived)
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(avFredSymbols);
    // per-call timeout signal on every provider fetch
    for (const call of fetchMock.mock.calls) expect((call as unknown as [string, RequestInit])[1]?.signal).toBeDefined();
  });

  it('when a refresh fails after the cache expires, the last live result is served instead of MOCK', async () => {
    stubProviders();
    const first = await resolveFragility();
    expect(first.isLive).toBe(true);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 7 * 60 * 60 * 1000);
    stubProviders(true);
    const second = await resolveFragility();
    expect(second).toBe(first);
  });
});

describe('route budget and client timeout', () => {
  it('route returns 503 with a retry message when the load exceeds its budget', async () => {
    vi.resetModules();
    vi.doMock('@/lib/intelligence/fragilityService', () => ({ resolveFragility: () => new Promise(() => undefined) }));
    vi.useFakeTimers();
    const { GET } = await import('@/app/api/intelligence/fragility/route');
    const p = GET();
    await vi.advanceTimersByTimeAsync(25_001);
    const res = await p;
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('10');
    expect((await res.json()).error).toMatch(/retry/i);
    vi.doUnmock('@/lib/intelligence/fragilityService');
  });

  it('client hook has a timeout and the Fragility page offers Retry', () => {
    const hook = readFileSync(join(process.cwd(), 'components/intelligence/useEndpoint.ts'), 'utf8');
    expect(hook).toMatch(/ENDPOINT_TIMEOUT_MS = 30_000/);
    expect(hook).toMatch(/setTimeout\(\(\) => \{ timedOut = true; controller\.abort\(\); \}, timeoutMs\)/);
    expect(hook).toMatch(/Timed out after/);
    const page = readFileSync(join(process.cwd(), 'app/intelligence/fragility/page.tsx'), 'utf8');
    expect(page).toMatch(/onClick=\{retry\}/);
  });
});
