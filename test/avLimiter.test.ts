import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/redis', () => ({ getRedis: () => null }));

import {
  AV_CEILING_PER_MIN,
  AV_LANES,
  AV_LANE_RESERVE,
  AV_LOCAL_EMERGENCY_PER_MIN,
  avTryTake,
  decideAvTake,
  flushAvFeatureCounts,
  noteAvFeatureCall,
  reservesForCeiling,
} from '@/lib/avLimiter';

describe('shared AV limiter', () => {
  beforeEach(() => {
    flushAvFeatureCounts();
  });

  it('keeps the ceiling at 540 and the lane reserves add up to it', () => {
    expect(AV_CEILING_PER_MIN).toBe(540);
    expect(AV_LANES.reduce((sum, lane) => sum + AV_LANE_RESERVE[lane], 0)).toBe(540);
    const local = reservesForCeiling(AV_LOCAL_EMERGENCY_PER_MIN);
    expect(AV_LANES.reduce((sum, lane) => sum + local[lane], 0)).toBe(AV_LOCAL_EMERGENCY_PER_MIN);
  });

  it('lets a user take a token when a backfill must leave the higher reserves', () => {
    const usedByLane = { user: 0, alerts: 0, scheduled: 0, backfill: 100 };
    expect(decideAvTake({ lane: 'backfill', usedTotal: 100, usedByLane }).allow).toBe(false);
    expect(decideAvTake({ lane: 'user', usedTotal: 100, usedByLane }).allow).toBe(true);
  });

  it('denies every lane once the minute is full', () => {
    const usedByLane = { user: 540, alerts: 0, scheduled: 0, backfill: 0 };
    for (const lane of AV_LANES) {
      expect(decideAvTake({ lane, usedTotal: 540, usedByLane }).allow).toBe(false);
    }
  });

  it('stops the local emergency window at 150 and still prefers user over backfill', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = 20_000_000;
    let backfill = 0;
    for (let i = 0; i < 40; i += 1) {
      if (await avTryTake({ lane: 'backfill', feature: 'backfill-probe' }, t + i)) backfill += 1;
    }
    expect(backfill).toBe(reservesForCeiling(AV_LOCAL_EMERGENCY_PER_MIN).backfill);
    expect(await avTryTake({ lane: 'user', feature: 'user-probe' }, t + 50)).toBe(true);

    const full = 30_000_000;
    let user = 0;
    for (let i = 0; i < 200; i += 1) {
      if (await avTryTake({ lane: 'user', feature: 'user-ceiling' }, full + i)) user += 1;
    }
    expect(user).toBe(AV_LOCAL_EMERGENCY_PER_MIN);
    expect(await avTryTake({ lane: 'user', feature: 'user-ceiling' }, full + 201)).toBe(false);
    warn.mockRestore();
  });

  it('logs a per-feature counter line', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    noteAvFeatureCall('catalyst-study-compute', 1);
    noteAvFeatureCall('catalyst-study-compute', 1);
    noteAvFeatureCall('admin-crypto-scan', 1);
    const lines = flushAvFeatureCounts();
    expect(lines).toContain('[avLimiter] feature=catalyst-study-compute calls=2');
    expect(lines).toContain('[avLimiter] feature=admin-crypto-scan calls=1');
    log.mockRestore();
  });
});
