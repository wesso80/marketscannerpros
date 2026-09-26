import { describe, it, expect } from 'vitest';
import { cagrFromEquityHistory } from '@/lib/portfolio/cagr';

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString();

describe('cagrFromEquityHistory (TR-4)', () => {
  it('is N/A before clean history is ready, even with 2+ snapshots', () => {
    const pts = [{ timestamp: day(0), totalValue: 10000 }, { timestamp: day(1), totalValue: 100 }];
    expect(cagrFromEquityHistory(pts, { ready: false })).toBeNull();
  });

  it('is N/A when the history spans less than 30 days (no annualising a few days)', () => {
    const pts = [0, 1, 2, 3, 4].map((d) => ({ timestamp: day(d), totalValue: 10000 - d * 500 }));
    expect(cagrFromEquityHistory(pts, { ready: true })).toBeNull();
  });

  it('annualises once ready and long enough', () => {
    const pts = [{ timestamp: day(0), totalValue: 10000 }, { timestamp: day(365), totalValue: 11000 }];
    expect(cagrFromEquityHistory(pts, { ready: true })).toBeCloseTo(10, 6);
    const half = [{ timestamp: day(0), totalValue: 10000 }, { timestamp: day(73), totalValue: 10100 }];
    expect(cagrFromEquityHistory(half, { ready: true })).toBeCloseTo((Math.pow(1.01, 5) - 1) * 100, 6);
  });
});
