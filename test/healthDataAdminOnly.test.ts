/**
 * GET /api/health/data is admin-only.
 * Denial is decided by requireAdmin before any cache read, and the body
 * is only { error: 'Unauthorized' }.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getSessionFromCookie } from '@/lib/auth';
import { getCached } from '@/lib/redis';

const h = vi.hoisted(() => ({
  admin: { ok: false } as { ok: boolean },
  session: null as null | { cid: string; workspaceId: string; tier: string },
}));

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(async () => h.admin),
}));

vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: vi.fn(async () => h.session),
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

vi.mock('@/lib/circuitBreaker', () => ({
  avCircuit: { getSnapshot: () => ({ name: 'alpha-vantage', state: 'CLOSED', failureThreshold: 5, resetTimeoutMs: 60_000 }) },
  coinGeckoCircuit: { getSnapshot: () => ({ name: 'coingecko', state: 'CLOSED', failureThreshold: 5, resetTimeoutMs: 45_000 }) },
  openAICircuit: { getSnapshot: () => ({ name: 'openai', state: 'OPEN', failureThreshold: 3, resetTimeoutMs: 30_000 }) },
}));

import { GET } from '../app/api/health/data/route';

const requireAdminMock = vi.mocked(requireAdmin);
const getSessionMock = vi.mocked(getSessionFromCookie);
const getCachedMock = vi.mocked(getCached);

const LEAKED = [
  'circuits',
  'details',
  'failureThreshold',
  'resetTimeoutMs',
  'alpha-vantage',
  'coingecko',
  'openai',
  '7200',
  'quote:',
  'populatedCount',
  'checkedCount',
  'stale',
];

function request() {
  return new NextRequest('http://localhost/api/health/data');
}

describe('GET /api/health/data', () => {
  beforeEach(() => {
    h.admin = { ok: false };
    h.session = null;
    requireAdminMock.mockClear();
    getSessionMock.mockClear();
    getCachedMock.mockReset();
    getCachedMock.mockResolvedValue(null);
  });

  it('returns 200 with provider health for an admin', async () => {
    h.admin = { ok: true };
    getCachedMock.mockImplementation(async (key: string) => {
      if (key === 'quote:SPY') return { _ts: Date.now() - 10_000 };
      return null;
    });

    const res = await GET(request());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(requireAdminMock).toHaveBeenCalledOnce();
    expect(body.ok).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.populatedCount).toBe(1);
    expect(body.checkedCount).toBe(7);
    expect(body.circuits.alphaVantage).toMatchObject({ name: 'alpha-vantage', failureThreshold: 5 });
    expect(body.circuits.coinGecko.name).toBe('coingecko');
    expect(body.circuits.openAI.name).toBe('openai');
    expect(getCachedMock).toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns 403 for a signed-in non-admin without provider health or cache reads', async () => {
    h.session = { cid: 'cus_regular', workspaceId: 'workspace-regular', tier: 'pro' };

    const res = await GET(request());
    const body = await res.json();
    const text = JSON.stringify(body);

    expect(res.status).toBe(403);
    expect(body).toEqual({ error: 'Unauthorized' });
    for (const token of LEAKED) expect(text).not.toContain(token);
    expect(getCachedMock).not.toHaveBeenCalled();
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('returns 401 for a signed-out caller without provider health or cache reads', async () => {
    const res = await GET(request());
    const body = await res.json();
    const text = JSON.stringify(body);

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    for (const token of LEAKED) expect(text).not.toContain(token);
    expect(getCachedMock).not.toHaveBeenCalled();
    expect(getSessionMock).toHaveBeenCalled();
  });
});
