/**
 * Fixes 5, 6, 7 — no rule may fire off a made-up value, and long/short stay symmetric:
 *  5. IV rank has no history → null end-to-end (was a hard-coded 50).
 *  6. Missing max pain stays null (was "max pain = current price" → DVE awarded 20/20 gamma wall / gamma lock).
 *  7. High volume vs open interest has no buy/sell side → never a bullish/bearish vote, never points for both sides.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const m = vi.hoisted(() => {
  process.env.ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'test-key';
  return { av: {} as Record<string, unknown> };
});
vi.mock('@/lib/redis', () => ({ getCached: vi.fn(async () => null), setCached: vi.fn(async () => true), CACHE_KEYS: { bars: (s: string) => `bars:${s}` }, CACHE_TTL: {} }));
vi.mock('@/lib/avRateGovernor', () => ({
  avTakeToken: vi.fn(async () => undefined),
  avFetch: vi.fn(async (url: string) => m.av[new URL(url).searchParams.get('function') || ''] ?? null),
}));

import { calculateCompositeScore, detectUnusualActivity, measuredIvRank } from '../lib/options-confluence-analyzer';
import { fetchOptionsSnapshot } from '../lib/goldenEggFetchers';
import { clearSharedOptionsChainCache } from '../lib/options/chainCache';
import { computeBreakoutReadiness, detectVolatilityTrap } from '../lib/directionalVolatilityEngine';
import { computeFlowScore } from '../lib/goldenEgg/engine';
import { calculateOptionsProbability } from '../lib/signals/probability-engine';

beforeEach(() => { m.av = {}; clearSharedOptionsChainCache(); });

const ivNoHistory = { currentIV: 0.3, ivRank: null, ivRankHeuristic: null, ivPercentile: null, ivSignal: 'neutral' as const, ivReason: 'no history' };

describe('5. IV rank stays null (no fake 50)', () => {
  it('measuredIvRank only returns a measured value', () => {
    expect(measuredIvRank(null)).toBeNull();
    expect(measuredIvRank(ivNoHistory)).toBeNull();
    expect(measuredIvRank({ ivRank: 82 })).toBe(82);
  });

  it('analyzer composite: unknown IV rank adds no IV Environment points; a measured one does', () => {
    const none = calculateCompositeScore({} as any, null, null, ivNoHistory as any, null);
    expect(none.components.find((c) => c.name === 'IV Environment')).toBeUndefined();
    const high = calculateCompositeScore({} as any, null, null, { ...ivNoHistory, ivRank: 85 } as any, null);
    expect(high.components.find((c) => c.name === 'IV Environment')).toBeDefined();
    expect(none.conflicts.join(' ')).not.toMatch(/HIGH IV/);
  });

  it('Golden Egg / DVE options snapshot: ivRank null, not 50', async () => {
    const row = (type: 'call' | 'put', k: number) => ({ contractID: `XYZ${type}${k}`, symbol: 'XYZ', expiration: '2030-01-18', strike: String(k), type, open_interest: '1000', volume: '10', implied_volatility: '0.3', date: '2026-09-25' });
    m.av = { REALTIME_OPTIONS: { data: [95, 100, 105].flatMap((k) => [row('call', k), row('put', k)]) } };
    const snap = await fetchOptionsSnapshot('XYZ', 100);
    expect(snap?.ivRank).toBeNull();
    expect(snap?.maxPain).toBe(100);
  });
});

describe('6. missing max pain is not "price is at max pain"', () => {
  it('snapshot keeps maxPain null when the chain cannot establish it', async () => {
    const row = (type: 'call' | 'put') => ({ contractID: `XYZ${type}`, symbol: 'XYZ', expiration: '2030-01-18', strike: 'n/a', type, open_interest: '1000', volume: '10', implied_volatility: '0.3', date: '2026-09-25' });
    m.av = { REALTIME_OPTIONS: { data: [row('call'), row('put')] } };
    const snap = await fetchOptionsSnapshot('XYZ', 100);
    expect(snap).not.toBeNull();
    expect(snap?.maxPain).toBeNull();
  });

  const volState = { bbwp: 10, bbwpSma5: 10, regime: 'compression', regimeConfidence: 80, rateOfChange: 0, rateSmoothed: 0, acceleration: 0, rateDirection: 'flat', inSqueeze: false, squeezeStrength: 0 } as any;

  it('DVE gamma wall: no points without max pain; points only for a real nearby max pain', () => {
    const none = computeBreakoutReadiness(volState, { price: { currentPrice: 100 }, options: { maxPain: null } } as any);
    expect(none.components.gammaWall).toBe(0);
    const real = computeBreakoutReadiness(volState, { price: { currentPrice: 100 }, options: { maxPain: 100.5 } } as any);
    expect(real.components.gammaWall).toBe(20);
  });

  it('DVE gamma lock: not detected without max pain (even with an OI strike at spot)', () => {
    const none = detectVolatilityTrap(volState, { maxPain: null, highestOICallStrike: 100, highestOIPutStrike: 100 } as any, undefined, 100);
    expect(none.gammaLockDetected).toBe(false);
    const real = detectVolatilityTrap(volState, { maxPain: 100, highestOICallStrike: 110, highestOIPutStrike: 90 } as any, undefined, 100);
    expect(real.gammaLockDetected).toBe(true);
  });
});

describe('7. high volume vs open interest is info only (symmetric)', () => {
  const contract = (type: 'call' | 'put', k: number, volume: number) => ({ strike: String(k), type, volume: String(volume), open_interest: '500', bid: '1.00', ask: '1.10', mark: '1.05', implied_volatility: '0.3' });
  const heavyCalls = { calls: [contract('call', 100, 3000), contract('call', 102, 2500)], puts: [contract('put', 98, 100)] };
  const heavyPuts = { calls: [contract('call', 102, 100)], puts: [contract('put', 100, 3000), contract('put', 98, 2500)] };

  it('detectUnusualActivity describes the tilt but never calls it bullish/bearish', () => {
    const c = detectUnusualActivity(heavyCalls.calls as any, heavyCalls.puts as any, 100);
    const p = detectUnusualActivity(heavyPuts.calls as any, heavyPuts.puts as any, 100);
    expect(c.hasUnusualActivity).toBe(true);
    expect(c.volumeTilt).toBe('calls');
    expect(p.volumeTilt).toBe('puts');
    expect(c.smartMoneyDirection).toBe('neutral');
    expect(p.smartMoneyDirection).toBe('neutral');
  });

  it('composite direction is identical for call-heavy and put-heavy volume (no vote)', () => {
    const c = calculateCompositeScore({} as any, null, detectUnusualActivity(heavyCalls.calls as any, heavyCalls.puts as any, 100), null, null);
    const p = calculateCompositeScore({} as any, null, detectUnusualActivity(heavyPuts.calls as any, heavyPuts.puts as any, 100), null, null);
    expect(c.directionScore).toBe(p.directionScore);
    const info = c.components.find((x) => x.name === 'High volume vs open interest');
    expect(info).toMatchObject({ direction: 'neutral', weight: 0, score: 0 });
    expect(c.components.find((x) => x.name === 'Unusual Activity')).toBeUndefined();
  });

  it('Golden Egg flow score: unusual volume adds nothing to LONG or SHORT', () => {
    const opts = (unusualActivity: string) => ({
      putCallRatio: 1.0, ivRank: null, maxPain: null, unusualActivity, sentiment: 'neutral', highestOICallStrike: null, highestOIPutStrike: null,
      totalCallOI: 1000, totalPutOI: 1000, dealerGamma: 'Unavailable', canonical: { expiry: '2030-01-18', quality: { level: 'OK' } },
    }) as any;
    for (const dir of ['LONG', 'SHORT'] as const) {
      expect(computeFlowScore(opts('Very High'), null, null, dir).score).toBe(computeFlowScore(opts('Normal'), null, null, dir).score);
      expect(computeFlowScore(opts('Elevated'), null, null, dir).score).toBe(50);
    }
    expect(computeFlowScore(opts('Very High'), null, null, 'LONG').notes.join(' ')).toMatch(/high volume vs open interest/);
  });

  it('Options Confluence win-probability: unusual volume contributes nothing either way', () => {
    const signals = { unusualActivity: { triggered: true, confidence: 0.95, callPremium: 900000, putPremium: 1000, alertLevel: 'high' as const } };
    const long = calculateOptionsProbability(signals as any, 'bullish');
    const short = calculateOptionsProbability(signals as any, 'bearish');
    expect(long.winProbability).toBe(short.winProbability);
    expect(long.components.find((c) => c.name === 'High volume vs open interest')).toMatchObject({ direction: 'neutral', contribution: 0 });
  });
});
