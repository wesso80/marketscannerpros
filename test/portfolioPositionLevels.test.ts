import { describe, it, expect } from 'vitest';
import { mergeLocalLevels, openRiskMetrics, validateLevels } from '@/lib/portfolio/positionLevels';

describe('openRiskMetrics (TR-27: no hidden default stop)', () => {
  it('returns nulls when no stop is set, instead of assuming a 5% stop', () => {
    const m = openRiskMetrics({ side: 'LONG', entryPrice: 100, currentPrice: 103 });
    expect(m).toEqual({ rMultiple: null, riskRemainingPct: null, stopDistancePct: null, stopAtOrPastEntry: false });
    expect(openRiskMetrics({ side: 'SHORT', entryPrice: 100, currentPrice: 97, stopPrice: null }).rMultiple).toBeNull();
  });

  it('uses the real stop for LONG and SHORT', () => {
    const long = openRiskMetrics({ side: 'LONG', entryPrice: 100, currentPrice: 110, stopPrice: 90 });
    expect(long.rMultiple).toBeCloseTo(1);
    expect(long.riskRemainingPct).toBe(100); // winning: full risk budget left
    expect(long.stopDistancePct).toBeCloseTo((20 / 110) * 100);

    const losingLong = openRiskMetrics({ side: 'LONG', entryPrice: 100, currentPrice: 95, stopPrice: 90 });
    expect(losingLong.rMultiple).toBeCloseTo(-0.5);
    expect(losingLong.riskRemainingPct).toBeCloseTo(50);

    const short = openRiskMetrics({ side: 'SHORT', entryPrice: 50, currentPrice: 52, stopPrice: 54 });
    expect(short.rMultiple).toBeCloseTo(-0.5);
    expect(short.riskRemainingPct).toBeCloseTo(50);
  });

  it('does not invent R when the stop is at or past entry', () => {
    const m = openRiskMetrics({ side: 'LONG', entryPrice: 100, currentPrice: 120, stopPrice: 100 });
    expect(m.rMultiple).toBeNull();
    expect(m.riskRemainingPct).toBeNull();
    expect(m.stopAtOrPastEntry).toBe(true);
    expect(m.stopDistancePct).toBeCloseTo((20 / 120) * 100);
  });
});

describe('validateLevels', () => {
  const long = { side: 'LONG' as const, entryPrice: 100, currentPrice: 105 };
  it('allows clearing and accepts real values', () => {
    expect(validateLevels({ stop: '', target: '' }, long)).toMatchObject({ stop: null, target: null, errors: [] });
    expect(validateLevels({ stop: '92.5', target: '120' }, long)).toMatchObject({ stop: 92.5, target: 120, errors: [], warnings: [] });
  });
  it('rejects bad numbers and a target on the wrong side of the stop', () => {
    expect(validateLevels({ stop: 'abc', target: '' }, long).errors).toHaveLength(1);
    expect(validateLevels({ stop: '-1', target: '' }, long).errors).toHaveLength(1);
    expect(validateLevels({ stop: '95', target: '90' }, long).errors.length).toBeGreaterThan(0);
    expect(validateLevels({ stop: '110', target: '100' }, { side: 'SHORT', entryPrice: 105, currentPrice: 104 }).errors).toEqual([]);
  });
  it('warns (without blocking) when the stop would already be hit', () => {
    const r = validateLevels({ stop: '106', target: '' }, long);
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toMatch(/already be hit/);
  });
});

describe('mergeLocalLevels (stops survive reload)', () => {
  const server = [
    { id: 11, symbol: 'AAPL', side: 'LONG' as const, entryPrice: 190.12, quantity: 10, entryDate: '2026-09-26T02:00:00.000Z' },
    { id: 12, symbol: 'MSFT', side: 'SHORT' as const, entryPrice: 400, quantity: 5, entryDate: '2026-09-26T02:00:00.000Z' },
    { id: 13, symbol: 'SPY', side: 'LONG' as const, entryPrice: 2.35, quantity: 1, journalEntryId: 7, stopPrice: 1.5, targetPrice: 4 },
  ];
  it('re-attaches device-saved stops/targets to server rows (ids differ) and leaves journal-linked rows alone', () => {
    const local = [
      { id: 1, symbol: 'aapl', side: 'LONG' as const, entryPrice: 190.12, quantity: 10, entryDate: '2026-09-26T02:00:00.123Z', stopPrice: 185, targetPrice: 205 },
      { id: 3, symbol: 'SPY', side: 'LONG' as const, entryPrice: 2.35, quantity: 1, journalEntryId: 7, stopPrice: 9, targetPrice: 9 },
    ];
    const merged = mergeLocalLevels(server, local);
    expect(merged[0]).toMatchObject({ id: 11, stopPrice: 185, targetPrice: 205 });
    expect(merged[1]).toBe(server[1]);
    expect(merged[2]).toBe(server[2]);
  });
  it('skips ambiguous matches', () => {
    const dupServer = [server[0], { ...server[0], id: 99 }];
    const local = [{ ...server[0], id: 1, stopPrice: 185 }];
    expect(mergeLocalLevels(dupServer, local).every((p) => !('stopPrice' in p))).toBe(true);
  });
});
