/**
 * Unit tests for the shared signal deduplication bucket logic.
 *
 * The bucket is one component of the unique index idx_signals_dedup, so both
 * signal-recording paths (signalService + signalRecorder) must agree on it.
 * These tests pin the timeframe → bucket-truncation behaviour.
 *
 * Run: npx vitest run test/signalBucket.test.ts
 */
import { describe, it, expect } from 'vitest';
import { computeSignalBucket } from '../lib/signals/signalBucket';

describe('computeSignalBucket', () => {
  it('buckets 15m signals to the nearest lower 15-minute boundary', () => {
    const a = computeSignalBucket(new Date('2026-08-28T10:07:42.500Z'), '15m');
    const b = computeSignalBucket(new Date('2026-08-28T10:14:59.999Z'), '15m');
    // Both fall in the 10:00–10:15 bucket → identical dedup key
    expect(a.getTime()).toBe(b.getTime());
    expect(a.getMinutes() % 15).toBe(0);
    expect(a.getSeconds()).toBe(0);
    expect(a.getMilliseconds()).toBe(0);
  });

  it('separates 15m signals that cross a 15-minute boundary', () => {
    const a = computeSignalBucket(new Date('2026-08-28T10:14:59.000Z'), '15m');
    const b = computeSignalBucket(new Date('2026-08-28T10:15:00.000Z'), '15m');
    expect(a.getTime()).not.toBe(b.getTime());
  });

  it('buckets 1h signals to the hour', () => {
    const bucket = computeSignalBucket(new Date('2026-08-28T10:59:59.000Z'), '1h');
    expect(bucket.getMinutes()).toBe(0);
    expect(bucket.getSeconds()).toBe(0);
    expect(bucket.getMilliseconds()).toBe(0);
  });

  it('buckets 4h signals to the nearest lower 4-hour boundary', () => {
    const bucket = computeSignalBucket(new Date('2026-08-28T13:45:00.000Z'), '4h');
    expect(bucket.getHours() % 4).toBe(0);
    expect(bucket.getMinutes()).toBe(0);
  });

  it('buckets daily signals to midnight local time', () => {
    const bucket = computeSignalBucket(new Date('2026-08-28T18:30:00.000Z'), 'daily');
    expect(bucket.getHours()).toBe(0);
    expect(bucket.getMinutes()).toBe(0);
    expect(bucket.getSeconds()).toBe(0);
    expect(bucket.getMilliseconds()).toBe(0);
  });

  it('defaults unknown timeframes to hourly bucketing', () => {
    const bucket = computeSignalBucket(new Date('2026-08-28T10:42:00.000Z'), 'weekly-ish');
    expect(bucket.getMinutes()).toBe(0);
    expect(bucket.getSeconds()).toBe(0);
  });

  it('is deterministic and does not mutate the input date', () => {
    const input = new Date('2026-08-28T10:07:42.500Z');
    const snapshot = input.getTime();
    computeSignalBucket(input, '15m');
    expect(input.getTime()).toBe(snapshot);
  });
});
