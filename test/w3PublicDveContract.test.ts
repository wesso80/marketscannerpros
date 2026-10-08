/**
 * W3 acceptance, Volatility endpoint (/api/dve), contract public-dve-v2. The real route and the real engine run on a
 * synthetic series (providers are fakes; no network). Checks, on the COMPLETE serialized body:
 *   - nothing private (canaries and the engine's own private texts in every nested family) on cold and cached paths;
 *   - missing BBWP is null and never satisfies a condition, and a rule computed from the placeholder is not published;
 *   - factual input availability instead of the weighted coverage score;
 *   - the historical return statistics state sample size, dated period and forward window, and none under the minimum;
 *   - Free / Pro / admin / signed-out access, checked before any computation, and private, no-store responses on every
 *     branch (a cached market reading never reaches a request that fails the paid check).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ session: { workspaceId: 'ws-a', tier: 'pro', cid: 'cus_test_a' } as any, computeCalls: 0, last: null as any, closes: 320, load: true, throwInCompute: false, thin: false }));
vi.mock('@/lib/publicQuotaAccess', () => ({ publicQuotaEnabled: () => process.env.PUBLIC_DAILY_QUOTAS_ENABLED === 'true', resolvePublicQuotaAccess: async () => ({ bypass: false, plan: 'pro', subject: `account:${h.session.workspaceId}` }) }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => h.session) }));
vi.mock('@/lib/coingecko', () => ({ getAggregatedFundingRates: vi.fn(async () => []), getAggregatedOpenInterest: vi.fn(async () => []) }));
vi.mock('@/lib/research/priceEvidence', async (orig) => ({ ...(await orig<typeof import('@/lib/research/priceEvidence')>()), priceEvidenceFromSeries: vi.fn(() => null) }));
vi.mock('@/lib/goldenEggFetchers', async (orig) => {
  const series = (n: number) => Array.from({ length: n }, (_, i) => 100 + Math.sin(i / 7) * 3 + i * 0.02);
  const dates = (n: number) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2025, 5, 2) + i * 86400000).toISOString().slice(0, 10));
  return {
    ...(await orig<typeof import('@/lib/goldenEggFetchers')>()),
    fetchPrice: vi.fn(async () => { const c = series(h.closes); return { price: c.at(-1), changePct: 0.4, volume: 1e6, avgVolume: 9e5, historicalCloses: c, historicalOpens: c, historicalHighs: c.map((x) => x + 1), historicalLows: c.map((x) => x - 1), historicalDates: dates(h.closes), lastCompletedBarAt: '2026-10-06T20:00:00Z', barInterval: 'daily' }; }),
    fetchMPE: vi.fn(async () => null), fetchIndicators: vi.fn(async () => null), fetchOptionsSnapshot: vi.fn(async () => null),
  };
});
vi.mock('@/lib/directionalVolatilityEngine', async (orig) => {
  const real = await orig<typeof import('@/lib/directionalVolatilityEngine')>();
  return {
    ...real,
    computeDVE: vi.fn((input: any, symbol: string) => {
      h.computeCalls++;
      if (h.throwInCompute) throw new Error('provider https://example.test/q?apikey=SECRET-KEY failed');
      const r: any = real.computeDVE(input, symbol);
      if (!h.load) { h.last = r; return r; }
      r.volatility.regimeConfidence = 91; r.volatility.canary = 'CANARY-VOL'; r.volatility.squeezeStrength = 77;
      r.direction = { score: 88, bias: 'bullish', confidence: 74, components: { stochasticMomentum: 12, trendStructure: 20, optionsFlow: 8, volumeExpansion: 0, dealerGamma: 0, fundingRate: 0, marketBreadth: 0 }, componentDetails: ['P/C < 0.7 call-heavy (+8)', 'CANARY-DIR'] };
      r.directionalVolatility = { magnitude: 3, bias: 'up', confidence: 71 };
      r.phasePersistence.contraction.continuationProbability = 73; r.phasePersistence.contraction.exitProbability = 27; r.phasePersistence.contraction.stats.canary = 'CANARY-PH';
      r.signal = { type: 'compression_release_up', state: 'fired', active: true, strength: 81, triggerBarPrice: 106.5, triggerBarOpen: 105, triggerBarHigh: 107, triggerBarLow: 104, triggerReason: ['BBWP broke above 15', 'Stoch momentum bullish (+12)', 'Direction: bullish (+42)'], canary: 'CANARY-SIG' };
      r.invalidation = { priceInvalidation: 123.45, phaseInvalidation: 15, smoothedPhaseInvalidation: 15, invalidated: false, invalidationMode: 'extreme', ruleSet: ['Price below signal bar low (123.45)', 'BBWP re-enters below 15', 'BBWP SMA5 re-enters below 15'] };
      r.projection = h.thin
        ? { signalType: 'compression_release_up', expectedMovePct: 0, medianMovePct: 0, maxHistoricalMovePct: 0, averageBarsToMove: 0, hitRate: 0, sampleSize: 3, dispersionPct: 0, projectionQuality: 'unavailable', projectionQualityScore: 0, projectionWarning: 'Thin projection sample: 3/5 historical signals found.' }
        : { signalType: 'compression_release_up', expectedMovePct: 2.1, medianMovePct: 1.4, maxHistoricalMovePct: 6.2, averageBarsToMove: 9.5, hitRate: 62.5, sampleSize: 8, dispersionPct: 3.3, projectionQuality: 'high', projectionQualityScore: 64, projectionWarning: 'Projection quality high: 8 historical outcomes', canary: 'CANARY-PROJ' };
      r.breakout = { score: 100, label: 'READY', components: { volCompression: 40, timeAlignment: 30, gammaWall: 20, adxRising: 10 }, componentDetails: ['BBWP < 15: extreme compression (40/40)', 'Time alignment 30/30 (display only; not included in score)'] };
      r.trap = { detected: true, candidate: false, score: 75, components: ['BBWP 12 compressed (+25)'], compressionLevel: 12, gammaLockDetected: true, timeClusterApproaching: true };
      r.exhaustion = { level: 77, label: 'HIGH', signals: ['StochK 88 > 80'] };
      r.transition = { from: r.volatility.regime, to: 'expansion', probability: 60, trigger: 'BBWP accelerating toward 15' };
      r.flags = ['BREAKOUT_WATCH', 'EXPANSION_UP', 'CONTRACTION_EXIT_RISK', 'TRAP_DETECTED', 'SIGNAL_UP'];
      r.dataQuality.score = 62; r.dataQuality.canary = 'CANARY-DQ';
      r.summary = 'X BBWP at 12. Stochastic momentum bullish (+12). Invalidation: below $123.45.';
      h.last = r;
      return r;
    }),
  };
});
import { GET } from '@/app/api/dve/route';
import { verifyPageEvidence } from '@/lib/ai/publicCopilotEvidence';

const FORBIDDEN_KEYS = /^(direction|directionalVolatility|transition|score|scores|coverage|confidence|regimeConfidence|bias|magnitude|probability|continuationProbability|exitProbability|strength|squeezeStrength|priceInvalidation|hitRate|projectionQuality|projectionQualityScore|projectionWarning|level|label_|components|componentDetails|compressionLevel|detected|candidate|flags|dataQuality|trap|exhaustion|canary)$/;
const PRIVATE_TEXT = /CANARY|123\.45|\(\s*[+-]?\d+(\.\d+)?\s*\)|\b\d+\s*\/\s*\d+\b|\bbullish\b|\bbearish\b|Direction:|BREAKOUT_WATCH|EXPANSION_UP|EXIT_RISK|TRAP_DETECTED|READY|quality high|probabilit|\bHIGH\b|ws-a|ws-b/i;
function keyPaths(v: any, path = '', out: string[] = []): string[] {
  if (Array.isArray(v)) { v.forEach((x) => keyPaths(x, `${path}[]`, out)); return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(`${path}.${k}`); keyPaths(x, `${path}.${k}`, out); }
  return out;
}
const allConditionValues = (d: any) => [
  ...Object.values(d.breakout.conditions), ...Object.values(d.pinnedCompression.conditions),
  ...(d.signal.conditions ?? []).flatMap((g: any) => g.conditions.filter((c: any) => /BBWP/.test(c.label)).map((c: any) => c.met)),
];
let n = 0;
const call = async (sym?: string) => { const r = await GET(new NextRequest(`https://msp.test/api/dve?symbol=${sym ?? `ZZT${n++}`}&type=equity`)); return { status: r.status, body: await r.json(), headers: r.headers }; };
beforeEach(() => {
  vi.stubEnv('PUBLIC_DAILY_QUOTAS_ENABLED', 'false');
  h.session = { workspaceId: 'ws-a', tier: 'pro', cid: 'cus_test_a' }; h.computeCalls = 0; h.closes = 320; h.load = true; h.throwInCompute = false; h.thin = false;
  vi.stubEnv('PRO_TRADER_BYPASS_UNTIL', ''); vi.stubEnv('TEMP_PRO_TRADER_BYPASS_UNTIL', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('W3: /api/dve serializes only the public Volatility contract (v2)', () => {
  it('cold and cached responses: exact keys, no private key, canary or engine verdict text', async () => {
    const sym = 'ZZTCACHE';
    const cold = await call(sym), warm = await call(sym);
    expect(h.computeCalls).toBe(1);
    expect(warm.body.cached).toBe(true);
    for (const { status, body } of [cold, warm]) {
      expect(status).toBe(200);
      const d = body.data;
      expect(d.contract).toBe('public-dve-v2');
      expect(Object.keys(d).sort()).toEqual(['availability', 'breakout', 'contract', 'invalidation', 'label', 'phasePersistence', 'pinnedCompression', 'projection', 'regime', 'signal', 'stretch', 'summary', 'symbol', 'timestamp', 'volatility']);
      expect(keyPaths(body).filter((p) => FORBIDDEN_KEYS.test(p.split('.').at(-1)!))).toEqual([]);
      expect(JSON.stringify(body)).not.toMatch(PRIVATE_TEXT);
      expect(d.signal.triggerReason).toEqual(['BBWP broke above 15', 'Stoch momentum rising']);
      expect(d.invalidation.ruleSet).toEqual(['BBWP re-enters below 15', 'BBWP SMA5 re-enters below 15']);
      expect(d.stretch).toEqual({ observations: ['StochK 88 > 80'] });
      expect(d.regime.observation).toBe('BBWP accelerating toward 15');
      // Conditions come from the measured inputs: indicators were not collected (fetchIndicators returned null), no
      // options chain, and timeframe closes are never collected by this endpoint.
      expect(d.breakout.conditions).toMatchObject({ timeAlignment: null, gammaWall: null, adxRising: null });
      expect(d.pinnedCompression.conditions).toMatchObject({ nearLargeOiStrike: null, timeframeClosesClustered: null });
      expect(d.volatility.squeeze.inSqueeze).toBeNull();
    }
  });

  it('historical return statistics state sample size, dated period and forward window', async () => {
    const { body } = await call();
    const p = body.data.projection;
    expect(p).toMatchObject({ signalType: 'compression_release_up', sampleSize: 8, minimumSample: 5, period: { from: '2025-06-02', to: '2026-04-17', bars: 320, timeframe: 'daily', forwardBars: 20 } });
    expect(p.stats).toEqual({ meanReturnPct: 2.1, medianReturnPct: 1.4, dispersionPct: 3.3, largestMoveInRuleDirectionPct: 6.2, averageBarsToLargestMove: 9.5, casesInDirection: 5 });
    expect(p.note).toMatch(/In-sample past cases on this symbol's own history.*not a forecast or a win rate/);
    expect(body.data.summary).toContain('In 8 past cases (daily bars 2025-06-02 to 2026-04-17), the close 20 bars later moved +2.1% on average; 5 of 8 moved in the rule\'s direction.');
  });

  it('a sample under the minimum publishes no statistics (not "0 of 3")', async () => {
    h.thin = true;
    const { body } = await call();
    expect(body.data.projection.stats).toBeNull();
    expect(body.data.projection.sampleSize).toBe(3);
    expect(body.data.projection.note).toBe('Too few past cases (3 of the 5 needed), so no statistics are shown.');
    expect(JSON.stringify(body)).not.toMatch(/0 of 3|Thin projection/);
  });

  it('factual availability per input replaces the weighted coverage score', async () => {
    const { body } = await call();
    const inputs = body.data.availability.inputs;
    expect(inputs.map((i: any) => [i.input, i.status])).toEqual([
      ['Price history', 'collected'], ['BBWP', 'collected'], ['Indicators (stochastic, ADX, ATR)', 'not collected'],
      ['Options chain', 'not collected'], ['Funding and open interest', 'not applicable'], ['Timeframe closes', 'not collected'],
    ]);
    expect(inputs[0].detail).toBe('320 daily closes');
    expect(JSON.stringify(body)).not.toMatch(/coverage|62%|"score"/);
  });

  it('missing BBWP is null and never satisfies a condition; a rule from the placeholder is not published', async () => {
    h.closes = 10; // fewer closes than the band-width length: the engine keeps a 50 placeholder internally
    const { status, body } = await call();
    expect(status).toBe(200);
    const d = body.data;
    expect(h.last.volatility.bbwp).toBe(50);
    expect(d.volatility).toMatchObject({ bbwp: null, bbwpSma5: null, regime: null, rateSmoothed: null, rateDirection: null });
    expect(d.label).toBe('BBWP not available');
    expect(d.phasePersistence).toBeNull();
    expect(d.regime.current).toBeNull();
    expect(d.signal).toMatchObject({ type: 'none', state: 'idle', active: false, triggerReason: [] });
    expect(d.projection).toMatchObject({ signalType: 'none', stats: null, period: null });
    expect(d.invalidation.ruleSet).toEqual([]);
    expect(allConditionValues(d).filter((v) => v === true)).toEqual([]);
    expect(d.breakout.conditions.volCompression).toBeNull();
    expect(d.pinnedCompression.conditions.compressed).toBeNull();
    expect(d.signal.conditions.flatMap((g: any) => g.conditions.filter((c: any) => /BBWP/.test(c.label)).map((c: any) => c.met))).toEqual(Array(10).fill(null));
    expect(d.availability.inputs.find((i: any) => i.input === 'BBWP')).toEqual({ input: 'BBWP', status: 'not collected', detail: 'Too few closes to compute a band width' });
    expect(d.summary).toContain('BBWP not available');
    expect(JSON.stringify(d)).not.toMatch(/BBWP 50|\b50\.0\b/);
  });

  it('a measured BBWP of 0 is a real value: its conditions evaluate (not treated as missing)', async () => {
    const { toPublicDveReading } = await import('@/lib/research/publicDve');
    await call();
    const r = structuredClone(h.last);
    r.volatility.bbwp = 0; r.volatility.bbwpSma5 = 0; r.volatility.bbwpBasis = { available: true, window: 252, lookback: 252, fullYear: true };
    r.signal = { ...r.signal, type: 'none', state: 'idle', active: false };
    const d = toPublicDveReading(r, { forwardBars: 20, input: { price: { closes: Array(320).fill(100), currentPrice: 100, changePct: 0 } } as any, history: { dates: null, timeframe: 'daily' }, assetClass: 'equity' });
    expect(d.volatility.bbwp).toBe(0);
    expect(d.signal.conditions![0].conditions[0]).toEqual({ label: 'Recent compression (BBWP ≤ 15)', met: true });
    expect(d.breakout.conditions.volCompression).toBe(true);
    expect(d.pinnedCompression.conditions.compressed).toBe(true);
  });

  it('crypto is not marked down for options (not applicable); funding and OI are its applicable input', async () => {
    const { toPublicDveReading } = await import('@/lib/research/publicDve');
    await call();
    const d = toPublicDveReading(h.last, { forwardBars: 20, input: { price: { closes: Array(320).fill(100), currentPrice: 100, changePct: 0 }, liquidity: { fundingRatePercent: 0.01, oiTotalUsd: 1e9 } } as any, history: { dates: null, timeframe: 'daily' }, assetClass: 'crypto' });
    const byInput = Object.fromEntries(d.availability.inputs.map((i) => [i.input, i.status]));
    expect(byInput['Options chain']).toBe('not applicable');
    expect(byInput['Funding and open interest']).toBe('collected');
  });

  it('errors are generic: no exception text, URL or key reaches the response', async () => {
    h.throwInCompute = true;
    const { status, body, headers } = await call();
    expect(status).toBe(500);
    expect(body).toEqual({ success: false, error: 'Volatility reading could not be computed right now.' });
    expect(headers.get('cache-control')).toBe('private, no-store, max-age=0');
  });
});

describe('W3: /api/dve access and private-response caching', () => {
  const noStore = (r: { headers: Headers }) => { expect(r.headers.get('cache-control')).toBe('private, no-store, max-age=0'); expect(r.headers.get('vary')).toBe('Cookie'); };

  it.each([
    ['signed out', null, 401],
    ['Free', { workspaceId: 'ws-f', tier: 'free', cid: 'cus_test_f' }, 403],
    ['Pro', { workspaceId: 'ws-p', tier: 'pro', cid: 'cus_test_p' }, 200],
    ['legacy pro_trader (counts as Pro)', { workspaceId: 'ws-t', tier: 'pro_trader', cid: 'cus_test_t' }, 200],
    ['admin on a free tier', { workspaceId: 'ws-ad', tier: 'free', cid: 'cus_test_ad', is_admin: true }, 200],
  ])('%s → %s, with private no-store headers', async (_l, session, expected) => {
    h.session = session;
    const r = await call();
    expect(r.status).toBe(expected);
    noStore(r);
    if (expected !== 200) { expect(r.body.data).toBeUndefined(); expect(h.computeCalls).toBe(0); }
  });

  it('a market reading cached by a Pro request is not served to Free or signed-out requests for the same symbol', async () => {
    const sym = 'ZZTGATE';
    const pro = await call(sym);
    expect(pro.status).toBe(200);
    h.session = { workspaceId: 'ws-f', tier: 'free', cid: 'cus_test_f' };
    const free = await call(sym);
    h.session = null;
    const anon = await call(sym);
    expect([free.status, anon.status]).toEqual([403, 401]);
    expect(free.body.data).toBeUndefined(); expect(anon.body.data).toBeUndefined();
    noStore(free); noStore(anon);
    expect(h.computeCalls).toBe(1);
  });

  it('two Pro workspaces share the market reading cache and receive the same body with no workspace data', async () => {
    const sym = 'ZZTSHARE';
    const a = await call(sym);
    h.session = { workspaceId: 'ws-b', tier: 'pro', cid: 'cus_test_b' };
    const b = await call(sym);
    expect(h.computeCalls).toBe(1);
    const strip = (x: any) => ({ ...x, cached: undefined });
    expect(strip(b.body)).toEqual(strip(a.body));
    expect(JSON.stringify(b.body)).not.toMatch(/ws-a|ws-b|cus_test/);
    noStore(a); noStore(b);
  });

  it('input errors are private and no-store too', async () => {
    const r = await GET(new NextRequest('https://msp.test/api/dve?type=equity'));
    expect(r.status).toBe(400);
    noStore(r);
  });
});

// Integration regression: shared market cache must never reuse another account's bearer.
it('signs the v2 public projection separately for each account on a cache hit', async () => {
  vi.stubEnv('PUBLIC_DAILY_QUOTAS_ENABLED', 'true');
  vi.stubEnv('APP_SIGNING_SECRET', 'integration-fixture-only');
  const first = await call('ZZTSIGNEDCACHE');
  h.session = { workspaceId: 'ws-b', tier: 'pro', cid: 'cus_test_b' };
  const second = await call('ZZTSIGNEDCACHE');
  expect(first.status).toBe(200);
  expect(second.status).toBe(200);
  expect(h.computeCalls).toBe(1);
  expect(second.body.cached).toBe(true);
  expect(second.body.data).toEqual(first.body.data);
  const a = first.body.copilotEvidenceToken, b = second.body.copilotEvidenceToken;
  expect(typeof a).toBe('string'); expect(typeof b).toBe('string'); expect(a).not.toBe(b);
  expect(verifyPageEvidence(a, 'account:ws-b')).toBeNull();
  expect(verifyPageEvidence(b, 'account:ws-a')).toBeNull();
  for (const [token, subject] of [[a, 'account:ws-a'], [b, 'account:ws-b']]) {
    const evidence = verifyPageEvidence(token, subject);
    expect(evidence?.section).toBe('dve');
    expect(evidence?.observations).toContainEqual(expect.objectContaining({ field: 'dve.reading.contract', value: 'public-dve-v2' }));
    expect(JSON.stringify(evidence)).not.toMatch(PRIVATE_TEXT);
  }
});
