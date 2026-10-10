/**
 * GET /api/health/stale is the public flag. The body is only { stale: boolean }.
 * A second call inside 60s must not read Redis again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCached } from '@/lib/redis';

const h = vi.hoisted(() => ({
  now: Date.parse('2026-10-10T00:00:00.000Z'),
}));

vi.mock('@/lib/redis', () => ({
  getCached: vi.fn(async () => null),
  CACHE_KEYS: {
    quote: (symbol: string) => `quote:${symbol}`,
    bars: (symbol: string, timeframe: string) => `bars:${symbol}:${timeframe}`,
    indicators: (symbol: string, timeframe: string) => `ind:${symbol}:${timeframe}`,
    scannerResult: (name: string, universe: string) => `scan:${name}:${universe}`,
    marketStatus: () => 'market:status',
    fearGreed: () => 'market:feargreed',
  },
}));

import { GET, clearPublicStaleCache } from '../app/api/health/stale/route';

const getCachedMock = vi.mocked(getCached);

function age(ms: number) {
  return { _ts: h.now - ms };
}

describe('GET /api/health/stale', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    h.now = Date.parse('2026-10-10T00:00:00.000Z');
    vi.spyOn(Date, 'now').mockImplementation(() => h.now);
    clearPublicStaleCache();
    getCachedMock.mockReset();
    getCachedMock.mockResolvedValue(null);
  });

  it('returns a body with exactly one boolean key and does not read Redis again within 60s', async () => {
    getCachedMock.mockResolvedValue(age(3 * 60 * 60 * 1000));

    const first = await GET();
    const firstBody = await first.json();
    const readsAfterFirst = getCachedMock.mock.calls.length;

    expect(first.status).toBe(200);
    expect(Object.keys(firstBody)).toEqual(['stale']);
    expect(firstBody).toEqual({ stale: true });
    expect(typeof firstBody.stale).toBe('boolean');
    expect(JSON.stringify(firstBody)).not.toMatch(/alpha|coingecko|openai|threshold|7200|quote:|checkedAt|timestamp|details|circuits/i);
    expect(readsAfterFirst).toBeGreaterThan(0);
    expect(first.headers.get('cache-control')).toBe('public, max-age=60');

    h.now += 59_000;
    const second = await GET();
    const secondBody = await second.json();

    expect(secondBody).toEqual({ stale: true });
    expect(Object.keys(secondBody)).toEqual(['stale']);
    expect(getCachedMock.mock.calls.length).toBe(readsAfterFirst);

    h.now += 2_000;
    getCachedMock.mockResolvedValue(age(1_000));
    const third = await GET();
    expect(await third.json()).toEqual({ stale: false });
    expect(getCachedMock.mock.calls.length).toBe(readsAfterFirst * 2);
  });

  it('fails soft to { stale: false } when the freshness read throws, still one boolean key', async () => {
    getCachedMock.mockRejectedValue(new Error('redis down'));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ stale: false });
    expect(Object.keys(body)).toEqual(['stale']);
    expect(typeof body.stale).toBe('boolean');

    const reads = getCachedMock.mock.calls.length;
    h.now += 1_000;
    const again = await GET();
    expect(await again.json()).toEqual({ stale: false });
    expect(getCachedMock.mock.calls.length).toBe(reads);
  });
});
