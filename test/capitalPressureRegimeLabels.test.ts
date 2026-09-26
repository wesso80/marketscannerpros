/**
 * RS-15 — Capital Pressure showed Regime "TRENDING" next to Mode "chop" and Brain "mean revert day" on ~96% of equity
 * and 100% of crypto inputs: the matrix label was just the largest scenario weight (continuation wins by default without
 * gamma), the Brain mapped every chop to MEAN_REVERT_DAY, and crypto never got an ADX.
 */
import { describe, expect, it } from 'vitest';
import { computeCapitalFlowEngine, type CapitalFlowInput } from '@/lib/capitalFlowEngine';
import { computeRegimeEngine } from '@/lib/regime-engine';
import { cryptoDailyAdx, CRYPTO_ADX_MIN_BARS } from '@/lib/cryptoTrendMetrics';

const POWER_HOUR = new Date('2026-09-25T19:00:00Z');
const hs = [
  { strike: 340, openInterest: 9000, type: 'call' as const }, { strike: 335, openInterest: 7000, type: 'put' as const },
  { strike: 345, openInterest: 5000, type: 'call' as const }, { strike: 330, openInterest: 4000, type: 'put' as const },
];
const equity = (adx?: number): CapitalFlowInput => ({
  symbol: `EQ${adx ?? 'X'}`, marketType: 'equity', spot: 338, vwap: 337, atr: 5, now: POWER_HOUR,
  openInterest: { totalCallOI: 65000, totalPutOI: 42000, pcRatio: 42000 / 65000, expirationDate: '2026-10-02', highOIStrikes: hs },
  liquidityLevels: [{ level: 342, label: 'PDH' }, { level: 345, label: 'WEEK_HIGH' }, { level: 333, label: 'PDL' }],
  dataHealth: { freshness: 'EOD', fallbackActive: false },
  ...(adx !== undefined ? { trendMetrics: { adx } } : {}),
});
const crypto = (adx?: number): CapitalFlowInput => ({
  symbol: `SOL${adx ?? 'X'}`, marketType: 'crypto', spot: 200, atr: 4, now: POWER_HOUR,
  liquidityLevels: [{ level: 205, label: 'PDH' }, { level: 195, label: 'PDL' }],
  cryptoPositioning: {},
  dataHealth: { freshness: 'LIVE', fallbackActive: false },
  trendMetrics: { priceAboveTrend: undefined, ...(adx !== undefined ? { adx } : {}) },
});

describe('Brain regime: no trend is not mean reversion', () => {
  const base = { gammaState: 'Unavailable' as const, atrPercent: 1.5, expansionProbability: 50, dataHealthScore: 80 };
  it('chop → RANGE_DAY (was MEAN_REVERT_DAY); launch → TREND_DAY; a real gamma pin stays MEAN_REVERT_DAY', () => {
    expect(computeRegimeEngine({ ...base, marketMode: 'chop' }).regime).toBe('RANGE_DAY');
    expect(computeRegimeEngine({ ...base, marketMode: 'launch' }).regime).toBe('TREND_DAY');
    expect(computeRegimeEngine({ ...base, marketMode: 'pin', gammaState: 'Positive' }).regime).toBe('MEAN_REVERT_DAY');
    expect(computeRegimeEngine({ ...base, marketMode: 'chop', atrPercent: 0.5, expansionProbability: 30 }).regime).toBe('VOL_COMPRESSION');
  });
  it('the label change does not move the brain score', () => {
    const a = computeRegimeEngine({ ...base, marketMode: 'chop' });
    expect(a.score).toBe(30 + 30 + 18 + 10);
  });
});

describe('Capital Pressure labels agree with the measured trend', () => {
  it('equity ADX < 25: Mode chop, Regime NO TREND, Brain range day — no TRENDING / mean revert contradiction', () => {
    const r = computeCapitalFlowEngine(equity(18));
    expect(r.market_mode).toBe('chop');
    expect(r.probability_matrix.continuation).toBeGreaterThanOrEqual(r.probability_matrix.pinReversion);
    expect(r.probability_matrix.regime).toBe('NO_TREND');
    expect(r.probability_matrix.decision).toBe('wait_for_trend');
    expect(r.brain_decision_v1.market_regime.regime).toBe('range_day');
  });
  it('equity ADX ≥ 25: Mode launch, Regime TRENDING, Brain trend day', () => {
    const r = computeCapitalFlowEngine(equity(31));
    expect(r.market_mode).toBe('launch');
    expect(r.probability_matrix.regime).toBe('TRENDING');
    expect(r.probability_matrix.decision).toBe('allow_trend_setups');
    expect(['trend_day', 'vol_expansion']).toContain(r.brain_decision_v1.market_regime.regime);
  });
  it('no ADX at all: the continuation-led matrix reads MIXED (unknown), not TRENDING', () => {
    const r = computeCapitalFlowEngine(equity());
    expect(r.market_mode_basis).toBe('unknown_default_chop');
    expect(r.probability_matrix.regime).toBe('MIXED');
  });
  it('crypto with a daily ADX gets a measured mode like equities', () => {
    const trending = computeCapitalFlowEngine(crypto(34));
    expect(trending.market_mode_basis).toBe('price_structure_adx');
    expect(trending.market_mode).toBe('launch');
    expect(trending.probability_matrix.regime).toBe('TRENDING');
    const ranging = computeCapitalFlowEngine(crypto(15));
    expect(ranging.market_mode).toBe('chop');
    expect(ranging.probability_matrix.regime).not.toBe('TRENDING');
    expect(ranging.brain_decision_v1.market_regime.regime).not.toBe('mean_revert_day');
  });
});

describe('cryptoDailyAdx', () => {
  const DAY = 86_400_000;
  const now = Date.parse('2026-09-25T03:00:00Z');
  const rows = (n: number, step: number) => Array.from({ length: n }, (_, i) => {
    const t = Date.parse('2026-09-25T00:00:00Z') - (n - 1 - i) * DAY; // candle CLOSE times
    const c = 100 + i * step + Math.sin(i) * 0.5;
    return [t, c - step / 2, c + 1, c - 1, c];
  });
  it('a steady trend reads ADX ≥ 25; a flat series reads low', () => {
    expect(cryptoDailyAdx(rows(120, 2), now)!).toBeGreaterThanOrEqual(25);
    expect(cryptoDailyAdx(rows(120, 0), now)!).toBeLessThan(25);
  });
  it('drops candles that have not closed yet and returns undefined (not a default) on short history', () => {
    const r = rows(120, 2);
    const withFuture = [...r, [now + 6 * 3_600_000, 400, 900, 100, 150]];
    expect(cryptoDailyAdx(withFuture, now)).toBe(cryptoDailyAdx(r, now));
    expect(cryptoDailyAdx(rows(CRYPTO_ADX_MIN_BARS - 1, 2), now)).toBeUndefined();
    expect(cryptoDailyAdx(null, now)).toBeUndefined();
  });
});

describe('mix check across many inputs', () => {
  it('no input shows TRENDING next to chop, or mean revert day without a gamma pin', () => {
    let rows = 0; let contradictions = 0;
    for (const adx of [undefined, 10, 15, 20, 24, 26, 32, 45]) {
      for (const spot of [320, 330, 338, 342, 350]) {
        for (const pcr of [0.5, 0.8, 1, 1.3]) {
          for (const mk of ['equity', 'crypto'] as const) {
            const inp: CapitalFlowInput = mk === 'equity'
              ? { ...equity(adx), spot, openInterest: { ...equity().openInterest!, pcRatio: pcr, totalPutOI: 65000 * pcr } }
              : { ...crypto(adx), spot: spot / 1.69, cryptoPositioning: { fundingRate: (pcr - 1) / 20 } };
            const r = computeCapitalFlowEngine(inp);
            rows++;
            if (r.probability_matrix.regime === 'TRENDING' && r.market_mode !== 'launch') contradictions++;
            if (r.brain_decision_v1.market_regime.regime === 'mean_revert_day' && r.market_mode !== 'pin') contradictions++;
          }
        }
      }
    }
    expect(rows).toBe(320);
    expect(contradictions).toBe(0);
  });
});
