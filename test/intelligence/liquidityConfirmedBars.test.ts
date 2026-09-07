import { describe, it, expect } from 'vitest';
import {
  isoDay, isoMonth,
  confirmedDailyBars, monthlyClosesFromDaily,
  rocFromCloses, dailyRocFromConfirmed, monthlyRoc1FromDaily,
  buildConfirmedAssetPack,
  type DailyBar,
} from '@/lib/intelligence/data/liquidityConfirmedBars';

/** Build a synthetic daily series: `${startDay}` for `count` calendar days ascending. */
function makeSeries(startDay: string, count: number, closeFn: (i: number) => number): DailyBar[] {
  const out: DailyBar[] = [];
  const start = Date.parse(startDay + 'T00:00:00Z');
  for (let i = 0; i < count; i++) {
    const d = new Date(start + i * 86400000).toISOString().slice(0, 10);
    out.push({ date: d, close: closeFn(i) });
  }
  return out;
}

describe('liquidityConfirmedBars — day/month utilities', () => {
  it('isoDay / isoMonth extract UTC calendar', () => {
    expect(isoDay('2026-09-07T15:30:00Z')).toBe('2026-09-07');
    expect(isoMonth('2026-09-07T15:30:00Z')).toBe('2026-09');
  });

  it('confirmedDailyBars drops today and non-finite closes, sorts asc', () => {
    const today = '2026-09-07';
    const bars: DailyBar[] = [
      { date: '2026-09-05', close: 100 },
      { date: today, close: 101 },            // still forming — drop
      { date: '2026-09-04', close: 99 },
      { date: '2026-09-06', close: 102 },
      { date: '2026-09-03', close: NaN },     // bad — drop
    ];
    const out = confirmedDailyBars(bars, today);
    expect(out.map((b) => b.date)).toEqual(['2026-09-04', '2026-09-05', '2026-09-06']);
    expect(out.every((b) => b.date < today)).toBe(true);
  });

  it('monthlyClosesFromDaily keeps last-of-month close, drops current month', () => {
    const bars: DailyBar[] = [
      { date: '2026-07-01', close: 10 }, { date: '2026-07-31', close: 12 },
      { date: '2026-08-01', close: 12 }, { date: '2026-08-15', close: 14 }, { date: '2026-08-29', close: 16 },
      { date: '2026-09-01', close: 16 }, { date: '2026-09-05', close: 18 },
    ];
    const months = monthlyClosesFromDaily(bars, '2026-09');
    expect(months).toEqual([{ month: '2026-07', close: 12 }, { month: '2026-08', close: 16 }]);
  });
});

describe('liquidityConfirmedBars — ROC parity with Pine ta.roc', () => {
  it('rocFromCloses = 100*(last/last-n - 1)', () => {
    expect(rocFromCloses([100, 110], 1)).toBeCloseTo(10, 10);
    expect(rocFromCloses([100, 90], 1)).toBeCloseTo(-10, 10);
    expect(rocFromCloses([100, 105, 110, 121], 3)).toBeCloseTo(21, 10);
  });

  it('rocFromCloses returns null on insufficient data or zero denominator', () => {
    expect(rocFromCloses([100], 1)).toBeNull();
    expect(rocFromCloses([], 5)).toBeNull();
    expect(rocFromCloses([0, 5], 1)).toBeNull();       // zero denominator
    expect(rocFromCloses([100, NaN], 1)).toBeNull();
  });

  it('dailyRocFromConfirmed / monthlyRoc1FromDaily wrap rocFromCloses', () => {
    const bars = makeSeries('2026-01-01', 30, (i) => 100 + i);   // 100..129
    const confirmed = confirmedDailyBars(bars, '2026-09-07');
    // 20-day ROC on last confirmed bar: (129 / 109 - 1)*100 = 18.348623...
    expect(dailyRocFromConfirmed(confirmed, 20)).toBeCloseTo(100 * (129 / 109 - 1), 10);
    // monthly ROC1: Jan close is 129 (last of Jan), no prior month → null.
    expect(monthlyRoc1FromDaily(confirmed, '2026-09')).toBeNull();
  });

  it('buildConfirmedAssetPack computes m1/r20/r5 on a stable as-of', () => {
    const bars: DailyBar[] = [];
    // Aug: 20 daily bars 100..119
    for (let i = 0; i < 20; i++) bars.push({ date: `2026-08-${String(i + 1).padStart(2, '0')}`, close: 100 + i });
    // Sep: 30 daily bars 120..149 (up to 2026-09-30)
    for (let i = 0; i < 30; i++) bars.push({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, close: 120 + i });
    // Oct: 6 daily bars 150..155
    for (let i = 0; i < 6; i++) bars.push({ date: `2026-10-0${i + 1}`, close: 150 + i });
    const pack = buildConfirmedAssetPack(bars, '2026-10-07T12:00:00Z');
    // Last confirmed daily is 2026-10-06 close=155.
    expect(pack.latestDaily).toBe('2026-10-06');
    // r5 = (155 / 150 - 1)*100 (last five confirmed bars: 150,151,152,153,154,155)
    expect(pack.r5).toBeCloseTo(100 * (155 / 150 - 1), 10);
    // Sep completed = 149, Aug completed = 119. m1 = (149/119 - 1)*100
    expect(pack.latestMonthly).toBe('2026-09');
    expect(pack.m1).toBeCloseTo(100 * (149 / 119 - 1), 10);
    // r20 = (155 / bar-20-back - 1)*100. Confirmed bars end at 2026-10-06 index N-1;
    // 20 bars back within the confirmed series is 2026-09-16 close=135.
    expect(pack.r20).toBeCloseTo(100 * (155 / 135 - 1), 10);
  });

  it('buildConfirmedAssetPack degrades gracefully on empty/insufficient data', () => {
    expect(buildConfirmedAssetPack([], '2026-10-07T00:00:00Z'))
      .toEqual({ m1: null, r20: null, r5: null, latestDaily: null, latestMonthly: null, dailyCount: 0, monthlyCount: 0 });
    // 3 bars — enough for none of the ROCs.
    const short = makeSeries('2026-09-01', 3, (i) => 100 + i);
    const pack = buildConfirmedAssetPack(short, '2026-10-07T00:00:00Z');
    expect(pack.r5).toBeNull();
    expect(pack.r20).toBeNull();
    // Sep is a completed month by 2026-10 — one month close, ROC1 still null.
    expect(pack.m1).toBeNull();
    expect(pack.monthlyCount).toBe(1);
  });

  it('buildConfirmedAssetPack drops today (still forming) even if provided', () => {
    const bars = makeSeries('2026-09-01', 40, (i) => 200 + i);
    const packA = buildConfirmedAssetPack(bars, '2026-10-11T15:00:00Z');
    // Simulate a provider having already emitted today's forming bar too.
    const barsWithToday: DailyBar[] = [...bars, { date: '2026-10-10', close: 999 }];
    const packB = buildConfirmedAssetPack(barsWithToday, '2026-10-10T15:00:00Z');
    // packA's confirmed universe: 2026-09-01..2026-10-10. packB's: same range
    // minus today (2026-10-10). Their r5/r20 must NOT both agree with 999.
    expect(packB.latestDaily).not.toBe('2026-10-10');
    expect(packB.r5).not.toBeCloseTo(100 * (999 / packA.r5! - 1), 1);
  });
});
