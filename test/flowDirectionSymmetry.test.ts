import { describe, it, expect } from 'vitest';
import { computeCapitalFlowEngine, type CapitalFlowInput } from '@/lib/capitalFlowEngine';
import { computeInstitutionalFlowState, type InstitutionalFlowStateInput } from '@/lib/institutional-flow-state-engine';

/**
 * Regression: MSP publishes bearish plays, so a clean bearish setup must score like its bullish mirror.
 * Before the fix:
 *  - trendMetrics.emaAligned was fed "price above EMA200/VWAP" by every caller, so bearish setups (price below)
 *    always scored as "not aligned" in regimeScore/trendStructure, and structureHigherHighs had no bearish twin;
 *  - the flow-state engine counted bullish flow acceleration as POSITIONING and bearish acceleration as EXHAUSTION;
 *  - no open interest within ±1% of spot gave pcrBand = 0, i.e. a call-heavy read → bullish bias from missing data;
 *  - missing trend/structure inputs scored at the minimum instead of neutral.
 */

// 01:42 ET on Fri 25 Sep 2026 (3:42 PM AEST) — equities PRE_MARKET, when COST/ADBE were observed at TPS 56.
const PRE_MARKET = new Date('2026-09-25T05:42:00Z');
// 10:30 ET — MORNING_SESSION.
const MORNING = new Date('2026-09-25T14:30:00Z');
const SPOT = 896.48;

type Side = 'bullish' | 'bearish';

/** Mirror a price level around spot for the bearish twin. */
const mirror = (level: number, side: Side) => (side === 'bullish' ? level : Number((2 * SPOT - level).toFixed(2)));

/** AV-shaped highOIStrikes (analyzeOpenInterest output): heavy side near spot follows the bias, mirrored for bears. */
function strikes(side: Side) {
  const out: Array<{ strike: number; openInterest: number; volume: number; type: 'call' | 'put'; iv: number }> = [];
  for (const offset of [-40, -20, -10, -5, 0, 5, 10, 20, 40]) {
    const strike = Number((SPOT + offset).toFixed(2));
    const heavy = 4000 - Math.abs(offset) * 50;
    const light = 1500 - Math.abs(offset) * 20;
    out.push({ strike: mirror(strike, side), type: side === 'bullish' ? 'call' : 'put', openInterest: heavy, volume: 100, iv: 0.22 });
    out.push({ strike: mirror(strike, side), type: side === 'bullish' ? 'put' : 'call', openInterest: light, volume: 100, iv: 0.22 });
  }
  return out;
}

function input(side: Side, symbol: string, now: Date, trendMetrics?: CapitalFlowInput['trendMetrics']): CapitalFlowInput {
  const hs = strikes(side);
  const calls = hs.filter((s) => s.type === 'call').reduce((a, s) => a + s.openInterest, 0);
  const puts = hs.filter((s) => s.type === 'put').reduce((a, s) => a + s.openInterest, 0);
  return {
    symbol,
    marketType: 'equity',
    spot: SPOT,
    vwap: mirror(SPOT * 0.996, side),
    atr: SPOT * 0.2 * Math.sqrt(8 / 365),
    openInterest: { totalCallOI: calls, totalPutOI: puts, pcRatio: puts / calls, expirationDate: '2026-10-02', highOIStrikes: hs },
    liquidityLevels: [
      { level: mirror(SPOT * 1.01, side), label: 'PDH' },
      { level: mirror(SPOT * 0.988, side), label: 'PDL' },
      { level: mirror(SPOT * 1.018, side), label: 'WEEK_HIGH' },
      { level: mirror(SPOT * 0.97, side), label: 'WEEK_LOW' },
    ],
    trendMetrics,
    dataHealth: { freshness: 'EOD', fallbackActive: false, lastUpdatedIso: '2026-09-24' },
    now,
  };
}

function scoreOf(r: ReturnType<typeof computeCapitalFlowEngine>) {
  return {
    tps: r.flow_trade_permission.tps,
    blocked: r.flow_trade_permission.blocked,
    conviction: r.conviction,
    factors: r.conviction_factors,
    matrix: [r.probability_matrix.continuation, r.probability_matrix.pinReversion, r.probability_matrix.expansion],
    raw: r.probability_matrix.raw,
    state: r.flow_state.state,
  };
}

describe('capital flow scores are direction-symmetric', () => {
  it('flow-route inputs (no trendMetrics): bullish and mirrored bearish setups get identical scores', () => {
    for (const now of [PRE_MARKET, MORNING]) {
      const bull = computeCapitalFlowEngine(input('bullish', `SYMA${now.getTime()}`, now));
      const bear = computeCapitalFlowEngine(input('bearish', `SYMB${now.getTime()}`, now));
      expect(bull.bias).toBe('bullish');
      expect(bear.bias).toBe('bearish');
      expect(scoreOf(bear)).toEqual(scoreOf(bull));
    }
  });

  it('scanner-style trendMetrics: price below EMA200 + lower lows supports a bearish bias like above + higher highs supports a bullish one', () => {
    const bull = computeCapitalFlowEngine(input('bullish', 'SCANA', MORNING, { adx: 28, priceAboveTrend: true, structureHigherHighs: true, structureLowerLows: false }));
    const bear = computeCapitalFlowEngine(input('bearish', 'SCANB', MORNING, { adx: 28, priceAboveTrend: false, structureHigherHighs: false, structureLowerLows: true }));
    expect(scoreOf(bear)).toEqual(scoreOf(bull));
    // Trend opposing the bias still costs the same on either side.
    const bullAgainst = computeCapitalFlowEngine(input('bullish', 'SCANC', MORNING, { adx: 28, priceAboveTrend: false, structureHigherHighs: false, structureLowerLows: true }));
    const bearAgainst = computeCapitalFlowEngine(input('bearish', 'SCAND', MORNING, { adx: 28, priceAboveTrend: true, structureHigherHighs: true, structureLowerLows: false }));
    expect(scoreOf(bearAgainst)).toEqual(scoreOf(bullAgainst));
    expect(bear.conviction_factors.regime).toBeGreaterThan(bearAgainst.conviction_factors.regime);
  });

  it('flow-state engine: flow accelerating with a bearish bias is positioning, not exhaustion (mirror of bullish)', () => {
    const base: Omit<InstitutionalFlowStateInput, 'symbol' | 'bias' | 'flow'> = {
      marketType: 'equity',
      probabilities: { trend: 45, pin: 22, expansion: 33 },
      probabilityShift: { deltaTrend: 0, deltaExpansion: 4 },
      structure: { trendStructure: 60, vwapSlope: 0, breakoutPressure: 58 },
      liquidity: { currentPrice: 100 },
      volatility: { compressionScore: 65, atrExpansionRate: 40 },
      dataHealth: { freshnessScore: 70 },
    };
    const bull = computeInstitutionalFlowState({ ...base, symbol: 'IFSEA', bias: 'bullish', flow: { flowImbalanceShort: 40, flowImbalanceLong: 5 } });
    const bear = computeInstitutionalFlowState({ ...base, symbol: 'IFSEB', bias: 'bearish', flow: { flowImbalanceShort: -40, flowImbalanceLong: -5 } });
    expect(bear.stateProbabilities).toEqual(bull.stateProbabilities);
    expect(bear.state).toBe(bull.state);
    expect(bear.stateProbabilities.positioning).toBeGreaterThan(bear.stateProbabilities.exhaustion);
  });
});

describe('missing inputs are neutral and flagged, never a directional or bad signal', () => {
  it('no open interest within ±1% of spot does not read as call-heavy (bullish)', () => {
    const r = computeCapitalFlowEngine({
      symbol: 'NOBAND',
      marketType: 'equity',
      spot: SPOT,
      vwap: SPOT * 0.996, // price above VWAP: the old pcrBand = 0 path returned 'bullish' here
      openInterest: {
        totalCallOI: 8000, totalPutOI: 8000, pcRatio: 1, expirationDate: '2026-10-02',
        highOIStrikes: [
          { strike: 850, type: 'put', openInterest: 5000, volume: 1, iv: 0.22 },
          { strike: 950, type: 'call', openInterest: 5000, volume: 1, iv: 0.22 },
        ],
      },
      dataHealth: { freshness: 'EOD', fallbackActive: false, lastUpdatedIso: '2026-09-24' },
      now: MORNING,
    });
    expect(r.bias).toBe('neutral');
    expect(r.data_health.missing_inputs).toContain('near_spot_open_interest');
  });

  it('unknown price structure scores between a confirmed and a failed structure, and is flagged', () => {
    const raw = (tm: CapitalFlowInput['trendMetrics'], sym: string) => computeCapitalFlowEngine(input('bearish', sym, MORNING, tm));
    const missing = raw({ priceAboveTrend: false }, 'STRUCT0');
    const confirmed = raw({ priceAboveTrend: false, structureLowerLows: true }, 'STRUCT1');
    const failed = raw({ priceAboveTrend: false, structureLowerLows: false }, 'STRUCT2');
    expect(missing.probability_matrix.raw.continuation).toBeGreaterThan(failed.probability_matrix.raw.continuation);
    expect(missing.probability_matrix.raw.continuation).toBeLessThan(confirmed.probability_matrix.raw.continuation);
    expect(missing.data_health.missing_inputs).toContain('price_structure');
    expect(confirmed.data_health.missing_inputs).not.toContain('price_structure');
  });

  it('flow route (no trendMetrics): trend alignment falls back to spot vs VWAP in both regime and trend-structure scores', () => {
    const r = computeCapitalFlowEngine(input('bearish', 'FALLBACK', MORNING));
    const explicit = computeCapitalFlowEngine(input('bearish', 'EXPLICIT', MORNING, { priceAboveTrend: false }));
    expect(r.probability_matrix.raw.continuation).toBe(explicit.probability_matrix.raw.continuation);
    expect(r.conviction_factors.regime).toBe(explicit.conviction_factors.regime);
    expect(r.data_health.missing_inputs).toEqual(expect.arrayContaining(['dealer_gamma', 'trend_reference', 'price_structure', 'adx']));
  });
});
