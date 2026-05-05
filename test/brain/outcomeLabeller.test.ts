/**
 * Phase 10 — Outcome labelling no-look-ahead tests
 *
 * Property covered:
 *   - outcome labels do not use future data (bars at/before as_of_ts ignored)
 *   - bars beyond the horizon window do not contribute to MFE/MAE
 */

import { describe, it, expect } from 'vitest';

vi.mock('@/lib/db', () => ({ q: vi.fn() }));

import { vi } from 'vitest';
import { computeOutcome } from '../../lib/brain/outcomeLabeller';
import type { OutcomeContext, PriceBar } from '../../lib/brain/types';

const HOUR = 3600 * 1000;

function bar(tsMs: number, price: number, range = 0.5): PriceBar {
  return {
    ts: new Date(tsMs),
    open: price,
    high: price + range,
    low: price - range,
    close: price,
    volume: 1000,
  };
}

describe('computeOutcome — no look-ahead', () => {
  const asOf = new Date('2026-04-15T14:00:00Z').getTime();
  const ctx: OutcomeContext = {
    asOfTs: new Date(asOf),
    entryPrice: 100,
    direction: 'long',
    invalidationLevel: 95,
    confirmationLevel: 102,
    rUnit: 5,
  };

  it('ignores bars at or before as_of_ts', () => {
    // Pre-event bars exhibit a HUGE favourable excursion that the labeller
    // must NOT credit. Post-event bars are flat at entry.
    const bars: PriceBar[] = [
      bar(asOf - 30 * 60 * 1000, 200, 50), // 30 min before — must be ignored
      bar(asOf - 5 * 60 * 1000, 250, 50),  // 5 min before — must be ignored
      bar(asOf, 100, 0.1),                  // exactly at as_of_ts — must be ignored
      bar(asOf + 15 * 60 * 1000, 100, 0.1),
      bar(asOf + 45 * 60 * 1000, 100, 0.1),
      bar(asOf + 60 * 60 * 1000, 100, 0.1), // covers full 1h horizon
    ];
    const result = computeOutcome({ horizon: '1h', context: ctx, bars });
    expect(result.outcomeClass).not.toBe('insufficient_data');
    // mfe must reflect ONLY post-as_of bars (range=0.1 → max ~0.1% favourable)
    expect(result.mfePct ?? 0).toBeLessThan(1);
    expect(result.barsConsumed).toBeGreaterThan(0);
  });

  it('returns insufficient_data when all bars are at/before as_of_ts', () => {
    const bars: PriceBar[] = [
      bar(asOf - 60_000, 100),
      bar(asOf, 100),
    ];
    const result = computeOutcome({ horizon: '1h', context: ctx, bars });
    expect(result.outcomeClass).toBe('insufficient_data');
    expect(result.barsConsumed).toBe(0);
  });

  it('does not consume bars beyond the horizon end', () => {
    // Within horizon: flat at entry. Beyond horizon: huge favourable bar
    // that must NOT be credited to a 1h-horizon label.
    const bars: PriceBar[] = [
      bar(asOf + 15 * 60_000, 100, 0.1),
      bar(asOf + 45 * 60_000, 100, 0.1),
      bar(asOf + 1 * HOUR + 60_000, 200, 50), // beyond 1h horizon
      bar(asOf + 2 * HOUR, 250, 50),
    ];
    const result = computeOutcome({ horizon: '1h', context: ctx, bars });
    expect(result.mfePct ?? 0).toBeLessThan(1);
    expect(result.dataThroughTs.getTime()).toBeLessThanOrEqual(asOf + HOUR + 60_000);
  });
});
