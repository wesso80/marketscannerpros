import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  set: vi.fn(async () => 'OK'),
  del: vi.fn(async () => 1),
  mget: vi.fn(async () => []),
  get: vi.fn(async () => null),
}));

vi.mock('@/lib/redis', () => ({ getRedis: () => redis }));
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));

import { q } from '@/lib/db';
import { clearAlertPriceNoticeCacheForTests, readAlertPriceNotices, writeAlertPriceStatus } from '@/lib/alerts/priceNotice';
import { PRICE_UNAVAILABLE } from '@/lib/alerts/cryptoPriceBatch';

describe('alert price notices', () => {
  beforeEach(() => {
    clearAlertPriceNoticeCacheForTests();
    redis.set.mockClear();
    redis.del.mockClear();
    vi.mocked(q).mockClear();
  });

  it('writes Redis only when the status changes, and drops an expired memory notice', async () => {
    const now = 5_000_000;
    await writeAlertPriceStatus([{ id: 'a', unavailable: true }], now);
    await writeAlertPriceStatus([{ id: 'a', unavailable: true }], now + 1_000);
    expect(redis.set).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith('alert:price_notice:a', PRICE_UNAVAILABLE, { ex: 24 * 60 * 60 });
    expect(await readAlertPriceNotices(['a'], now + 1_000)).toEqual({ a: PRICE_UNAVAILABLE });

    await writeAlertPriceStatus([{ id: 'a', unavailable: false }], now + 2_000);
    expect(redis.del).toHaveBeenCalledWith('alert:price_notice:a');
    expect(await readAlertPriceNotices(['a'], now + 2_000)).toEqual({});

    await writeAlertPriceStatus([{ id: 'a', unavailable: true }], now + 3_000);
    const writes = redis.set.mock.calls.length;
    const day = 24 * 60 * 60 * 1000;
    expect(await readAlertPriceNotices(['a'], now + 3_000 + day)).toEqual({});
    await writeAlertPriceStatus([{ id: 'a', unavailable: true }], now + 3_000 + day);
    expect(redis.set.mock.calls.length).toBe(writes + 1);
  });
});
