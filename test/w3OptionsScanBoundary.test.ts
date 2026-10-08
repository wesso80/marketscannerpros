/**
 * W3 /api/options-scan (product decision 8 Oct: rebuild as evidence): the response is the public Options evidence
 * contract only. The analyzer output is loaded with canaries in every private setup field (direction, grades, strategy,
 * strike/expiry picks, trade levels, entry timing, risk %, Greeks advice, snapshot, AI state, institutional intent),
 * the workspace's adaptive profile and the real capital-flow engine output carry canaries too. The analyzer, chain
 * cache, adaptive store and state-machine store are fakes; no network or database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ access: { ok: true, via: 'session', tier: 'pro', workspaceId: 'ws-a' } as any, adaptiveCalls: 0, upserts: [] as any[], flow: null as any }));
vi.mock('@/lib/options/access', () => ({ checkOptionsAccess: vi.fn(async () => h.access) }));
vi.mock('@/lib/options-confluence-analyzer', () => ({ optionsAnalyzer: { analyzeForOptions: vi.fn(async (symbol: string) => ({
  symbol, assetType: 'equity', currentPrice: 100.5,
  direction: 'bullish', directionReason: 'CANARY-DIR', tradeQuality: 'A+', qualityReasons: ['CANARY-QR'], optionsQualityScore: 91, optionsGrade: 'A+', signalStrength: 'strong',
  compositeScore: { confidence: 88, finalDirection: 'bullish', canary: 'CANARY-COMP' }, strategyRecommendation: { strategy: 'BUY_CALL', canary: 'CANARY-STRAT' },
  primaryStrike: { strike: 105, type: 'call', reason: 'CANARY-STRIKE' }, alternativeStrikes: [], primaryExpiration: { expirationDate: '2026-10-16', reason: 'CANARY-EXP' }, alternativeExpirations: [],
  researchCandidates: { canary: 'CANARY-CAND' }, greeksAdvice: { overallAdvice: 'CANARY-GREEKS' }, maxRiskPercent: 2, stopLossStrategy: 'CANARY-STOP', profitTargetStrategy: 'CANARY-TARGET',
  entryTiming: { marketSession: 'regular', urgency: 'immediate', idealEntryWindow: 'CANARY-ENTRY', reason: 'CANARY-ENTRY', avoidWindows: [] },
  tradeLevels: { entryZone: { low: 100, high: 101 }, stopLoss: 97.25, target1: { price: 111.11, reason: 'CANARY-T1', takeProfit: 50 }, riskRewardRatio: 3 },
  tradeSnapshot: { oneLine: 'CANARY-SNAPSHOT', verdict: 'BUY' }, aiMarketState: { regime: { regime: 'TREND' }, canary: 'CANARY-AI' }, institutionalIntent: { canary: 'CANARY-INTENT' },
  professionalTradeStack: { canary: 'CANARY-STACK' }, decompressionStack: { canary: 'CANARY-DECOMP' }, locationContext: { canary: 'CANARY-LOC' }, candleCloseConfluence: { canary: 'CANARY-CCC' },
  dataQuality: { freshness: 'REALTIME', optionsChainSource: 'alpha_vantage', hasGreeksFromAPI: true, hasMeaningfulOI: true, contractsCount: { calls: 40, puts: 38 }, availableStrikes: [95, 100, 105], chainExpiryUsed: '2026-10-16', underlyingAsOf: '2026-10-07T20:00:00Z', lastUpdated: '2026-10-07T20:05:00Z' },
  expectedMove: { selectedExpiry: 4.2, selectedExpiryPercent: 4.18, selectedExpiryDTE: 9, weekly: 0, weeklyPercent: 0, monthly: 0, monthlyPercent: 0, calculation: 'ATM straddle' },
  ivAnalysis: { currentIV: 0.3125, ivRank: null, ivRankHeuristic: null, ivPercentile: null, ivSignal: 'buy_premium', ivReason: 'CANARY-IV' },
  openInterestAnalysis: { totalCallOI: 12000, totalPutOI: 9000, pcRatio: 0.75, sentiment: 'bullish', sentimentReason: 'CANARY-SENT', maxPainStrike: 100, maxPainReliability: { score: 80, strikesUsed: 14, nonZeroCoverage: 0.9, totalOI: 21000, reliable: true }, highOIStrikes: [{ strike: 105, openInterest: 5000, volume: 800, type: 'call', iv: 0.3, delta: 0.4, canary: 'CANARY-HOI' }], expirationDate: '2026-10-16' },
  unusualActivity: { hasUnusualActivity: true, unusualStrikes: [{ strike: 110, type: 'call', volume: 3000, openInterest: 1000, volumeOIRatio: 3, signal: 'bullish', reason: 'CANARY-UA' }], smartMoneyDirection: 'neutral', volumeTilt: 'calls', alertLevel: 'high', callPremiumTotal: 1, putPremiumTotal: 1 },
  disclaimerFlags: [], unmeasuredTFs: [],
})) } }));
vi.mock('@/lib/adaptiveTrader', () => ({ getAdaptiveLayer: vi.fn(async () => { h.adaptiveCalls++; return { profile: { sampleSize: 42, wins: 30, styleBias: 'CANARY-STYLE', riskDNA: 'CANARY-RISKDNA', personalityMatch: 0.91 }, match: { adaptiveScore: 77, reasons: ['CANARY-MATCH'], noTradeBias: false } }; }) }));
vi.mock('@/lib/options/chainCache', () => ({ defaultChainProviders: () => [], fetchSharedOptionsChain: vi.fn(async () => null) }));
vi.mock('@/lib/avRateGovernor', () => ({ avFetch: vi.fn(async () => { throw new Error('network denied in test'); }) }));
vi.mock('@/lib/scoring/canonical/barStore', () => ({ canonicalFromBarStore: vi.fn(async () => null) }));
vi.mock('@/lib/scoring/canonical/regimeOverlayData', () => ({ loadRegimeOverlayInputs: vi.fn(async () => null) }));
vi.mock('@/lib/state-machine-store', () => ({ getLatestStateMachine: vi.fn(async () => null), upsertStateMachine: vi.fn(async (x: any) => { h.upserts.push(x); }) }));
vi.mock('@/lib/capitalFlowEngine', async (orig) => {
  const real = await orig<typeof import('@/lib/capitalFlowEngine')>();
  return { ...real, computeCapitalFlowEngine: vi.fn((input: any) => {
    const r: any = real.computeCapitalFlowEngine(input);
    r.brain_decision_v1 = { ...(r.brain_decision_v1 ?? {}), canary: 'CANARY-BRAIN', permission: 'ALLOW', size_multiplier: 1.4 };
    r.institutional_risk_governor = { ...(r.institutional_risk_governor ?? {}), canary: 'CANARY-GOV' };
    r.flow_trade_permission = { ...(r.flow_trade_permission ?? {}), canary: 'CANARY-TPS' };
    r.key_strikes = [{ strike: 105, canary_inner: 'kept-as-data' }];
    h.flow = r;
    return r;
  }) };
});
import { POST } from '@/app/api/options-scan/route';

const call = async () => { const r = await POST(new NextRequest('https://msp.test/api/options-scan', { method: 'POST', body: JSON.stringify({ symbol: 'AAPL', scanMode: 'swing_1d' }) })); return { status: r.status, body: await r.json() }; };
beforeEach(() => { h.access = { ok: true, via: 'session', tier: 'pro', workspaceId: 'ws-a' }; h.adaptiveCalls = 0; h.upserts = []; h.flow = null; });

const FORBIDDEN_KEYS = /^(direction|directionReason|tradeQuality|qualityReasons|optionsQualityScore|optionsGrade|signalStrength|compositeScore|strategyRecommendation|primaryStrike|alternativeStrikes|primaryExpiration|researchCandidates|greeksAdvice|maxRiskPercent|stopLossStrategy|profitTargetStrategy|entryTiming|tradeLevels|tradeSnapshot|aiMarketState|institutionalIntent|professionalTradeStack|decompressionStack|locationContext|candleCloseConfluence|institutionalFilter|capitalFlow|universalScoringV21|canonicalVerdict|adaptiveLayer|sentiment|sentimentReason|ivSignal|signal|alertLevel|smartMoneyDirection|delta)$/;
function keyPaths(v: any, path = '', out: string[] = []): string[] {
  if (Array.isArray(v)) { v.forEach((x) => keyPaths(x, `${path}[]`, out)); return out; }
  if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(`${path}.${k}`); keyPaths(x, `${path}.${k}`, out); }
  return out;
}

describe('W3: /api/options-scan serializes only the public Options evidence', () => {
  it('complete response: exact keys, no setup, score, profile or brain-decision field anywhere', async () => {
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(['data', 'dataSources', 'success', 'timestamp']);
    const d = body.data;
    expect(d.contract).toBe('public-options-evidence-v1');
    expect(Object.keys(d).sort()).toEqual(['chain', 'contract', 'expectedMove', 'impliedVolatility', 'missing', 'openInterest', 'symbol', 'underlying', 'volumeVsOpenInterest', 'warnings']);
    expect(keyPaths(body).filter((p) => FORBIDDEN_KEYS.test(p.split('.').at(-1)!))).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/CANARY|BUY_CALL|111\.11|97\.25|buy_premium|bullish|bearish|adaptiveLayer|brain_decision|risk_governor|riskDNA|ws-a/i);
    expect(h.adaptiveCalls).toBe(1); // still computed for the server-side scoring
    // Measured evidence that remains, with its basis.
    expect(d.chain).toMatchObject({ source: 'alpha_vantage', freshness: 'REALTIME', expiry: '2026-10-16', daysToExpiry: 9, contracts: { calls: 40, puts: 38 }, strikesListed: 3, greeks: 'provider' });
    expect(d.openInterest).toMatchObject({ calls: 12000, puts: 9000, putCall: 0.75, maxPain: { strike: 100, reliable: true, strikesUsed: 14 } });
    expect(d.openInterest.largestStrikes).toEqual([{ strike: 105, type: 'call', openInterest: 5000, volume: 800, iv: 0.3 }]);
    expect(d.impliedVolatility).toMatchObject({ atmIvPct: 31.3, ivRank: null });
    expect(d.expectedMove).toMatchObject({ pct: 4.18, usd: 4.2, daysToExpiry: 9 });
    expect(d.volumeVsOpenInterest.strikes).toEqual([{ strike: 110, type: 'call', volume: 3000, openInterest: 1000, volumeOiRatio: 3 }]);
  });
  it('the private computations still run on the server (state machine), unchanged', async () => {
    await call();
    expect(h.flow.brain_decision_v1.canary).toBe('CANARY-BRAIN');
  });
  it('access is checked before any analysis or profile read', async () => {
    h.access = { ok: false, status: 401 };
    expect((await call()).status).toBe(401);
    h.access = { ok: false, status: 403 };
    expect((await call()).status).toBe(403);
    expect(h.adaptiveCalls).toBe(0);
  });
});
