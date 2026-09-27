import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
import { computeWindow, pickForwardBars, type BarLite } from '@/lib/edge/outcomeLabeller';

const bar = (date: string, high = 110, low = 95, close = 105): BarLite => ({ ts: Date.parse(date + 'T00:00:00Z'), high, low, close });

describe('forward outcome integrity', () => {
  it('calculates short favourable and adverse excursions with the correct sign', () => {
    const result = computeWindow([bar('2026-09-23', 105, 90, 95)], 1, 100, 10, 90, 110, 'short');
    expect(result.mfe).toBe(1);
    expect(result.mae).toBe(-0.5);
    expect(result.realised).toBe(0.5);
    expect(result.hitT).toBe(true);
    expect(result.hitS).toBe(false);
  });

  it('withholds a five-bar return until the fifth completed bar exists', () => {
    const bars = Array.from({ length: 5 }, (_, i) => bar(`2026-09-${23 + i}`));
    expect(computeWindow(bars.slice(0, 4), 5, 100, 10, 110, 90, 'long')).toMatchObject({ realised: null, status: 'partial' });
    expect(computeWindow(bars, 5, 100, 10, 110, 90, 'long')).toMatchObject({ realised: 0.5, status: 'complete' });
    expect(computeWindow(bars, 20, 100, 10, 110, 90, 'long').realised).toBeNull();
  });

  it('excludes same-day and forming crypto candles and deduplicates dates', () => {
    const result = pickForwardBars([bar('2026-09-25'), bar('2026-09-24'), bar('2026-09-23'), bar('2026-09-22'), bar('2026-09-24')],
      Date.parse('2026-09-22T12:00:00Z'), 'crypto', Date.parse('2026-09-25T12:00:00Z'));
    expect(result.map(b => new Date(b.ts).getUTCDate())).toEqual([23, 24]);
  });

  it('stops at a missing forward day instead of moving the horizon', () => {
    const result = pickForwardBars([bar('2026-09-23'), bar('2026-09-25')], Date.parse('2026-09-22T12:00:00Z'), 'crypto', Date.parse('2026-09-27T12:00:00Z'));
    expect(result).toHaveLength(1);
  });

  it('uses US trading sessions and waits for the equity session close', () => {
    const bars = [bar('2026-09-25'), bar('2026-09-26'), bar('2026-09-28'), bar('2026-09-29')];
    const since = Date.parse('2026-09-25T21:00:00Z');
    expect(pickForwardBars(bars, since, 'equity', Date.parse('2026-09-28T18:00:00Z'))).toEqual([]);
    expect(pickForwardBars(bars, since, 'equity', Date.parse('2026-09-28T21:00:00Z')).map(b => new Date(b.ts).getUTCDate())).toEqual([28]);
  });
});
