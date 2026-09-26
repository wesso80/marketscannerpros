/** #108 leftovers: no invented risk-unit base; option R from a device stop is right without knowing the multiplier. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { closedTradeR, riskUnitBase, riskUnitDollars } from '@/lib/portfolio/rMeasures';
import { positionMultiplier, positionUnits } from '@/lib/portfolio/positionValue';
import { splitPosition } from '@/lib/portfolio/closePosition';

describe('risk units need real account equity', () => {
  it('no starting capital / deposits → unavailable (was max(total value, $1000))', () => {
    expect(riskUnitBase({ startingCapital: 0, netDeposits: 0, accountEquity: 350 })).toBeNull();
    expect(riskUnitDollars(riskUnitBase({ startingCapital: 0, netDeposits: 0, accountEquity: 350 }) ?? 0, 1)).toBeNull();
    expect(riskUnitBase({ startingCapital: 10000, netDeposits: 0, accountEquity: -50 })).toBeNull();
  });
  it('funded account → equity is the base', () => {
    expect(riskUnitBase({ startingCapital: 10000, netDeposits: 2000, accountEquity: 12500 })).toBe(12500);
    expect(riskUnitBase({ startingCapital: 0, netDeposits: 5000, accountEquity: 5100 })).toBe(5100);
  });
  it('the page no longer falls back to max(total value, 1000) for risk units and shows a hint instead', () => {
    const page = readFileSync(join(process.cwd(), 'app/tools/portfolio/page.tsx'), 'utf8');
    expect(page).toMatch(/riskUnitDollars\(riskUnitBase\(/);
    expect(page).not.toMatch(/riskUnitDollars\(capitalBase/);
    expect(page).toContain('RISK_UNITS_NEED_EQUITY');
  });
});

describe('closed option R from a device-kept stop', () => {
  // Long 2 contracts @ 2.35 premium, stop 1.50, closed at 3.20: +0.85 per share on 0.85 risk per share = +1R.
  const opened = { id: 1, symbol: 'AAPL', side: 'LONG' as const, quantity: 2, entryPrice: 2.35, currentPrice: 3.2, pl: 0, plPercent: 0, entryDate: '2026-09-01', tradeType: 'Options', stopPrice: 1.5 };
  const closed = splitPosition(opened, 1, 3.2, '2026-09-20', 2, positionMultiplier(opened)).closed;

  it('is +1R with the x100 row', () => {
    expect(closed.realizedPL).toBeCloseTo(170);
    expect(closedTradeR(closed, positionUnits(closed))).toBeCloseTo(1);
  });
  it('is still +1R when the row lost its tradeType (no linked journal entry) — was +100R with x1 units', () => {
    const noType = { ...closed, tradeType: undefined };
    expect(positionUnits(noType)).toBe(2);
    expect(closedTradeR(noType, positionUnits(noType))).toBeCloseTo(1);
  });
  it('short side and stock rows unchanged', () => {
    expect(closedTradeR({ side: 'SHORT', entryPrice: 50, realizedPL: 400, stopPrice: 52, closePrice: 46 }, 100)).toBeCloseTo(2);
    expect(closedTradeR({ side: 'LONG', entryPrice: 100, realizedPL: 150, stopPrice: 95, closePrice: 115 }, 10)).toBeCloseTo(3);
  });
});
