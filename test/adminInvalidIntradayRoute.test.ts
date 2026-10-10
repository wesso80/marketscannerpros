import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const redis = vi.hoisted(() => {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    del: vi.fn(async (key: string) => { store.delete(key); return 1; }),
    scan: vi.fn(async (_cursor: number | string, opts: { match: string }) => {
      const prefix = opts.match.replace(/\*$/, '');
      return ['0', [...store.keys()].filter((key) => key.startsWith(prefix))] as [string, string[]];
    }),
  };
});

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn() }));
vi.mock('@/lib/redis', () => ({ getRedis: () => redis }));

import { requireAdmin } from '@/lib/adminAuth';
import { DELETE } from '@/app/api/admin/invalid-intraday/route';
import { resetInvalidIntradayCacheForTests } from '@/lib/worker/invalidIntraday';

const requireAdminMock = vi.mocked(requireAdmin);

function call(qs: string) {
  return DELETE(new NextRequest(`http://localhost/api/admin/invalid-intraday${qs}`));
}

beforeEach(() => {
  redis.store.clear();
  resetInvalidIntradayCacheForTests();
  requireAdminMock.mockReset();
});

describe('DELETE /api/admin/invalid-intraday', () => {
  it('rejects a caller who is not an admin', async () => {
    requireAdminMock.mockResolvedValue({ ok: false } as never);
    redis.store.set('av:invalid-intraday:GTBIF', '1');
    const res = await call('?symbol=GTBIF');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ ok: false, error: 'Unauthorized' });
    expect(redis.store.has('av:invalid-intraday:GTBIF')).toBe(true);
  });

  it('requires a symbol or all=1', async () => {
    requireAdminMock.mockResolvedValue({ ok: true, workspaceId: 'ws' } as never);
    const res = await call('');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: 'symbol or all=1 required' });
  });

  it('deletes one symbol key', async () => {
    requireAdminMock.mockResolvedValue({ ok: true, workspaceId: 'ws' } as never);
    redis.store.set('av:invalid-intraday:GTBIF', '1');
    redis.store.set('av:invalid-intraday:NVDA', '1');
    const res = await call('?symbol=gtbif');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, cleared: ['av:invalid-intraday:GTBIF'] });
    expect(redis.store.has('av:invalid-intraday:GTBIF')).toBe(false);
    expect(redis.store.has('av:invalid-intraday:NVDA')).toBe(true);
  });

  it('deletes every av:invalid-intraday key', async () => {
    requireAdminMock.mockResolvedValue({ ok: true, workspaceId: 'ws' } as never);
    redis.store.set('av:invalid-intraday:GTBIF', '1');
    redis.store.set('av:invalid-intraday:NVDA', '1');
    redis.store.set('cg:crypto-daily:v1:bitcoin:1', 'keep');
    const res = await call('?all=1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cleared.sort()).toEqual(['av:invalid-intraday:GTBIF', 'av:invalid-intraday:NVDA']);
    expect([...redis.store.keys()]).toEqual(['cg:crypto-daily:v1:bitcoin:1']);
  });
});
