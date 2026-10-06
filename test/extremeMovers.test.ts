import { describe, expect, it } from 'vitest';
import {
  EXTREME_MIN_DOLLAR_VOLUME,
  EXTREME_MIN_SHARES,
  impliedPreviousClose,
  isUncheckedExtremeMove,
} from '@/lib/analysis/moverQuality';

const checked = {
  asset_class: 'equity' as const,
  price: '30.01',
  change_percentage: '200.10%',
  volume: String(EXTREME_MIN_SHARES),
  previous_close: '10',
};

describe('unchecked extreme moves', () => {
  it('keeps +200.0 and -90.0, including when the price and volume check would fail', () => {
    expect(isUncheckedExtremeMove({ ...checked, change_percentage: '200%', price: '1', volume: '1', previous_close: null })).toBe(false);
    expect(isUncheckedExtremeMove({ ...checked, change_percentage: '+200.0%', previous_close: '10' })).toBe(false);
    expect(isUncheckedExtremeMove({ ...checked, change_percentage: '-90%', price: '1', volume: '1', previous_close: null })).toBe(false);
    expect(isUncheckedExtremeMove({ ...checked, change_percentage: '-90.0%' })).toBe(false);
  });

  it('hides +200.1 and -90.1 unless the previous close agrees and size clears both floors', () => {
    expect(isUncheckedExtremeMove(checked)).toBe(false);
    expect(isUncheckedExtremeMove({ ...checked, previous_close: null })).toBe(true);
    expect(isUncheckedExtremeMove({ ...checked, previous_close: '12' })).toBe(true);
    expect(isUncheckedExtremeMove({ ...checked, volume: String(EXTREME_MIN_SHARES - 1) })).toBe(true);
    expect(isUncheckedExtremeMove({ ...checked, price: '9', volume: String(EXTREME_MIN_SHARES), previous_close: '2.999' })).toBe(true);
    expect(9 * EXTREME_MIN_SHARES).toBeLessThan(EXTREME_MIN_DOLLAR_VOLUME);

    const loser = { ...checked, change_percentage: '-90.1%', price: '0.99', volume: '11000000', previous_close: '10' };
    expect(impliedPreviousClose(0.99, -90.1)).toBeCloseTo(10, 5);
    expect(isUncheckedExtremeMove(loser)).toBe(false);
    expect(isUncheckedExtremeMove({ ...loser, previous_close: null })).toBe(true);
    expect(isUncheckedExtremeMove({ ...loser, volume: '1000' })).toBe(true);
  });

  it('hides a fake +900% row even when share and dollar volume are large', () => {
    const fake = { asset_class: 'equity' as const, ticker: 'FAKE', price: '10', change_percentage: '900%', volume: '5000000' };
    expect(10 * 5_000_000).toBeGreaterThan(EXTREME_MIN_DOLLAR_VOLUME);
    expect(isUncheckedExtremeMove(fake)).toBe(true);
    const implied = impliedPreviousClose(10, 900);
    expect(isUncheckedExtremeMove({ ...fake, previous_close: implied })).toBe(false);
  });

  it('uses a 24h dollar-volume floor for crypto and still requires the previous close', () => {
    const coin = { asset_class: 'crypto' as const, price: '1', change_percentage: '250%', volume: EXTREME_MIN_DOLLAR_VOLUME, previous_close: '0.2857' };
    expect(isUncheckedExtremeMove(coin)).toBe(false);
    expect(isUncheckedExtremeMove({ ...coin, volume: EXTREME_MIN_DOLLAR_VOLUME - 1 })).toBe(true);
    expect(isUncheckedExtremeMove({ ...coin, previous_close: null })).toBe(true);
  });

  it('treats a previous close 2% away as agreeing and 2.01% as not', () => {
    const factor = 1 + 200.1 / 100;
    const onEdge = { ...checked, previous_close: '100', price: String(102 * factor) };
    const pastEdge = { ...checked, previous_close: '100', price: String(102.01 * factor), volume: '2000000' };
    expect(Math.abs(impliedPreviousClose(102 * factor, 200.1) - 100) / 100).toBeCloseTo(0.02, 8);
    expect(isUncheckedExtremeMove(onEdge)).toBe(false);
    expect(isUncheckedExtremeMove(pastEdge)).toBe(true);
  });
});
