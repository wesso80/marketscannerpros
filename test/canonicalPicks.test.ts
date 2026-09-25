import { describe, expect, it } from 'vitest';
import {
  canonicalForDailyPick, dailyPickColumns, pickView, selectDailyPicks, storedLegacyScore, withCanonicalColumns,
  type CanonicalBar, type CanonicalResult,
} from '@/lib/scoring/canonical';

const DAY = 86_400_000;
function bars(n: number): CanonicalBar[] {
  return Array.from({ length: n }, (_, i) => {
    const c = 100 * (1 + 0.0015 * i + 0.03 * Math.sin(i / 9));
    return { t: new Date(Date.UTC(2025, 0, 1) + i * DAY).toISOString(), open: c * 0.998, high: c * 1.01, low: c * 0.99, close: c, volume: 1e6 };
  });
}
const b = bars(420);
const BASE = canonicalForDailyPick(b, { symbol: 'T', assetClass: 'equity', nowMs: Date.parse(b[b.length - 1].t) + DAY })!;
const c = (o: Partial<CanonicalResult>): CanonicalResult => ({ ...BASE, ...o });

describe('daily-pick columns and selection (Phase 3)', () => {
  it('columns carry canonical score/direction (0 + neutral on BLOCK); legacy kept', () => {
    expect(dailyPickColumns(c({ permission: 'WATCH', direction: 'short', score: 72 }), { score: 40, direction: 'bullish' }))
      .toEqual({ score: 72, direction: 'bearish', scoreColumn: 'canonical', legacy: { score: 40, direction: 'bullish' } });
    expect(dailyPickColumns(c({ permission: 'BLOCK', direction: 'long', score: 90 }), { score: 80, direction: 'bullish' })).toMatchObject({ score: 0, direction: 'neutral' });
    expect(dailyPickColumns(null, { score: 55, direction: 'bullish' })).toMatchObject({ score: 55, direction: 'bullish', scoreColumn: 'legacy' });
  });

  it('withCanonicalColumns rewrites a writer row and storedLegacyScore reads the old score back', () => {
    const row = { symbol: 'X', score: 33, direction: 'bearish', indicators: { rsi: 50, canonical: c({ permission: 'WATCH', direction: 'long', score: 81 }) } };
    const out = withCanonicalColumns(row);
    expect(out.score).toBe(81);
    expect(out.direction).toBe('bullish');
    expect(out.indicators.scoreColumn).toBe('canonical');
    expect(out.indicators.legacy).toEqual({ score: 33, direction: 'bearish' });
    expect(out.indicators.rsi).toBe(50);
    expect(storedLegacyScore(out.indicators, out.score)).toBe(33);
    expect(storedLegacyScore(JSON.stringify(out.indicators), out.score)).toBe(33);
    expect(storedLegacyScore({ rsi: 1 }, 44)).toBe(44);
    expect(row.score).toBe(33); // input not mutated
  });

  it('selection is symmetric: top = best canonical longs, bottom = best canonical shorts, BLOCK excluded', () => {
    const rows = [
      { symbol: 'L1', score: 10, canonical: c({ permission: 'WATCH', direction: 'long', grade: 'A', score: 90 }) },
      { symbol: 'L2', score: 99, canonical: c({ permission: 'WATCH', direction: 'long', grade: 'C', score: 20 }) },
      { symbol: 'S1', score: 1, canonical: c({ permission: 'WATCH', direction: 'short', grade: 'B', score: 70 }) },
      { symbol: 'S2', score: 5, canonical: c({ permission: 'WATCH', direction: 'short', grade: 'A', score: 88 }) },
      { symbol: 'BL', score: 100, canonical: c({ permission: 'BLOCK', direction: 'long', grade: 'F', score: 99 }) },
      { symbol: 'NO', score: 100, canonical: null },
    ];
    const sel = selectDailyPicks(rows, 10);
    expect(sel.basis).toBe('canonical');
    expect(sel.top.map((r) => r.symbol)).toEqual(['L1', 'L2']);
    expect(sel.bottom.map((r) => r.symbol)).toEqual(['S2', 'S1']);
    // Mirror: swapping long/short swaps top and bottom.
    const mirrored = rows.map((r) => ({ ...r, canonical: r.canonical ? { ...r.canonical, direction: (r.canonical.direction === 'long' ? 'short' : 'long') as 'long' | 'short' } : null }));
    const m = selectDailyPicks(mirrored, 10);
    expect(m.top.map((r) => r.symbol)).toEqual(sel.bottom.map((r) => r.symbol));
    expect(m.bottom.map((r) => r.symbol)).toEqual(sel.top.map((r) => r.symbol));
  });

  it('falls back to the legacy score only when no row has a canonical verdict', () => {
    const sel = selectDailyPicks([{ symbol: 'A', score: 80 }, { symbol: 'B', score: 20 }, { symbol: 'C', score: 50 }], 1);
    expect(sel).toMatchObject({ basis: 'legacy' });
    expect(sel.top.map((r) => r.symbol)).toEqual(['A']);
    expect(sel.bottom.map((r) => r.symbol)).toEqual(['B']);
  });

  it('pickView labels canonical rows honestly and keeps legacy rows as before', () => {
    const v = pickView({ score: 64, direction: 'bearish', canonical: c({ permission: 'WATCH', direction: 'long', score: 64 }) });
    expect(v.side).toBe('LONG');
    expect(v.label).toMatch(/^WATCH · /);
    expect(v.basisNote).toMatch(/no validated edge|uncalibrated|not a probability/);
    expect(pickView({ score: 0, direction: 'neutral', canonical: c({ permission: 'BLOCK', direction: 'long' }) })).toMatchObject({ side: 'WATCH', score: 0 });
    expect(pickView({ score: 70, direction: 'bullish', canonical: null })).toMatchObject({ side: 'LONG', score: 70, label: null });
  });
});
