/**
 * BT-2 / BT-3: realistic stop/target fills and fixed bracket levels.
 *
 *  - resolveBarExit: stop wins when a bar touches both levels; a stop gapped
 *    through at the open fills at the open; targets fill at the target level;
 *    longs and shorts are mirror images.
 *  - runStrategy: bracket levels are fixed at entry from the ATR of the signal
 *    bar (the entry decision) and do not drift while the trade is open.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveBarExit } from '../lib/backtest/barExit';
import { runStrategy } from '../lib/backtest/runStrategy';
import { calculateATR } from '../lib/backtest/indicators';
import { BACKTEST_SLIPPAGE_BPS } from '../lib/backtest/assumptions';
import type { PriceData } from '../lib/backtest/providers';

describe('resolveBarExit', () => {
  it('LONG: a bar that touches both stop and target exits at the stop', () => {
    const r = resolveBarExit({ side: 'LONG', open: 100, high: 112, low: 94, stop: 95, target: 110 });
    expect(r).toEqual({ exitPrice: 95, exitReason: 'stop', gapped: false });
  });

  it('SHORT: a bar that touches both stop and target exits at the stop', () => {
    const r = resolveBarExit({ side: 'SHORT', open: 100, high: 106, low: 88, stop: 105, target: 90 });
    expect(r).toEqual({ exitPrice: 105, exitReason: 'stop', gapped: false });
  });

  it('LONG: a gap down through the stop fills at the open, not the stop', () => {
    const r = resolveBarExit({ side: 'LONG', open: 90, high: 93, low: 88, stop: 95, target: 110 });
    expect(r).toEqual({ exitPrice: 90, exitReason: 'stop', gapped: true });
  });

  it('SHORT: a gap up through the stop fills at the open, not the stop', () => {
    const r = resolveBarExit({ side: 'SHORT', open: 110, high: 112, low: 107, stop: 105, target: 90 });
    expect(r).toEqual({ exitPrice: 110, exitReason: 'stop', gapped: true });
  });

  it('a gap through the stop that also reaches the target still exits at the open as a stop', () => {
    expect(resolveBarExit({ side: 'LONG', open: 90, high: 120, low: 85, stop: 95, target: 110 }))
      .toEqual({ exitPrice: 90, exitReason: 'stop', gapped: true });
    expect(resolveBarExit({ side: 'SHORT', open: 110, high: 115, low: 80, stop: 105, target: 90 }))
      .toEqual({ exitPrice: 110, exitReason: 'stop', gapped: true });
  });

  it('targets fill at the target level; favourable gaps are not credited (conservative)', () => {
    expect(resolveBarExit({ side: 'LONG', open: 101, high: 111, low: 99, stop: 95, target: 110 }))
      .toEqual({ exitPrice: 110, exitReason: 'target', gapped: false });
    expect(resolveBarExit({ side: 'LONG', open: 115, high: 118, low: 114, stop: 95, target: 110 }))
      .toEqual({ exitPrice: 110, exitReason: 'target', gapped: false });
    expect(resolveBarExit({ side: 'SHORT', open: 99, high: 101, low: 89, stop: 105, target: 90 }))
      .toEqual({ exitPrice: 90, exitReason: 'target', gapped: false });
    expect(resolveBarExit({ side: 'SHORT', open: 85, high: 86, low: 82, stop: 105, target: 90 }))
      .toEqual({ exitPrice: 90, exitReason: 'target', gapped: false });
  });

  it('returns null when neither level is touched, and ignores missing levels', () => {
    expect(resolveBarExit({ side: 'LONG', open: 100, high: 105, low: 96, stop: 95, target: 110 })).toBeNull();
    expect(resolveBarExit({ side: 'SHORT', open: 100, high: 104, low: 91, stop: 105, target: 90 })).toBeNull();
    expect(resolveBarExit({ side: 'LONG', open: 100, high: 200, low: 50 })).toBeNull();
    expect(resolveBarExit({ side: 'LONG', open: 100, high: 200, low: 99, stop: null, target: 150 }))
      .toEqual({ exitPrice: 150, exitReason: 'target', gapped: false });
  });

  it('is symmetric: mirroring prices around a pivot mirrors the result', () => {
    const pivot = 200;
    const cases = [
      { open: 100, high: 112, low: 94, stop: 95, target: 110 },
      { open: 90, high: 93, low: 88, stop: 95, target: 110 },
      { open: 101, high: 111, low: 99, stop: 95, target: 110 },
      { open: 100, high: 105, low: 96, stop: 95, target: 110 },
    ];
    for (const c of cases) {
      const long = resolveBarExit({ side: 'LONG', ...c });
      const short = resolveBarExit({
        side: 'SHORT',
        open: pivot - c.open,
        high: pivot - c.low,
        low: pivot - c.high,
        stop: pivot - c.stop,
        target: pivot - c.target,
      });
      if (long == null) {
        expect(short).toBeNull();
      } else {
        expect(short).toEqual({ ...long, exitPrice: pivot - long.exitPrice });
      }
    }
  });
});

// ── Strategy-level: bracket levels do not drift after entry ────────────────

function seededWalk(seed: number, bars: number): PriceData {
  let state = seed >>> 0;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const data: PriceData = {};
  let prevClose = 100;
  for (let i = 0; i < bars; i++) {
    const drift = Math.sin(i / 25) * 0.6; // alternating trends so strategies trade both ways
    const gap = rand() < 0.08 ? (rand() - 0.5) * 6 : (rand() - 0.5) * 0.6;
    const open = Math.max(5, prevClose + gap);
    const close = Math.max(5, open + drift + (rand() - 0.5) * 3);
    // Occasional very wide bars: these inflate ATR on the bar itself, which is
    // exactly what used to widen the stop/target on the bar being tested.
    const wide = rand() < 0.07 ? 4 + rand() * 6 : 0.3 + rand() * 1.5;
    const high = Math.max(open, close) + wide * rand();
    const low = Math.max(1, Math.min(open, close) - wide * rand());
    const d = new Date(Date.UTC(2020, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    data[d] = { open, high, low, close, volume: 1_000_000 + Math.floor(rand() * 2_000_000) };
    prevClose = close;
  }
  return data;
}

const slip = BACKTEST_SLIPPAGE_BPS / 10_000;
const rawEntry = (side: 'LONG' | 'SHORT', px: number) => side === 'LONG' ? px / (1 + slip) : px / (1 - slip);
const rawExit = (side: 'LONG' | 'SHORT', px: number) => side === 'LONG' ? px / (1 - slip) : px / (1 + slip);

const BRACKETS: Record<string, { sl: number; tp: number }> = {
  msp_multi_tf: { sl: 1.5, tp: 3.0 },
  msp_day_trader_v3_aggressive: { sl: 1.0, tp: 3.5 },
  tc_low_stack_drift: { sl: 1.2, tp: 3.0 },
  tc_high_stack_breakout: { sl: 1.0, tp: 3.5 },
};

describe('runStrategy bracket levels are fixed at entry (no same-bar ATR look-ahead)', () => {
  for (const [strategy, { sl, tp }] of Object.entries(BRACKETS)) {
    it(`${strategy}: every stop/target exit uses levels set from the signal-bar ATR`, () => {
      let checked = 0;
      let wideBarChecks = 0;
      for (const seed of [7, 42, 1234]) {
        const data = seededWalk(seed, 600);
        const dates = Object.keys(data).sort();
        const opens = dates.map(d => data[d].open);
        const highs = dates.map(d => data[d].high);
        const lows = dates.map(d => data[d].low);
        const closes = dates.map(d => data[d].close);
        const atr = calculateATR(highs, lows, closes, 14);
        const result = runStrategy(strategy, data, 10_000, dates[0], dates[dates.length - 1], 'SYNTH', 'daily', 'stock');

        for (const t of result.trades) {
          if (t.exitReason !== 'stop' && t.exitReason !== 'target') continue;
          const entryIdx = dates.indexOf(t.entryDate);
          const exitIdx = dates.indexOf(t.exitDate);
          const signalIdx = entryIdx - 1;
          const signalAtr = atr[signalIdx] || closes[signalIdx] * 0.02;
          const entry = rawEntry(t.side, t.entry);
          const exit = rawExit(t.side, t.exit);
          const dir = t.side === 'LONG' ? 1 : -1;
          const stop = entry - dir * sl * signalAtr;
          const target = entry + dir * tp * signalAtr;

          if (t.exitReason === 'stop') {
            const expected = t.side === 'LONG' ? Math.min(opens[exitIdx], stop) : Math.max(opens[exitIdx], stop);
            expect(exit).toBeCloseTo(expected, 6);
          } else {
            expect(exit).toBeCloseTo(target, 6);
            // A target exit means the fixed stop was NOT touched on that bar.
            expect(t.side === 'LONG' ? lows[exitIdx] > stop : highs[exitIdx] < stop).toBe(true);
          }
          if (Math.abs((atr[exitIdx] ?? signalAtr) - signalAtr) > 0.25 * signalAtr) wideBarChecks++;
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(3);
      // Sanity: the fixture really does contain exits where the live ATR had moved a lot.
      expect(wideBarChecks).toBeGreaterThan(0);
    });
  }

  it('lone_daily_close no longer exits every trade on its entry bar', () => {
    // Before the fix the target was the midpoint of the bar being tested, which
    // always lies inside that bar, so every trade exited on its entry bar.
    const trades = [7, 42, 99, 1234].flatMap(seed => {
      const data = seededWalk(seed, 600);
      const dates = Object.keys(data).sort();
      return runStrategy('lone_daily_close', data, 10_000, dates[0], dates[dates.length - 1], 'SYNTH', 'daily', 'stock').trades;
    });
    expect(trades.length).toBeGreaterThan(3);
    expect(trades.some(t => t.entryDate !== t.exitDate)).toBe(true);
  });

  it('source: no strategy path uses the old "last assignment wins" exit pattern', () => {
    const runner = readFileSync(join(process.cwd(), 'lib/backtest/runStrategy.ts'), 'utf8');
    expect(runner).not.toMatch(/if \(hitTP\) exitPrice/);
    expect(runner).not.toContain('checkHitSLTP');
    expect(runner).toContain('resolveBarExit(');
  });
});
