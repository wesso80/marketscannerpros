import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({
  getCached: async () => null,
  getCachedMulti: async (keys: string[]) => keys.map(() => null),
  setCached: async () => false,
}));

import { clearSharedMemory, readShared, SHARED_MEMORY_MAX_ENTRIES, writeShared } from '@/lib/cache/sharedResponse';

describe('in-memory shared cache cap', () => {
  beforeEach(() => {
    clearSharedMemory();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
  });

  afterEach(() => {
    clearSharedMemory();
    vi.useRealTimers();
  });

  it('keeps about 500 entries and evicts the oldest first', async () => {
    for (let i = 0; i < SHARED_MEMORY_MAX_ENTRIES; i++) {
      await writeShared(`news:${i}`, i, 60);
    }
    expect(await readShared('news:0')).toBe(0);
    await writeShared('news:newest', 'newest', 60);
    expect(await readShared('news:0')).toBeNull();
    expect(await readShared('news:1')).toBe(1);
    expect(await readShared('news:newest')).toBe('newest');
    expect(await readShared(`news:${SHARED_MEMORY_MAX_ENTRIES - 1}`)).toBe(SHARED_MEMORY_MAX_ENTRIES - 1);
  });

  it('drops expired entries on write before evicting a live one', async () => {
    await writeShared('live-oldest', 'keep', 120);
    await writeShared('stale', 'stale', 30);
    for (let i = 0; i < SHARED_MEMORY_MAX_ENTRIES - 2; i++) {
      await writeShared(`pad:${i}`, i, 120);
    }
    vi.setSystemTime(new Date('2026-10-06T00:00:31Z'));
    await writeShared('newest', 'newest', 120);
    expect(await readShared('live-oldest')).toBe('keep');
    expect(await readShared('stale')).toBeNull();
    expect(await readShared('newest')).toBe('newest');
  });
});
