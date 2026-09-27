/**
 * 6-week / 12-week horizon maths (lib/outcomes/positionHorizon.ts, migration 105): pending until the horizon bar
 * closes, stop-first vs target-first, gaps, same-day ambiguity, long/short mirror symmetry, data guards.
 */
import { describe, expect, it } from 'vitest';
import {
  POSITION_HORIZON_DAYS,
  equityDailyToOhlcBars,
  measurePositionHorizon,
  mergeDailyBars,
  parseAvCryptoDailyOhlc,
  validLevels,
  type DailyOhlcBar,
  type PositionHorizonInput,
  type PositionHorizonMeasured,
} from '@/lib/outcomes/positionHorizon';

const DAY = 86_400_000;
const D0 = Date.parse('2026-01-05T00:00:00Z');
const dayStr = (i: number) => new Date(D0 + i * DAY).toISOString().slice(0, 10);

/** Crypto-style UTC daily bars from day `start`; each entry [open, high, low, close]. */
function bars(ohlc: [number, number, number, number][], start = 0): DailyOhlcBar[] {
  return ohlc.map(([open, high, low, close], i) => ({
    day: dayStr(start + i), openTime: D0 + (start + i) * DAY, closeTime: D0 + (start + i + 1) * DAY, open, high, low, close,
  }));
}
/** n flat bars around `p` (range ±0.5). */
const flat = (n: number, p = 100): [number, number, number, number][] => Array.from({ length: n }, () => [p, p + 0.5, p - 0.5, p]);

/** Price mirror around 100 (for the short-side twin of a long scenario). */
const mirrorBar = (b: DailyOhlcBar): DailyOhlcBar => ({ ...b, open: 200 - b.open, high: 200 - b.low, low: 200 - b.high, close: 200 - b.close });

const NOW_AFTER_12W = D0 + 100 * DAY;

function long(over: Partial<PositionHorizonInput> & { bars: DailyOhlcBar[] }): PositionHorizonInput {
  return { direction: 'LONG', entry: 100, signalAtMs: D0, stop: 95, target: 110, nowMs: NOW_AFTER_12W, horizon: '6w', ...over };
}
function shortTwin(i: PositionHorizonInput): PositionHorizonInput {
  return {
    ...i, direction: 'SHORT', entry: 200 - i.entry,
    stop: i.stop === null ? null : 200 - i.stop, target: i.target === null ? null : 200 - i.target,
    bars: i.bars.map(mirrorBar),
  };
}
const measured = (r: ReturnType<typeof measurePositionHorizon>) => {
  expect(r.status).toBe('measured');
  return r as PositionHorizonMeasured;
};

describe('position horizons: calendar days, pending until the horizon bar has closed', () => {
  it('uses 42 / 84 calendar days', () => {
    expect(POSITION_HORIZON_DAYS).toEqual({ '6w': 42, '12w': 84 });
  });

  it('is pending before the horizon, and pending while the horizon bar is missing or still forming', () => {
    const series = bars([[100, 100.5, 99.5, 100], ...flat(90)], -1); // one bar before the call, then 90 days
    expect(measurePositionHorizon(long({ bars: series, nowMs: D0 + 41 * DAY }))).toEqual({ status: 'pending', reason: 'horizon not reached' });
    // Horizon passed (42 d) but the bars stop at day 30: pending.
    const short = bars([[100, 100.5, 99.5, 100], ...flat(31)], -1);
    expect(measurePositionHorizon(long({ bars: short, nowMs: D0 + 43 * DAY })).status).toBe('pending');
    // The exit bar (day 41, closes at D0 + 42 d) exists but "now" is before its close: still pending.
    expect(measurePositionHorizon(long({ bars: series, nowMs: D0 + 42 * DAY - 1 })).status).toBe('pending');
    // 30 days past the horizon and still no exit bar: given up as no_data.
    expect(measurePositionHorizon(long({ bars: short, nowMs: D0 + 72 * DAY }))).toMatchObject({ status: 'no_data' });
  });

  it('6w exits on the bar closing at signal + 42 d (42 crypto bars); 12w on signal + 84 d (84 bars)', () => {
    const series = bars([[100, 100.5, 99.5, 100], ...flat(99)], -1);
    const six = measured(measurePositionHorizon(long({ bars: series })));
    expect(six.bars).toBe(42);
    expect(six.exitAt).toBe(D0 + 42 * DAY);
    const twelve = measured(measurePositionHorizon(long({ bars: series, horizon: '12w' })));
    expect(twelve.bars).toBe(84);
    expect(twelve.exitAt).toBe(D0 + 84 * DAY);
    expect(twelve).toMatchObject({ firstHit: 'neither', outcome: 'neutral', pctMove: 0, rMultiple: 0 });
  });
});

describe('stop first vs target first (long, with the mirrored short)', () => {
  const pre: [number, number, number, number] = [100, 100.5, 99.5, 100];

  it('target first: +2R, dated the day it was touched; the close result is separate', () => {
    const series = bars([pre, ...flat(3), [101, 110.5, 100.8, 109], ...flat(37, 104), ...flat(60, 104)], -1);
    const r = measured(measurePositionHorizon(long({ bars: series })));
    expect(r).toMatchObject({ firstHit: 'target', firstHitDay: dayStr(3), rMultiple: 2, outcome: 'correct', pctMove: 4 });
    expect(r.maxPrice).toBe(110.5);
    expect(r.mfePct).toBe(10.5);
    expect(r.maePct).toBe(-0.5);
  });

  it('stop first: -1R even though price later reaches the target and closes up', () => {
    const series = bars([pre, [100, 100.4, 99, 99.5], [99.5, 99.8, 94.5, 96], ...flat(10, 101), [104, 111, 103, 110], ...flat(90, 108)], -1);
    const r = measured(measurePositionHorizon(long({ bars: series })));
    expect(r).toMatchObject({ firstHit: 'stop', firstHitDay: dayStr(1), rMultiple: -1, outcome: 'correct', pctMove: 8 });
    expect(r.minPrice).toBe(94.5);
    expect(r.maePct).toBe(-5.5);
  });

  it('a day touching both is both_same_day and counted as the stop (-1R)', () => {
    const series = bars([pre, [100, 111, 94, 100], ...flat(99)], -1);
    expect(measured(measurePositionHorizon(long({ bars: series })))).toMatchObject({ firstHit: 'both_same_day', firstHitDay: dayStr(0), rMultiple: -1 });
  });

  it('a gap through the stop fills at the open (worse than -1R); a gap through the target fills at the open', () => {
    const gapDown = bars([pre, ...flat(2), [90, 91, 88, 89], ...flat(97, 92)], -1);
    expect(measured(measurePositionHorizon(long({ bars: gapDown })))).toMatchObject({ firstHit: 'stop', rMultiple: -2 });
    const gapUp = bars([pre, ...flat(2), [112, 113, 111, 112], ...flat(97, 112)], -1);
    expect(measured(measurePositionHorizon(long({ bars: gapUp })))).toMatchObject({ firstHit: 'target', rMultiple: 2.4 });
  });

  it('neither hit: R is the close at the horizon', () => {
    const series = bars([pre, ...flat(20, 102), ...flat(80, 103)], -1);
    expect(measured(measurePositionHorizon(long({ bars: series })))).toMatchObject({ firstHit: 'neither', rMultiple: 0.6, pctMove: 3, outcome: 'correct' });
  });

  it('shorts are the exact mirror: same first hit, date, R, excursions and verdict; raw move flips sign', () => {
    const scenarios: DailyOhlcBar[][] = [
      bars([pre, ...flat(3), [101, 110.5, 100.8, 109], ...flat(97, 104)], -1),
      bars([pre, [100, 100.4, 99, 99.5], [99.5, 99.8, 94.5, 96], ...flat(10, 101), [104, 111, 103, 110], ...flat(90, 108)], -1),
      bars([pre, [100, 111, 94, 100], ...flat(99)], -1),
      bars([pre, ...flat(2), [90, 91, 88, 89], ...flat(97, 92)], -1),
      bars([pre, ...flat(20, 102), ...flat(80, 97.5)], -1),
    ];
    for (const s of scenarios) {
      for (const horizon of ['6w', '12w'] as const) {
        const l = measured(measurePositionHorizon(long({ bars: s, horizon })));
        const sh = measured(measurePositionHorizon(shortTwin(long({ bars: s, horizon }))));
        expect(sh.firstHit).toBe(l.firstHit);
        expect(sh.firstHitDay).toBe(l.firstHitDay);
        expect(sh.rMultiple).toBe(l.rMultiple);
        expect(sh.mfePct).toBe(l.mfePct);
        expect(sh.maePct).toBe(l.maePct);
        expect(sh.outcome).toBe(l.outcome);
        expect(sh.pctMove + l.pctMove).toBeCloseTo(0, 8);
        expect(sh.bars).toBe(l.bars);
      }
    }
  });
});

describe('what the window includes, and data guards', () => {
  it("leaves out the signal day's bar when the call was made during it (its low came before the call)", () => {
    const series = bars([[100, 101, 90, 100], ...flat(99)], 0); // day 0 low 90 would be a stop
    const r = measured(measurePositionHorizon(long({ bars: series, signalAtMs: D0 + 12 * 3_600_000 })));
    expect(r.firstHit).toBe('neither');
    expect(r.minPrice).toBe(99.5);
  });

  it('no_data when the daily history starts after the call (cannot see the start of the window)', () => {
    expect(measurePositionHorizon(long({ bars: bars(flat(100), 3) }))).toMatchObject({ status: 'no_data', reason: expect.stringMatching(/starts after/) });
  });

  it('no_data on a split: first bar far from the entry, or a close outside its own high/low', () => {
    const split = bars([[100, 100.5, 99.5, 100], ...flat(100, 40)], -1);
    expect(measurePositionHorizon(long({ bars: split }))).toMatchObject({ status: 'no_data' });
    const mixed = bars([[100, 100.5, 99.5, 100], ...flat(5), [100, 101, 99, 50], ...flat(95)], -1);
    expect(measurePositionHorizon(long({ bars: mixed }))).toMatchObject({ status: 'no_data', reason: expect.stringMatching(/split/) });
  });

  it('no usable stop = no_levels and no R (return and excursions are still recorded)', () => {
    const series = bars([[100, 100.5, 99.5, 100], ...flat(100, 101)], -1);
    expect(measured(measurePositionHorizon(long({ bars: series, stop: null })))).toMatchObject({ firstHit: 'no_levels', rMultiple: null, pctMove: 1 });
    expect(measured(measurePositionHorizon(long({ bars: series, stop: 101 })))).toMatchObject({ firstHit: 'no_levels', rMultiple: null });
    // Target on the wrong side is ignored; the stop still counts.
    expect(validLevels('LONG', 100, 95, 90)).toEqual({ stop: 95, target: null });
    expect(validLevels('SHORT', 100, 105, 90)).toEqual({ stop: 105, target: 90 });
    expect(validLevels('SHORT', 100, 95, 90)).toEqual({ stop: null, target: null });
  });
});

describe('daily bar sources', () => {
  it('equity sessions open 09:30 and close 16:00 New York; a call during a session starts the window next session', () => {
    const eq = equityDailyToOhlcBars([
      { date: '2026-01-05', open: 100, high: 101, low: 90, close: 100 },
      { date: '2026-01-06', open: 100, high: 101, low: 99, close: 100 },
    ]);
    expect(new Date(eq[0].openTime).toISOString()).toBe('2026-01-05T14:30:00.000Z');
    expect(new Date(eq[0].closeTime).toISOString()).toBe('2026-01-05T21:00:00.000Z');
    // ~42 calendar days of NYSE sessions after a Monday call = 29-30 bars.
    const days: { date: string; open: number; high: number; low: number; close: number }[] = [];
    for (let t = Date.parse('2026-01-02T00:00:00Z'); t < Date.parse('2026-04-30T00:00:00Z'); t += DAY) {
      const wd = new Date(t).getUTCDay();
      if (wd !== 0 && wd !== 6) days.push({ date: new Date(t).toISOString().slice(0, 10), open: 100, high: 100.5, low: 99.5, close: 100 });
    }
    const signal = Date.parse('2026-01-05T15:00:00Z'); // 10:00 NY
    const r = measured(measurePositionHorizon({
      direction: 'LONG', entry: 100, signalAtMs: signal, stop: 95, target: 110, horizon: '6w',
      bars: equityDailyToOhlcBars(days), nowMs: Date.parse('2026-04-29T00:00:00Z'),
    }));
    expect(r.bars).toBeGreaterThanOrEqual(28);
    expect(r.bars).toBeLessThanOrEqual(31);
  });

  it('parses DIGITAL_CURRENCY_DAILY in both AV key formats', () => {
    const newer = { 'Time Series (Digital Currency Daily)': { '2026-01-06': { '1. open': '10', '2. high': '12', '3. low': '9', '4. close': '11' } } };
    const older = { 'Time Series (Digital Currency Daily)': { '2026-01-05': { '1a. open (USD)': '9', '2a. high (USD)': '10.5', '3a. low (USD)': '8.5', '4a. close (USD)': '10' } } };
    const a = parseAvCryptoDailyOhlc(newer)[0];
    expect(a).toMatchObject({ day: '2026-01-06', open: 10, high: 12, low: 9, close: 11 });
    expect(a.closeTime - a.openTime).toBe(DAY);
    expect(parseAvCryptoDailyOhlc(older)[0]).toMatchObject({ open: 9, high: 10.5, low: 8.5, close: 10 });
    expect(parseAvCryptoDailyOhlc({ Note: 'rate limit' })).toEqual([]);
  });

  it('merges the cached series over the stored history by day', () => {
    const stored = bars([[1, 1, 1, 1], [2, 2, 2, 2]], 0);
    const cached = bars([[3, 3, 3, 3], [4, 4, 4, 4]], 1);
    expect(mergeDailyBars(cached, stored).map((b) => b.close)).toEqual([1, 3, 4]);
  });
});
