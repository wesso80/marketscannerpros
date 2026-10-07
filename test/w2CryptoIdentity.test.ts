/**
 * W2 acceptance (C02): the CoinGecko id and the ticker-matched exchange sources (OKX perpetual and spot, Yahoo) are
 * bound explicitly. A failed coin-detail request, a shared ticker or an unconfirmed OKX listing never yields a combined
 * snapshot that reads as one verified asset. Cold and warm caches, both orders. Network, Redis and providers are fake;
 * no historical mismatch is asserted.
 */
import { it, expect, vi, beforeEach, afterEach, describe } from 'vitest';
const memory = vi.hoisted(() => new Map<string, any>());
const now = Date.parse('2026-10-04T01:00Z'), day = 86400000;
const r = vi.hoisted(() => ({
  get: async (k: string) => memory.get(k) ?? null, set: async (k: string, v: unknown) => { memory.set(k, v); return 'OK'; },
  incrby: async (k: string, n: number) => { const v = (memory.get(k) ?? 0) + n; memory.set(k, v); return v; }, expire: async () => 1, hincrby: async () => 1,
  eval: async (_s: string, k: string[], a: number[]) => { const own = Number(memory.get(k[0]) ?? 0), n = a[0]; memory.set(k[0], own + n); return [1, own + n, 0]; },
}));
vi.mock('@/lib/redis', () => ({ getRedis: () => r, getCached: async (k: string) => memory.get(k) ?? null, setCached: async (k: string, v: unknown) => { memory.set(k, v); return true; } }));
import { loadBreakdown } from '@/lib/crypto/breakdown/load';
import { resetFlights } from '@/lib/crypto/breakdown/cache';

// Two coins share the ticker QNT. Only quant-network is listed on OKX (per its own CoinGecko ticker list).
const DETAIL_SYMBOL: Record<string, string> = { 'quant-network': 'QNT', 'fake-quant': 'QNT', chainlink: 'LINK', 'wrong-coin': 'XYZ' };
let detailFails = new Set<string>(), tickersFail = false, okxOwner: Record<string, string> = { QNT: 'quant-network', LINK: 'chainlink' };
const response = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json' } });
const chart = () => ({ prices: Array.from({ length: 400 }, (_, i) => [Math.floor(now / day) * day - (399 - i) * day, 100]), market_caps: Array.from({ length: 400 }, (_, i) => [Math.floor(now / day) * day - (399 - i) * day, 1e6]), total_volumes: Array.from({ length: 400 }, (_, i) => [Math.floor(now / day) * day - (399 - i) * day, 1e7]) });
const okxCalls = () => vi.mocked(fetch).mock.calls.map((c) => String(c[0])).filter((u) => u.includes('okx.com'));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now); memory.clear(); resetFlights();
  detailFails = new Set(); tickersFail = false; okxOwner = { QNT: 'quant-network', LINK: 'chainlink' };
  vi.stubGlobal('fetch', vi.fn(async (raw: RequestInfo | URL) => {
    const u = new URL(String(raw)), p = u.pathname;
    if (u.hostname.includes('coingecko')) {
      if (p.endsWith('/search')) return response({ coins: [{ id: 'quant-network', symbol: 'QNT', name: 'Quant', market_cap_rank: 50 }, { id: 'fake-quant', symbol: 'QNT', name: 'Other', market_cap_rank: 500 }] });
      if (p.endsWith('/simple/price')) return response({ [u.searchParams.get('ids')!]: { usd: 100, usd_24h_change: 2, last_updated_at: now / 1000 } });
      if (p.endsWith('/ohlc/range')) { const from = Number(u.searchParams.get('from')) * 1000, to = Number(u.searchParams.get('to')) * 1000; return response(Array.from({ length: 180 }, (_, i) => [Math.floor(to / day) * day - i * day, 100, 102, 98, 100]).filter((a) => a[0] >= from)); }
      if (p.endsWith('/market_chart/range') || p.endsWith('/market_chart')) return response(chart());
      if (p.endsWith('/global/market_cap_chart')) return response({ market_cap_chart: { market_cap: chart().market_caps.map(([t]) => [t, 1e8]) } });
      if (p.endsWith('/tickers')) {
        if (tickersFail) return response({ error: 'fixture unavailable' }, 400);
        const cid = p.split('/').at(-2)!, base = DETAIL_SYMBOL[cid];
        const row = (name: string, identifier: string, coin: string) => ({ base, target: 'USDT', coin_id: coin, market: { name, identifier }, converted_volume: { usd: 1e7 }, bid_ask_spread_percentage: 0.1, trust_score: 'green', is_stale: false, is_anomaly: false, last_traded_at: new Date(now).toISOString(), timestamp: new Date(now).toISOString() });
        return response({ tickers: [row('Coinbase', 'gdax', cid), ...(okxOwner[base] === cid ? [row('OKX', 'okex', cid)] : okxOwner[base] === 'other-coin-row' ? [row('OKX', 'okex', 'some-other-coin')] : [])] });
      }
      const id = p.split('/').at(-1)!;
      if (detailFails.has(id)) return response({ error: 'fixture detail unavailable' }, 400);
      return response({ id, symbol: DETAIL_SYMBOL[id] ?? id, name: id, market_cap_rank: 50, last_updated: new Date(now).toISOString(), market_data: { market_cap: { usd: 1e9 }, current_price: { usd: 100 }, total_volume: { usd: 1e7 }, max_supply: 1e8, circulating_supply: 5e7, total_supply: 1e8, ath: { usd: 120 }, ath_date: { usd: '2024-01-01' }, price_change_percentage_7d: 2, price_change_percentage_30d: 3 } });
    }
    if (u.hostname.includes('okx')) {
      const inst = u.searchParams.get('instId')!;
      if (p.endsWith('/instruments')) return response({ code: '0', data: [{ instId: inst }] });
      if (p.endsWith('/funding-rate')) return response({ code: '0', data: [{ instId: inst, ts: String(now), fundingRate: '.0001', fundingTime: String(now + 3600000), nextFundingTime: String(now + 9 * 3600000) }] });
      if (p.endsWith('/open-interest')) return response({ code: '0', data: [{ instId: inst, ts: String(now), oiUsd: '30000000', oiCcy: '300000' }] });
      if (p.endsWith('/open-interest-history')) return response({ code: '0', data: Array.from({ length: 25 }, (_, i) => [String(now - i * 3600000), '100', '300000', '30000000']) });
      return response({ code: '0', data: [{ instId: inst, ts: String(now), last: '100.1', volCcy24h: '100000' }] });
    }
    if (u.hostname.includes('yahoo')) return response({ chart: { result: [{ meta: { symbol: 'X-USD', regularMarketPrice: 100.05, previousClose: 98 }, indicators: { quote: [{}] } }] } });
    throw Error('Unexpected network request: ' + u.hostname);
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const oiOf = (b: Awaited<ReturnType<typeof loadBreakdown>>) => b.sections.derivatives.value?.metrics.find((m) => m.label === 'Open interest (USD)')?.value ?? null;
const srcBasis = (b: Awaited<ReturnType<typeof loadBreakdown>>, name: string) => b.sections.sourcesCheck.value?.metrics.find((m) => m.label === name);

describe('W2: crypto identity binding', () => {
  it('verified, unambiguous coin with an OKX market on its own ticker list: OKX and Yahoo combined', async () => {
    const b = await loadBreakdown('LINK', undefined, now);
    expect(b.identity).toMatchObject({ coinId: 'chainlink', verified: true, ambiguous: false, okx: { bound: true, instrument: 'LINK-USDT-SWAP' }, yahoo: { bound: true } });
    expect(oiOf(b)).toBe(30000000);
    expect(srcBasis(b, 'OKX')!.value).toBe(100.1);
  });
  it('explicit id with a failed coin-detail request: not verified, nothing ticker-matched is combined, cold and warm', async () => {
    detailFails.add('chainlink');
    for (const pass of ['cold', 'warm']) {
      const b = await loadBreakdown('LINK', 'chainlink', now);
      expect(b.identity!.verified, pass).toBe(false);
      expect(b.identity!.reason).toContain('CoinGecko coin detail unavailable');
      expect(b.sections.derivatives.value, pass).toBeNull();
      expect(b.sections.derivatives.reason).toBe('Not combined: coin identity not verified');
      expect(srcBasis(b, 'OKX')!.value).toBeNull();
      expect(srcBasis(b, 'Yahoo')!.basis).toBe('Not combined: coin identity not verified');
      expect(b.sections.risks.value!.metrics.map((m) => String(m.value)).join(' ')).toContain('OKX not combined');
      // CoinGecko id-keyed sections remain.
      expect(b.sections.price.value!.metrics[0].value).toBe(100);
    }
    // Detail recovers: verified on the next load.
    detailFails.clear();
    expect((await loadBreakdown('LINK', 'chainlink', now)).identity!.verified).toBe(true);
  });
  it('shared ticker resolved by search: ambiguous, OKX and Yahoo not combined', async () => {
    const b = await loadBreakdown('QNT', undefined, now);
    expect(b.identity).toMatchObject({ coinId: 'quant-network', source: 'symbol search', matches: 2, verified: true, ambiguous: true, okx: { bound: false }, yahoo: { bound: false } });
    expect(b.identity!.okx.reason).toContain('2 coins share QNT');
    expect(b.sections.derivatives.value).toBeNull();
  });
  it.each([['quant-network first', ['quant-network', 'fake-quant']], ['fake-quant first', ['fake-quant', 'quant-network']]] as const)(
    'two coins with the same ticker by explicit id, warm %s: OKX data (cached by ticker) attaches only to the listed coin', async (_l, order) => {
      for (const pass of ['cold', 'warm']) for (const id of order) {
        const b = await loadBreakdown('QNT', id, now);
        expect(b.identity!.verified, `${pass} ${id}`).toBe(true);
        if (id === 'quant-network') { expect(b.identity!.okx.bound).toBe(true); expect(oiOf(b)).toBe(30000000); }
        else { expect(b.identity!.okx.bound).toBe(false); expect(b.identity!.okx.reason).toContain('not confirmed for fake-quant'); expect(b.sections.derivatives.value).toBeNull(); expect(srcBasis(b, 'OKX')!.value).toBeNull(); }
      }
    });
  it('ticker list unavailable: OKX listing cannot be confirmed, so it is not combined', async () => {
    tickersFail = true;
    const b = await loadBreakdown('LINK', undefined, now);
    expect(b.identity!.verified).toBe(true);
    expect(b.identity!.okx.bound).toBe(false);
    expect(b.identity!.okx.reason).toContain('CoinGecko tickers unavailable');
    expect(b.sections.derivatives.value).toBeNull();
  });
  it('an OKX row that belongs to another coin id does not bind', async () => {
    okxOwner = { LINK: 'other-coin-row' };
    const b = await loadBreakdown('LINK', undefined, now);
    expect(b.identity!.okx.bound).toBe(false);
  });
  it('an explicit id that is another coin keeps every section unavailable and reports why', async () => {
    const b = await loadBreakdown('LINK', 'wrong-coin', now);
    expect(b.sections.price.reason).toBe('CoinGecko id and symbol do not match');
    expect(b.identity!.verified).toBe(false);
    expect(b.identity!.reason).toBe('CoinGecko id wrong-coin is XYZ, not LINK');
  });
  it('OKX is still queried by ticker (in parallel, cached), but an unbound result is discarded from the response', async () => {
    const b = await loadBreakdown('QNT', 'fake-quant', now);
    expect(okxCalls().length).toBeGreaterThan(0);
    expect(JSON.stringify(b.sections.derivatives)).not.toContain('30000000');
    expect(JSON.stringify(b.sections.sourcesCheck)).not.toContain('100.1');
  });
});
