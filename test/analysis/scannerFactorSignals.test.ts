import { describe, it, expect } from 'vitest';
import {
  deriveTrendSignal,
  deriveMomentumSignal,
  deriveVolumeSignal,
  deriveRelativeStrengthSignal,
  derivePositioningSignal,
  deriveVolatilityModifier,
  deriveCatalystSignal,
  deriveLiquidityMultiplier,
  deriveFactorSignals,
  type FactorSignalInput,
} from '@/lib/analysis/scannerFactorSignals';

describe('deriveTrendSignal', () => {
  it('is unavailable with no trend inputs', () => {
    expect(deriveTrendSignal({}).available).toBe(false);
  });
  it('is bullish when price is well above EMA200 with aligned DI/Aroon', () => {
    const s = deriveTrendSignal({ price: 110, ema200: 100, plusDI: 30, minusDI: 10, aroonUp: 90, aroonDown: 10, adx: 30 });
    expect(s.available).toBe(true);
    expect(s.signed).toBeGreaterThan(0.3);
  });
  it('is bearish when price is below EMA200 with negative DI spread', () => {
    const s = deriveTrendSignal({ price: 90, ema200: 100, plusDI: 10, minusDI: 30, aroonUp: 10, aroonDown: 90 });
    expect(s.signed).toBeLessThan(0);
  });
  it('a weak ADX dampens the trend magnitude', () => {
    const strong = deriveTrendSignal({ price: 110, ema200: 100, adx: 40 });
    const weak = deriveTrendSignal({ price: 110, ema200: 100, adx: 10 });
    expect(Math.abs(weak.signed)).toBeLessThan(Math.abs(strong.signed));
  });
});

describe('deriveMomentumSignal', () => {
  it('centres RSI at 50', () => {
    expect(deriveMomentumSignal({ rsi: 50 }).signed).toBe(0);
    expect(deriveMomentumSignal({ rsi: 75 }).signed).toBeGreaterThan(0);
    expect(deriveMomentumSignal({ rsi: 25 }).signed).toBeLessThan(0);
  });
});

describe('deriveVolumeSignal', () => {
  it('scales magnitude up with high relative volume', () => {
    const low = deriveVolumeSignal({ mfi: 70, relativeVolume: 0.8 });
    const high = deriveVolumeSignal({ mfi: 70, relativeVolume: 2 });
    expect(high.signed).toBeGreaterThan(low.signed);
  });
});

describe('deriveRelativeStrengthSignal', () => {
  it('uses a bounded ratio transform without a universe', () => {
    const out = deriveRelativeStrengthSignal({ rsIndexRatio: 1.15 });
    expect(out.available).toBe(true);
    expect(out.signed).toBeGreaterThan(0.5);
  });
  it('prefers cross-sectional percentile when a distribution is supplied', () => {
    const dist = [0.9, 0.95, 1.0, 1.05, 1.2];
    const top = deriveRelativeStrengthSignal({ rsIndexRatio: 1.2 }, { rsIndexRatios: dist });
    const bottom = deriveRelativeStrengthSignal({ rsIndexRatio: 0.9 }, { rsIndexRatios: dist });
    expect(top.signed).toBeGreaterThan(0);
    expect(bottom.signed).toBeLessThan(0);
  });
});

describe('derivePositioningSignal', () => {
  it('is unavailable without derivatives', () => {
    expect(derivePositioningSignal({ fundingRate: 0.03 }).available).toBe(false);
  });
  it('treats crowded longs (high positive funding) as bearish tilt', () => {
    const s = derivePositioningSignal({ fundingRate: 0.05, derivativesExpected: true });
    expect(s.available).toBe(true);
    expect(s.signed).toBeLessThan(0);
  });
});

describe('deriveVolatilityModifier', () => {
  it('reinforces the prevailing direction on a compression setup', () => {
    const up = deriveVolatilityModifier({ bbwp: 10, dveFlags: ['SQUEEZE_FIRE'] }, 0.5);
    expect(up.signed).toBeGreaterThan(0);
    const down = deriveVolatilityModifier({ bbwp: 10, dveFlags: ['SQUEEZE_FIRE'] }, -0.5);
    expect(down.signed).toBeLessThan(0);
  });
  it('opposes direction on exhaustion / trap flags', () => {
    const s = deriveVolatilityModifier({ dveFlags: ['EXHAUSTION_RISK', 'VOL_TRAP'] }, 0.5);
    expect(s.signed).toBeLessThan(0);
  });
});

describe('deriveCatalystSignal', () => {
  it('passes through directional sentiment', () => {
    expect(deriveCatalystSignal({ newsSentiment: 0.6 }).signed).toBeCloseTo(0.6, 5);
    expect(deriveCatalystSignal({}).available).toBe(false);
  });
});

describe('deriveLiquidityMultiplier', () => {
  it('penalises nano-caps and warrants and imminent earnings', () => {
    expect(deriveLiquidityMultiplier({ marketCap: 20_000_000 })).toBeCloseTo(0.6, 5);
    expect(deriveLiquidityMultiplier({ isDerivativeSecurity: true })).toBeCloseTo(0.5, 5);
    expect(deriveLiquidityMultiplier({ earningsInDays: 1 })).toBeCloseTo(0.9, 5);
    expect(deriveLiquidityMultiplier({ marketCap: 500_000_000 })).toBe(1);
  });
  it('uses cross-sectional dollar-volume percentile when supplied', () => {
    const dist = [5e6, 10e6, 50e6, 100e6, 500e6];
    expect(deriveLiquidityMultiplier({ dollarVolume: 5e6 }, { dollarVolumes: dist })).toBeLessThan(1);
  });
  it('never drops below the floor', () => {
    const m = deriveLiquidityMultiplier({ marketCap: 1_000_000, isDerivativeSecurity: true, earningsInDays: 0 });
    expect(m).toBeGreaterThanOrEqual(0.3);
  });
});

describe('deriveFactorSignals', () => {
  const bullish: FactorSignalInput = {
    price: 110, ema200: 100, plusDI: 30, minusDI: 10, aroonUp: 90, aroonDown: 10, adx: 30,
    rsi: 65, stochK: 70, cci: 120, mfi: 68, obvChangePct: 3, vwapPct: 1.5, relativeVolume: 1.6,
    rsIndexRatio: 1.12, marketCap: 5_000_000_000,
  };

  it('emits all eight factors and a bullish provisional direction', () => {
    const out = deriveFactorSignals(bullish);
    expect(out.factors).toHaveLength(8);
    expect(out.provisionalDirection).toBe('bullish');
    expect(out.liquidityMultiplier).toBe(1);
    expect(out.factors.find((f) => f.factor === 'QUALITY')?.available).toBe(false);
  });

  it('aligns the volatility modifier to the provisional direction', () => {
    const out = deriveFactorSignals({ ...bullish, bbwp: 10, dveFlags: ['SQUEEZE_FIRE'] });
    const vol = out.factors.find((f) => f.factor === 'VOLATILITY');
    expect(vol?.available).toBe(true);
    expect(vol?.signed).toBeGreaterThan(0);
  });

  it('flags imminent earnings and reduces the multiplier', () => {
    const out = deriveFactorSignals({ ...bullish, earningsInDays: 1 });
    expect(out.catalyst.imminent).toBe(true);
    expect(out.liquidityMultiplier).toBeCloseTo(0.9, 5);
  });

  it('produces a neutral provisional direction when core votes cancel', () => {
    const out = deriveFactorSignals({ price: 100, ema200: 100, rsi: 50, mfi: 50 });
    expect(out.provisionalDirection).toBe('neutral');
  });
});
