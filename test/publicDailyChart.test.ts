import { describe, expect, it } from 'vitest';
import { PUBLIC_DAILY_CHART_LIMIT, publicDailyChart } from '@/lib/research/publicDailyChart';

const now = Date.parse('2026-10-10T04:00:00Z');
const source = 'alpha_vantage TIME_SERIES_DAILY_ADJUSTED (O/H/L/C split-adjusted via coefficients)';

describe('public daily chart bars', () => {
  it('keeps the completed Friday bar and drops the unfinished Saturday bar', () => {
    const dates = ['2026-10-08', '2026-10-09', '2026-10-10'];
    const chart = publicDailyChart({
      assetClass: 'equity', timeframeKey: 'daily', source, nowMs: now,
      dates, closes: [100, 101, 102], highs: [104, 105, 106], lows: [99, 100, 101],
    });
    expect(chart?.bars.map((b) => b.t)).toEqual(['2026-10-08', '2026-10-09']);
    expect(chart?.basis).toBe(source);
    expect(chart?.bars.at(-1)).toMatchObject({ t: '2026-10-09', c: 101, h: 105, l: 100 });
  });

  it('returns the last 140 completed bars and nothing when dates are missing', () => {
    const dates = Array.from({ length: 180 }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
    const chart = publicDailyChart({
      assetClass: 'equity', timeframeKey: 'daily', source, nowMs: now,
      dates, closes: dates.map((_, i) => 50 + i), highs: dates.map((_, i) => 51 + i), lows: dates.map((_, i) => 49 + i),
    });
    expect(chart?.bars).toHaveLength(PUBLIC_DAILY_CHART_LIMIT);
    expect(chart?.bars.at(-1)?.t).toBe(dates.at(-1));
    expect(publicDailyChart({ assetClass: 'equity', timeframeKey: 'daily', nowMs: now, closes: [1, 2] })).toBeNull();
    expect(publicDailyChart({ assetClass: 'forex', timeframeKey: 'daily', nowMs: now, dates, closes: dates.map(() => 1) })).toBeNull();
  });
});
