/**
 * Unit tests for the mover universe-quality floor (§M9).
 *
 * Run: npx vitest run test/analysis/moverQuality.test.ts
 */
import { describe, it, expect } from 'vitest';
import { parseMoverNumber, passesMoverFloor, filterMoversByFloor } from '../../lib/analysis';

describe('parseMoverNumber', () => {
  it('parses currency, percent, comma, and numeric forms', () => {
    expect(parseMoverNumber('$2.10')).toBeCloseTo(2.1);
    expect(parseMoverNumber('1,234,567')).toBe(1234567);
    expect(parseMoverNumber('+138.53%')).toBeCloseTo(138.53);
    expect(parseMoverNumber(3.4)).toBeCloseTo(3.4);
    expect(Number.isNaN(parseMoverNumber('N/A'))).toBe(true);
    expect(Number.isNaN(parseMoverNumber(null))).toBe(true);
  });
});

describe('passesMoverFloor', () => {
  it('rejects $0 / unpriced rows', () => {
    expect(passesMoverFloor({ ticker: 'GFAIW', price: '$0', asset_class: 'equity' })).toBe(false);
    expect(passesMoverFloor({ ticker: 'X', price: null, asset_class: 'equity' })).toBe(false);
  });

  it('rejects sub-dollar equities (shells)', () => {
    expect(passesMoverFloor({ ticker: 'CELU', price: '$2.10', asset_class: 'equity' })).toBe(true);
    expect(passesMoverFloor({ ticker: 'PENNY', price: '$0.40', asset_class: 'equity' })).toBe(false);
  });

  it('rejects nano-cap equities when market cap is known', () => {
    expect(passesMoverFloor({ ticker: 'NANO', price: 5, market_cap: 10_000_000, asset_class: 'equity' })).toBe(false);
    expect(passesMoverFloor({ ticker: 'BIG', price: 5, market_cap: 5_000_000_000, asset_class: 'equity' })).toBe(true);
  });

  it('does not drop equities merely because market cap is missing', () => {
    expect(passesMoverFloor({ ticker: 'OK', price: 12, market_cap: null, asset_class: 'equity' })).toBe(true);
  });

  it('keeps sub-dollar crypto but rejects nano-cap crypto when mcap known', () => {
    expect(passesMoverFloor({ ticker: 'GALA', price: 0.0018, asset_class: 'crypto' })).toBe(true);
    expect(passesMoverFloor({ ticker: 'PIPEDOG', price: 0.002, market_cap: 1_000_000, asset_class: 'crypto' })).toBe(false);
    expect(passesMoverFloor({ ticker: 'ETH', price: 2500, market_cap: 300_000_000_000, asset_class: 'crypto' })).toBe(true);
  });
});

describe('filterMoversByFloor', () => {
  it('removes junk while keeping quality names', () => {
    const movers = [
      { ticker: 'CELU', price: '$2.10', market_cap: '5000000000', asset_class: 'equity' as const },
      { ticker: 'GFAIW', price: '$0', asset_class: 'equity' as const },
      { ticker: 'PENNY', price: '$0.40', asset_class: 'equity' as const },
    ];
    const kept = filterMoversByFloor(movers);
    expect(kept.map((m) => m.ticker)).toEqual(['CELU']);
  });

  it('falls back to the original list if the floor removes everything', () => {
    const movers = [
      { ticker: 'A', price: '$0', asset_class: 'equity' as const },
      { ticker: 'B', price: null, asset_class: 'equity' as const },
    ];
    expect(filterMoversByFloor(movers)).toBe(movers);
  });
});
