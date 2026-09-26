/**
 * MV-3: options gamma into Terminal → Capital Pressure. The signed dealer-gamma estimate is built from the chain the
 * Capital Pressure run already fetched (no extra provider calls) and replaces the hard-wired 'Unavailable'.
 */
import { describe, expect, it } from 'vitest';
import { computeCapitalFlowEngine, type CapitalFlowInput } from '@/lib/capitalFlowEngine';
import { CRYPTO_DEALER_GAMMA_REASON, dealerGammaFromAnalysis, describeGammaInput, type DealerGammaInput } from '@/lib/options/dealerGammaInput';

// Fri 25 Sep 2026 10:30 ET (MORNING_SESSION); the previous session is Thu 24 Sep.
const MORNING = new Date('2026-09-25T14:30:00Z');
const NOW_MS = MORNING.getTime();

/** Chain around spot 100: puts dominate at 90/95, calls from 100 up, so net GEX flips sign between 95 and 100. */
function gexStrikes(scale = 1) {
  const rows: Array<{ strike: number; openInterest: number; type: 'call' | 'put'; gamma: number; delta: number }> = [];
  for (const k of [90, 95, 100, 105, 110]) {
    rows.push({ strike: k, type: 'call', openInterest: (k >= 100 ? 100_000 : 20_000) * scale, gamma: 0.05, delta: 0.5 });
    rows.push({ strike: k, type: 'put', openInterest: (k <= 95 ? 200_000 : 10_000) * scale, gamma: 0.05, delta: -0.5 });
  }
  return rows;
}
const analysis = (over: Record<string, unknown> = {}) => ({
  currentPrice: 100,
  openInterestAnalysis: { expirationDate: '2026-10-02', gexStrikes: gexStrikes() },
  dataQuality: { freshness: 'EOD', lastUpdated: '2026-09-24', greeksModel: 'api' },
  ...over,
});

describe('dealerGammaFromAnalysis (existing chain → signed gamma input)', () => {
  it('estimates net dealer GEX, the gamma flip and call/put walls, with as-of and source', () => {
    const g = dealerGammaFromAnalysis(analysis(), NOW_MS);
    if (g.state !== 'available') throw new Error(g.reason);
    // calls: 3 × (100k × 0.05 × 100 × 100² × 1%) = $150M + 2 × $10M; puts: −(2 × $100M + 3 × $5M) → net −$45M
    expect(g.netGexUsd).toBe(-45_000_000);
    expect(g.regime).toBe('NEUTRAL');
    expect(g.gammaFlip).toBeGreaterThan(95);
    expect(g.gammaFlip).toBeLessThan(100);
    expect(g.callWall).toBe(100);
    expect(g.putWall).toBe(90);
    expect(g).toMatchObject({ source: 'previous_session', asOf: '2026-09-24', expiration: '2026-10-02', strikesUsed: 5, greeks: 'api' });
    expect(g.convention).toMatch(/not verified dealer positioning/);
  });

  it('classifies long and short dealer gamma from the sign and size of net GEX', () => {
    const long = dealerGammaFromAnalysis(analysis({ openInterestAnalysis: { expirationDate: '2026-10-02', gexStrikes: gexStrikes().filter((r) => r.type === 'call') } }), NOW_MS);
    const short = dealerGammaFromAnalysis(analysis({ openInterestAnalysis: { expirationDate: '2026-10-02', gexStrikes: gexStrikes().filter((r) => r.type === 'put') } }), NOW_MS);
    expect(long.state === 'available' && long.regime).toBe('LONG_GAMMA');
    expect(short.state === 'available' && short.regime).toBe('SHORT_GAMMA');
  });

  it('labels a realtime chain as realtime and model greeks as model', () => {
    const g = dealerGammaFromAnalysis(analysis({ dataQuality: { freshness: 'REALTIME', lastUpdated: '2026-09-25', greeksModel: 'black_scholes_european' } }), NOW_MS);
    expect(g).toMatchObject({ state: 'available', source: 'realtime', asOf: '2026-09-25', greeks: 'model' });
  });

  it('is unavailable, with the reason, when the chain cannot support an estimate', () => {
    expect(dealerGammaFromAnalysis(null, NOW_MS)).toEqual({ state: 'unavailable', reason: 'options analysis unavailable' });
    expect(dealerGammaFromAnalysis(analysis({ openInterestAnalysis: null }), NOW_MS)).toEqual({ state: 'unavailable', reason: 'no usable options chain for this symbol' });
    expect(dealerGammaFromAnalysis(analysis({ currentPrice: 0 }), NOW_MS)).toEqual({ state: 'unavailable', reason: 'underlying price unavailable' });
    expect(dealerGammaFromAnalysis(analysis({ dataQuality: { freshness: 'EOD', lastUpdated: '2026-09-21' } }), NOW_MS))
      .toEqual({ state: 'unavailable', reason: 'options chain is from 2026-09-21, older than the previous session' });
    expect(dealerGammaFromAnalysis(analysis({ dataQuality: { freshness: 'STALE', lastUpdated: 'UNKNOWN_EOD' } }), NOW_MS))
      .toEqual({ state: 'unavailable', reason: 'options chain freshness is STALE (no dated chain)' });
    const thin = gexStrikes().filter((r) => r.strike <= 95);
    expect(dealerGammaFromAnalysis(analysis({ openInterestAnalysis: { expirationDate: '2026-10-02', gexStrikes: thin } }), NOW_MS))
      .toEqual({ state: 'unavailable', reason: 'only 2 strikes with open interest and gamma in the 2026-10-02 expiry (need 4)' });
    const noGamma = gexStrikes().map((r) => ({ ...r, gamma: 0 }));
    expect(dealerGammaFromAnalysis(analysis({ openInterestAnalysis: { expirationDate: '2026-10-02', gexStrikes: noGamma } }), NOW_MS).state).toBe('unavailable');
  });
});

// ── Engine ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SPOT = 500;
type Side = 'bullish' | 'bearish';
const mirror = (level: number, side: Side) => (side === 'bullish' ? level : Number((2 * SPOT - level).toFixed(2)));
// A fresh symbol per run: the engine keeps per-symbol history for the expansion/trend deltas.
let runId = 0;
function equityInput(side: Side, dealerGamma?: DealerGammaInput, adx?: number): CapitalFlowInput {
  const hs: Array<{ strike: number; openInterest: number; type: 'call' | 'put'; iv: number }> = [];
  for (const offset of [-20, -10, -5, 0, 5, 10, 20]) {
    const strike = mirror(SPOT + offset, side);
    hs.push({ strike, type: side === 'bullish' ? 'call' : 'put', openInterest: 4000 - Math.abs(offset) * 50, iv: 0.22 });
    hs.push({ strike, type: side === 'bullish' ? 'put' : 'call', openInterest: 1500 - Math.abs(offset) * 20, iv: 0.22 });
  }
  const calls = hs.filter((s) => s.type === 'call').reduce((a, s) => a + s.openInterest, 0);
  const puts = hs.filter((s) => s.type === 'put').reduce((a, s) => a + s.openInterest, 0);
  return {
    symbol: `${side === 'bullish' ? 'BULL' : 'BEAR'}${++runId}`, marketType: 'equity', spot: SPOT, now: MORNING,
    vwap: mirror(SPOT * 0.996, side), atr: SPOT * 0.012,
    openInterest: { totalCallOI: calls, totalPutOI: puts, pcRatio: puts / calls, expirationDate: '2026-10-02', highOIStrikes: hs },
    liquidityLevels: [
      { level: mirror(SPOT * 1.01, side), label: 'PDH' }, { level: mirror(SPOT * 0.988, side), label: 'PDL' },
      { level: mirror(SPOT * 1.018, side), label: 'WEEK_HIGH' }, { level: mirror(SPOT * 0.97, side), label: 'WEEK_LOW' },
    ],
    trendMetrics: adx !== undefined ? { adx } : undefined,
    dataHealth: { freshness: 'EOD', fallbackActive: false, lastUpdatedIso: '2026-09-24' },
    dealerGamma,
  };
}
const gamma = (regime: 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEUTRAL'): DealerGammaInput => ({
  state: 'available', regime, netGexUsd: regime === 'LONG_GAMMA' ? 900_000_000 : regime === 'SHORT_GAMMA' ? -900_000_000 : 10_000_000,
  gammaFlip: 497.5, callWall: 510, putWall: 490, expiration: '2026-10-02', strikesUsed: 14, asOf: '2026-09-24',
  source: 'previous_session', greeks: 'api', convention: 'Estimate from open interest under the standard convention.',
});
const tps = (r: ReturnType<typeof computeCapitalFlowEngine>) => r.flow_trade_permission.tps;

describe('Capital Pressure with a signed gamma input', () => {
  it('positive dealer gamma → gamma_state Positive, pin mode (basis gamma), levels and source reported', () => {
    const r = computeCapitalFlowEngine(equityInput('bullish', gamma('LONG_GAMMA'), 30));
    expect(r.gamma_state).toBe('Positive');
    expect(r.market_mode).toBe('pin');
    expect(r.market_mode_basis).toBe('gamma');
    expect(r.data_health.missing_inputs).not.toContain('dealer_gamma');
    expect(r.gamma_input).toMatchObject({ status: 'available', reason: null, net_gex_usd: 900_000_000, gamma_flip: 497.5, call_wall: 510, put_wall: 490, as_of: '2026-09-24', source: 'previous_session' });
  });

  it('negative dealer gamma → gamma_state Negative, launch mode even without an ADX trend', () => {
    const r = computeCapitalFlowEngine(equityInput('bullish', gamma('SHORT_GAMMA'), 12));
    expect(r.gamma_state).toBe('Negative');
    expect(r.market_mode).toBe('launch');
    expect(r.market_mode_basis).toBe('gamma');
  });

  it('near-zero net gamma → Mixed; market mode still comes from ADX', () => {
    const r = computeCapitalFlowEngine(equityInput('bullish', gamma('NEUTRAL'), 30));
    expect(r.gamma_state).toBe('Mixed');
    expect(r.market_mode).toBe('launch');
    expect(r.market_mode_basis).toBe('price_structure_adx');
  });

  it('an unavailable chain changes nothing in the scores and reports its reason', () => {
    const none = computeCapitalFlowEngine(equityInput('bullish', undefined, 30));
    const un = computeCapitalFlowEngine(equityInput('bullish', { state: 'unavailable', reason: 'no usable options chain for this symbol' }, 30));
    expect(un.gamma_state).toBe('Unavailable');
    expect(un.gamma_input).toMatchObject({ status: 'unavailable', reason: 'no usable options chain for this symbol', net_gex_usd: null });
    expect(un.data_health.missing_inputs).toContain('dealer_gamma');
    expect(tps(un)).toBe(tps(none));
    expect(un.conviction).toBe(none.conviction);
    expect(un.probability_matrix).toEqual(none.probability_matrix);
    expect(none.gamma_input.reason).toBe('dealer gamma not supplied to this view');
  });

  it('crypto stays Unavailable with an honest reason, even if a gamma object is passed', () => {
    const r = computeCapitalFlowEngine({
      symbol: 'BTC-USD', marketType: 'crypto', spot: 60000, vwap: 59800, atr: 1500, now: MORNING,
      cryptoPositioning: { fundingRate: 0.01, oiChangePercent: 2, longShortRatio: 1.1 },
      dataHealth: { freshness: 'LIVE', fallbackActive: false }, dealerGamma: gamma('LONG_GAMMA'),
    });
    expect(r.gamma_state).toBe('Unavailable');
    expect(r.gamma_input.reason).toBe(CRYPTO_DEALER_GAMMA_REASON);
  });

  for (const regime of ['LONG_GAMMA', 'SHORT_GAMMA', 'NEUTRAL'] as const) {
    it(`bullish and mirrored bearish setups score the same with ${regime}`, () => {
      const bull = computeCapitalFlowEngine(equityInput('bullish', gamma(regime), 30));
      const bear = computeCapitalFlowEngine(equityInput('bearish', gamma(regime), 30));
      expect(bull.bias).toBe('bullish');
      expect(bear.bias).toBe('bearish');
      expect(bear.gamma_state).toBe(bull.gamma_state);
      expect(bear.market_mode).toBe(bull.market_mode);
      expect(tps(bear)).toBe(tps(bull));
      expect(bear.conviction).toBe(bull.conviction);
      expect(bear.probability_matrix.raw).toEqual(bull.probability_matrix.raw);
    });
  }
});

describe('describeGammaInput (Gamma tile line)', () => {
  it('shows the estimate with levels, as-of and source, or "Unavailable (reason)"', () => {
    const r = computeCapitalFlowEngine(equityInput('bullish', gamma('SHORT_GAMMA'), 30));
    expect(describeGammaInput(r.gamma_input)).toBe('Net dealer GEX −$900.0M (estimate) · flip 497.5 · call wall 510 / put wall 490 · previous-session chain 2026-09-24, 2026-10-02 expiry');
    const rt = { ...r.gamma_input, source: 'realtime' as const, as_of: '2026-09-25', greeks: 'model' as const };
    expect(describeGammaInput(rt)).toContain('realtime chain 2026-09-25, 2026-10-02 expiry, model greeks');
    const un = computeCapitalFlowEngine(equityInput('bullish', { state: 'unavailable', reason: 'no usable options chain for this symbol' }));
    expect(describeGammaInput(un.gamma_input)).toBe('Unavailable (no usable options chain for this symbol)');
    expect(describeGammaInput(undefined)).toBe('Unavailable (no gamma input in this response)');
  });
});
