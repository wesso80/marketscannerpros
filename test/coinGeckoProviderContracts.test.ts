import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/admin/providerTelemetry', () => ({ recordProviderFailure: vi.fn(), recordProviderSuccess: vi.fn() }));
vi.mock('@/lib/circuitBreaker', () => ({ coinGeckoCircuit: { call: (fn: () => unknown) => fn() } }));
import { getDerivativesTickers, getOHLCRange, invalidateDerivativesCache, normalizeDerivativeExchangeTicker } from '@/lib/coingecko';
import { buildObservedCryptoQuote } from '@/lib/worker/cryptoQuote';

const now = Date.UTC(2026, 8, 21, 23);
// Exchange-detail contract, deliberately distinct from the all-tickers schema.
const ticker = (overrides: Record<string, unknown> = {}) => ({
  symbol: 'BTCUSDT', base: 'BTC', target: 'USDT', contract_type: 'perpetual',
  last: 110000, h24_percentage_change: 2, index: 110010,
  index_basis_percentage: -0.009, bid_ask_spread: 0.01, funding_rate: 0.005,
  open_interest_usd: 12345678, h24_volume: 99,
  converted_volume: { usd: '987654321' }, converted_last: { usd: '110000.25' },
  last_traded: now / 1000 - 10, expired_at: null, ...overrides,
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(now);
  invalidateDerivativesCache();
  vi.stubGlobal('fetch', vi.fn());
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('exchange-detail derivatives adapter', () => {
  it('maps asset, exchange, USD units and provider time without rescaling funding', () => {
    expect(normalizeDerivativeExchangeTicker(ticker(), 'Venue A')).toMatchObject({
      market: 'Venue A', index_id: 'BTC', price: '110000.25', funding_rate: 0.005,
      open_interest: 12345678, volume_24h: 987654321, last_traded_at: now / 1000 - 10,
    });
  });
  it('keeps missing funding and USD volume unavailable instead of inventing zero or using contract volume', () => {
    const row = normalizeDerivativeExchangeTicker(ticker({ funding_rate: null, converted_volume: {} }), 'Venue A')!;
    expect(Number.isNaN(row.funding_rate)).toBe(true);
    expect(Number.isNaN(row.volume_24h)).toBe(true);
  });
  it.each([
    { base: '' }, { last_traded: null }, { last_traded: now / 1000 - 901 },
    { last_traded: now / 1000 + 120 }, { expired_at: now / 1000 - 1 },
  ])('rejects unidentified, stale, future-dated or expired evidence: %j', (invalid) => {
    expect(normalizeDerivativeExchangeTicker(ticker(invalid), 'Venue')).toBeNull();
  });
  it('shares one bounded provider fetch across concurrent symbol consumers and preserves distinct venues', async () => {
    const fetch = vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/derivatives/exchanges')) return json([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);
      return json({ name: path.endsWith('/a') ? 'A' : 'B', tickers: [ticker(), ticker()] });
    });
    const rows = await Promise.all(Array.from({ length: 20 }, () => getDerivativesTickers()));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(rows[0]).toHaveLength(2);
    expect(new Set(rows[0]!.map(t => t.market))).toEqual(new Set(['A', 'B']));
    expect(await getDerivativesTickers()).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('does not retry an empty/malformed provider response for every row; retries after cooldown', async () => {
    const fetch = vi.mocked(globalThis.fetch).mockImplementation(async input =>
      json(new URL(String(input)).pathname.endsWith('/derivatives/exchanges') ? [{ id: 'a', name: 'A' }] : { name: 'A', tickers: [] }));
    for (let i = 0; i < 50; i++) expect(await getDerivativesTickers()).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.setSystemTime(now + 60_001);
    await getDerivativesTickers();
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it('expires old cached evidence when a refresh fails without refreshing its timestamp', async () => {
    const fetch = vi.mocked(globalThis.fetch).mockImplementation(async input =>
      json(new URL(String(input)).pathname.endsWith('/derivatives/exchanges') ? [{ id: 'a', name: 'A' }] : { name: 'A', tickers: [ticker()] }));
    await getDerivativesTickers();
    fetch.mockRejectedValue(new Error('provider down'));
    vi.setSystemTime(now + 301_000);
    expect((await getDerivativesTickers())?.[0].last_traded_at).toBe(now / 1000 - 10);
    vi.setSystemTime(now + 901_000);
    expect(await getDerivativesTickers()).toBeNull();
  });
});

describe('OHLC request boundaries', () => {
  it.each([['daily', 180], ['hourly', 31]] as const)('permits the %s limit and blocks an oversized request without spending a call', async (interval, days) => {
    const fetch = vi.mocked(globalThis.fetch).mockResolvedValue(json([]));
    const end = now / 1000 - 60;
    expect(await getOHLCRange('bitcoin', end - days * 86400, end, undefined, interval)).toEqual([]);
    const url = new URL(String(fetch.mock.calls[0][0]));
    expect(url.searchParams.get('interval')).toBe(interval);
    expect(await getOHLCRange('bitcoin', end - days * 86400 - 1, end, undefined, interval)).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('worker spot quote integrity', () => {
  it('uses observed spot price and provider time, leaving unavailable OHLC blank', () => {
    expect(buildObservedCryptoQuote({ usd: 110, usd_24h_change: 10, usd_24h_vol: 1234, last_updated_at: now / 1000 - 30 })).toMatchObject({
      price: 110, prevClose: expect.closeTo(100), open: null, high: null, low: null,
      volume: 1234, updatedAt: new Date(now - 30000).toISOString(),
    });
  });
  it('rejects unknown or stale observation time and retains missing changes as null', () => {
    expect(buildObservedCryptoQuote({ usd: 110 })).toBeNull();
    expect(buildObservedCryptoQuote({ usd: 110, last_updated_at: now / 1000 - 901 })).toBeNull();
    expect(buildObservedCryptoQuote({ usd: 110, last_updated_at: now / 1000 })).toMatchObject({ prevClose: null, changeAmt: null, changePct: null, volume: null });
  });
});
