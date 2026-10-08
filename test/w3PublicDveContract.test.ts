/**
 * W3 acceptance, Volatility endpoint (/api/dve): the route serializes the public Volatility contract
 * (lib/research/publicDve), built leaf by leaf. The real engine runs on a synthetic series; its reading is then loaded
 * with canaries and the engine's own private texts in every nested family (direction, scores, probabilities, price
 * stop, next-regime guess, score-derived flags, engine summary). The COMPLETE serialized body is checked on the cold
 * and the cached path. Providers are fakes; no network.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ session: { workspaceId: 'ws-a', tier: 'pro' } as any, paid: true, computeCalls: 0, last: null as any }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => h.paid }));
vi.mock('@/lib/coingecko', () => ({ getAggregatedFundingRates: vi.fn(async () => []), getAggregatedOpenInterest: vi.fn(async () => []) }));
vi.mock('@/lib/research/priceEvidence', async (orig) => ({ ...(await orig<typeof import('@/lib/research/priceEvidence')>()), priceEvidenceFromSeries: vi.fn(() => null) }));
vi.mock('@/lib/goldenEggFetchers', async (orig) => {
  const closes = Array.from({ length: 320 }, (_, i) => 100 + Math.sin(i / 7) * 3 + i * 0.02);
  return {
    ...(await orig<typeof import('@/lib/goldenEggFetchers')>()),
    fetchPrice: vi.fn(async () => ({ price: closes.at(-1), changePct: 0.4, volume: 1e6, avgVolume: 9e5, historicalCloses: closes, historicalOpens: closes, historicalHighs: closes.map((c) => c + 1), historicalLows: closes.map((c) => c - 1), lastCompletedBarAt: '2026-10-06T20:00:00Z', barInterval: 'daily' })),
    fetchMPE: vi.fn(async () => null), fetchIndicators: vi.fn(async () => null), fetchOptionsSnapshot: vi.fn(async () => null),
  };
});
vi.mock('@/lib/directionalVolatilityEngine', async (orig) => {
  const real = await orig<typeof import('@/lib/directionalVolatilityEngine')>();
  return {
    ...real,
    computeDVE: vi.fn((input: any, symbol: string) => {
      h.computeCalls++;
      const r: any = real.computeDVE(input, symbol);
      r.volatility.regimeConfidence = 91; r.volatility.canary = 'CANARY-VOL';
      r.direction = { score: 88, bias: 'bullish', confidence: 74, components: { stochasticMomentum: 12, trendStructure: 20, optionsFlow: 8, volumeExpansion: 0, dealerGamma: 0, fundingRate: 0, marketBreadth: 0 }, componentDetails: ['P/C < 0.7 call-heavy (+8)', 'CANARY-DIR'] };
      r.directionalVolatility = { magnitude: 3, bias: 'up', confidence: 71 };
      r.phasePersistence.contraction.continuationProbability = 73; r.phasePersistence.contraction.exitProbability = 27; r.phasePersistence.contraction.stats.canary = 'CANARY-PH';
      r.signal = { type: 'compression_release_up', state: 'fired', active: true, strength: 81, triggerBarPrice: 106.5, triggerBarOpen: 105, triggerBarHigh: 107, triggerBarLow: 104, triggerReason: ['BBWP broke above 15', 'Stoch momentum bullish (+12)', 'Direction: bullish (+42)'], canary: 'CANARY-SIG' };
      r.invalidation = { priceInvalidation: 123.45, phaseInvalidation: 15, smoothedPhaseInvalidation: 15, invalidated: false, invalidationMode: 'extreme', ruleSet: ['Price below signal bar low (123.45)', 'BBWP re-enters below 15', 'BBWP SMA5 re-enters below 15'] };
      r.projection = { signalType: 'compression_release_up', expectedMovePct: 2.1, medianMovePct: 1.4, maxHistoricalMovePct: 6.2, averageBarsToMove: 9.5, hitRate: 62.5, sampleSize: 8, dispersionPct: 3.3, projectionQuality: 'low', projectionQualityScore: 64, projectionWarning: '', canary: 'CANARY-PROJ' };
      r.breakout = { score: 100, label: 'READY', components: { volCompression: 40, timeAlignment: 0, gammaWall: 20, adxRising: 10 }, componentDetails: ['BBWP < 15: extreme compression (40/40)', 'Time cluster 12/30 (display only; not included in score)'] };
      r.trap = { detected: false, candidate: true, score: 55, components: ['BBWP 12 compressed (+25)'], compressionLevel: 12, gammaLockDetected: false, timeClusterApproaching: true };
      r.exhaustion = { level: 77, label: 'HIGH', signals: ['StochK 88 > 80'] };
      r.transition = { from: 'compression', to: 'expansion', probability: 60, trigger: 'BBWP accelerating toward 15' };
      r.flags = ['BREAKOUT_WATCH', 'EXPANSION_UP', 'CONTRACTION_EXIT_RISK', 'TRAP_CANDIDATE', 'SIGNAL_UP'];
      r.dataQuality.canary = 'CANARY-DQ';
      r.summary = 'X BBWP at 12. Stochastic momentum bullish (+12). Invalidation: below $123.45.';
      h.last = r;
      return r;
    }),
  };
});
import { GET } from '@/app/api/dve/route';

const FORBIDDEN_KEYS = /^(direction|directionalVolatility|transition|score|scores|confidence|regimeConfidence|bias|magnitude|probability|continuationProbability|exitProbability|strength|priceInvalidation|hitRate|projectionQuality|projectionQualityScore|level|components|componentDetails|compressionLevel|canary)$/;
const PRIVATE_TEXT = /CANARY|123\.45|\(\s*[+-]?\d+(\.\d+)?\s*\)|\b\d+\s*\/\s*\d+\b|\bbullish\b|\bbearish\b|Direction:|BREAKOUT_WATCH|EXPANSION_UP|EXIT_RISK|READY|probabilit|ws-a/i;
function keyPaths(v: any, path = '', out: string[] = []): string[] {
  if (Array.isArray(v)) { v.forEach((x) => keyPaths(x, `${path}[]`, out)); return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(`${path}.${k}`); keyPaths(x, `${path}.${k}`, out); }
  return out;
}
let n = 0;
const call = async (sym?: string) => { const r = await GET(new NextRequest(`https://msp.test/api/dve?symbol=${sym ?? `ZZT${n++}`}&type=equity`)); return { status: r.status, body: await r.json() }; };
beforeEach(() => { h.session = { workspaceId: 'ws-a', tier: 'pro' }; h.paid = true; h.computeCalls = 0; });

describe('W3: /api/dve serializes only the public Volatility contract', () => {
  it('cold and cached responses: exact keys, no private key, canary or engine verdict text', async () => {
    const sym = 'ZZTCACHE';
    const cold = await call(sym), warm = await call(sym);
    expect(h.computeCalls).toBe(1);
    expect(warm.body.cached).toBe(true);
    for (const { status, body } of [cold, warm]) {
      expect(status).toBe(200);
      const d = body.data;
      expect(d.contract).toBe('public-dve-v1');
      expect(Object.keys(d).sort()).toEqual(['breakout', 'contract', 'dataQuality', 'exhaustion', 'flags', 'invalidation', 'label', 'phasePersistence', 'projection', 'regime', 'signal', 'summary', 'symbol', 'timestamp', 'trap', 'volatility']);
      expect(keyPaths(body).filter((p) => FORBIDDEN_KEYS.test(p.split('.').at(-1)!))).toEqual([]);
      expect(JSON.stringify(body)).not.toMatch(PRIVATE_TEXT);
      // Measured observations that remain.
      expect(d.breakout).toEqual({ conditions: { volCompression: true, timeAlignment: false, gammaWall: true, adxRising: true }, details: ['BBWP < 15: extreme compression'] });
      expect(d.signal.triggerReason).toEqual(['BBWP broke above 15', 'Stoch momentum rising']);
      expect(d.signal.conditions).toBeNull();
      expect(d.invalidation).toEqual({ invalidated: false, invalidationMode: 'extreme', phaseInvalidation: 15, smoothedPhaseInvalidation: 15, ruleSet: ['BBWP re-enters below 15', 'BBWP SMA5 re-enters below 15'] });
      expect(d.projection.casesInDirection).toBe(5);
      expect(d.trap).toEqual({ detected: false, candidate: true, observations: ['BBWP 12 compressed'], bbwpAtCheck: 12, gammaLockDetected: false, timeClusterApproaching: true });
      expect(d.exhaustion).toEqual({ label: 'HIGH', signals: ['StochK 88 > 80'] });
      expect(d.regime).toEqual({ current: 'compression', observation: 'BBWP accelerating toward 15' });
      expect(d.flags).toEqual(['TRAP_CANDIDATE', 'SIGNAL_UP']);
      expect(d.summary).toContain('Compression release up rule recorded on the latest closed bar.');
      expect(d.summary).toContain('5 of 8 moved in the rule\'s direction');
    }
  });
  it('the projection shares no object with, and does not mutate, the cached internal reading', async () => {
    const { toPublicDveReading } = await import('@/lib/research/publicDve');
    await call();
    const before = JSON.stringify(h.last);
    const pub: any = toPublicDveReading(h.last, 20);
    expect(JSON.stringify(h.last)).toBe(before);
    const internal = new Set<object>();
    (function walk(v: any) { if (v && typeof v === 'object' && !internal.has(v)) { internal.add(v); Object.values(v).forEach(walk); } })(h.last);
    const shared: string[] = [];
    (function walk(v: any, path: string) { if (v && typeof v === 'object') { if (internal.has(v)) shared.push(path); Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`)); } })(pub, '');
    expect(shared).toEqual([]);
  });
  it('an idle signal publishes the measured rule conditions and not the engine direction', async () => {
    const { toPublicDveReading } = await import('@/lib/research/publicDve');
    await call();
    const idle = toPublicDveReading({ ...h.last, signal: { ...h.last.signal, type: 'none', state: 'idle', active: false } }, 20);
    expect(idle.signal.conditions!.map((g) => g.signalName)).toEqual(['Compression release (up)', 'Compression release (down)', 'Expansion continuation (up)', 'Expansion continuation (down)']);
    expect(JSON.stringify(idle.signal.conditions)).not.toMatch(/bias|direction/i);
    expect(idle.signal.conditions![0].conditions.at(-1)).toEqual({ label: 'Stochastic momentum rising', met: true });
  });
  it('auth is checked before any computation', async () => {
    h.session = null;
    expect((await call()).status).toBe(401);
    h.session = { workspaceId: 'ws-a' }; h.paid = false;
    expect((await call()).status).toBe(403);
    expect(h.computeCalls).toBe(0);
  });
});
