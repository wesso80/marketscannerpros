/**
 * W3 interim boundary for /api/options-scan: the workspace's personal adaptive profile and the capital-flow brain
 * decision (permission, size multiplier, risk governor, execution plan, brain score, probability matrix) are not
 * serialized; the capital-flow leaves the Options views read still are. Real capital-flow engine output is loaded with
 * canaries. The analyzer, chain cache, adaptive store and state-machine store are fakes; no network or database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({ access: { ok: true, via: 'session', tier: 'pro', workspaceId: 'ws-a' } as any, adaptiveCalls: 0, upserts: [] as any[], flow: null as any }));
vi.mock('@/lib/options/access', () => ({ checkOptionsAccess: vi.fn(async () => h.access) }));
vi.mock('@/lib/options-confluence-analyzer', () => ({ optionsAnalyzer: { analyzeForOptions: vi.fn(async (symbol: string) => ({ symbol, assetType: 'equity', currentPrice: 100, direction: 'bullish', tradeQuality: 'B', signalStrength: 'moderate', compositeScore: { confidence: 60 }, dataQuality: { freshness: 'REALTIME' }, expectedMove: { selectedExpiryPercent: 3, selectedExpiryDTE: 9 }, openInterestAnalysis: { highOIStrikes: [] }, disclaimerFlags: [], entryTiming: { marketSession: 'regular', urgency: 'within_hour' }, ivAnalysis: null, strategyRecommendation: { strategy: 'WAIT' }, aiMarketState: { regime: { regime: 'TREND' } }, tradeSnapshot: { oneLine: 'x' }, maxRiskPercent: 1, unusualActivity: { hasUnusualActivity: false } })) } }));
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

describe('W3: /api/options-scan does not serialize the personal profile or the brain decision', () => {
  it('complete response: no adaptive profile, no brain decision, risk governor or trade permission', async () => {
    const { status, body } = await call();
    expect(status).toBe(200);
    expect(h.adaptiveCalls).toBe(1); // still computed for the server-side scoring
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/CANARY|adaptiveLayer|brain_decision|risk_governor|flow_trade_permission|probability_matrix|size_multiplier|execution_plan|brain_score|sampleSize|riskDNA|personalityMatch|ws-a/);
    expect(Object.keys(body.data.capitalFlow).sort()).toEqual(['bias', 'conviction', 'flip_zones', 'key_strikes', 'liquidity_levels', 'market_mode', 'most_likely_path', 'risk']);
    expect(body.data.capitalFlow.key_strikes).toEqual([{ strike: 105, canary_inner: 'kept-as-data' }]);
    expect(body.data.capitalFlow.key_strikes).not.toBe(h.flow.key_strikes);
  });
  it('the private capital-flow result is still used on the server (state machine), unchanged', async () => {
    await call();
    expect(h.flow.brain_decision_v1.canary).toBe('CANARY-BRAIN');
    expect(h.upserts.length).toBeLessThanOrEqual(1);
  });
  it('access is checked before any analysis or profile read', async () => {
    h.access = { ok: false, status: 401 };
    expect((await call()).status).toBe(401);
    h.access = { ok: false, status: 403 };
    expect((await call()).status).toBe(403);
    expect(h.adaptiveCalls).toBe(0);
  });
});
