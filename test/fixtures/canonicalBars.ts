/**
 * Synthetic daily bars for canonical-engine tests (no market data). A zig-zag trend: `up` bars rising `upPct` per bar,
 * then `dn` bars falling `dnPct`, repeated, ending `tail` bars into an up leg — so the last swing low is a CONFIRMED
 * pivot a few bars back and price is above the prior swing high (open room → projected target).
 *
 * Default (6 up × 0.6%, 2 down × 0.8%, tail 5): an established uptrend — ADX ≈ 49, +DI > −DI, above a rising SMA200 —
 * with a trend-continuation long whose stop is the last swing low ≈ 1.65 ATR below the close.
 */
import type { CanonicalBar } from '@/lib/scoring/canonical';

export interface ZigzagOpts { n?: number; up?: number; dn?: number; upPct?: number; dnPct?: number; tail?: number; wick?: number; start?: number; startMs?: number }

export function zigzagTrend(o: ZigzagOpts = {}): CanonicalBar[] {
  const { n = 420, up = 6, dn = 2, upPct = 0.006, dnPct = 0.008, tail = 5, wick = 0.004, start = 100, startMs = Date.UTC(2024, 0, 1) } = o;
  const cyc = up + dn;
  const off = (cyc - ((n - tail) % cyc) + cyc) % cyc;
  const bars: CanonicalBar[] = [];
  let c = start;
  for (let i = 0; i < n; i++) {
    const ph = (i + off) % cyc;
    const open = c;
    c = c * (1 + (ph < dn ? -dnPct : upPct));
    bars.push({ t: new Date(startMs + i * 86_400_000).toISOString(), open, high: Math.max(open, c) * (1 + wick), low: Math.min(open, c) * (1 - wick), close: c, volume: 1e6 * (1 + (i % 5) / 10) });
  }
  return bars;
}

/** Mirror the chart vertically: p → K − p (highs and lows swap). An uptrend becomes a downtrend. */
export function flipBars(bars: CanonicalBar[]): CanonicalBar[] {
  const K = 2 * Math.max(...bars.map((b) => b.high));
  return bars.map((b) => ({ t: b.t, open: K - b.open, high: K - b.low, low: K - b.high, close: K - b.close, volume: b.volume }));
}
