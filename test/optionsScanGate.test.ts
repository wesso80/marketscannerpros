import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../app/api/options-scan/route';
import { getSessionFromCookie } from '@/lib/auth';
import { optionsAnalyzer } from '@/lib/options-confluence-analyzer';

vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: vi.fn(),
}));

const gate = vi.hoisted(() => ({ admin: false, effectiveTier: 'free' }));
vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(async () => (gate.admin ? { ok: true, source: 'app_session', cid: 'admin', workspaceId: 'ws-admin' } : { ok: false })),
}));
vi.mock('@/lib/db', () => ({ q: vi.fn(async () => []) }));
vi.mock('@/lib/entitlements', async (orig) => {
  const real = await orig<typeof import('@/lib/entitlements')>();
  return { ...real, getEffectiveTier: vi.fn(async () => gate.effectiveTier) };
});

vi.mock('@/lib/options-confluence-analyzer', () => ({
  optionsAnalyzer: { analyzeForOptions: vi.fn() },
}));

vi.mock('@/lib/adaptiveTrader', () => ({ getAdaptiveLayer: vi.fn() }));
vi.mock('@/lib/institutionalFilter', () => ({ computeInstitutionalFilter: vi.fn(), inferStrategyFromText: vi.fn() }));
vi.mock('@/lib/capitalFlowEngine', () => ({ computeCapitalFlowEngine: vi.fn() }));
vi.mock('@/lib/state-machine-store', () => ({ getLatestStateMachine: vi.fn(), upsertStateMachine: vi.fn() }));
vi.mock('@/lib/options-gex', () => ({ buildDealerIntelligence: vi.fn(), calculateDealerGammaSnapshot: vi.fn() }));
vi.mock('@/lib/scoring/options-v21', () => ({ scoreOptionCandidatesV21: vi.fn() }));
vi.mock('@/lib/avRateGovernor', () => ({ avFetch: vi.fn() }));
vi.mock('@/lib/redis', () => ({
  getCached: vi.fn(),
  setCached: vi.fn(),
  CACHE_KEYS: { optionsChain: (symbol: string) => `options:${symbol}` },
  CACHE_TTL: { optionsChain: 60 },
}));
vi.mock('@/lib/correlation-regime-engine', () => ({ computeCorrelationRegime: vi.fn() }));
vi.mock('@/lib/scanner/providerStatus', () => ({
  buildMarketDataProviderStatus: vi.fn(() => ({
    source: 'mock',
    provider: 'mock',
    live: true,
    simulated: false,
    stale: false,
    degraded: false,
    productionDemoEnabled: false,
    alertLevel: 'none',
    warnings: [],
  })),
}));
vi.mock('@/lib/options/dataQuality', () => ({
  assessOptionsChainQuality: vi.fn(() => ({
    status: 'sufficient',
    totalContracts: 0,
    quotedContracts: 0,
    liquidContracts: 0,
    avgSpreadPct: null,
    warnings: [],
  })),
}));

const getSessionFromCookieMock = vi.mocked(getSessionFromCookie);
const analyzeForOptionsMock = vi.mocked(optionsAnalyzer.analyzeForOptions);

describe('options-scan route access gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gate.admin = false;
    gate.effectiveTier = 'free';
  });

  const scanRequest = () => new Request('http://localhost/api/options-scan', {
    method: 'POST',
    body: JSON.stringify({ symbol: 'AAPL' }),
    headers: { 'content-type': 'application/json' },
  });

  it('rejects free users before running an options scan', async () => {
    getSessionFromCookieMock.mockResolvedValue({ workspaceId: 'workspace-1', cid: 'cus_1', tier: 'free', exp: 0 });

    const response = await POST(scanRequest() as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ success: false, error: 'Options Scanner requires a Pro subscription' });
    expect(analyzeForOptionsMock).not.toHaveBeenCalled();
  });

  it('uses the effective (DB) tier, not the login cookie: a stale pro_trader cookie on a cancelled sub is rejected', async () => {
    getSessionFromCookieMock.mockResolvedValue({ workspaceId: 'workspace-1', cid: 'cus_1', tier: 'pro_trader', exp: 0 });
    gate.effectiveTier = 'free';

    const response = await POST(scanRequest() as any);
    expect(response.status).toBe(403);
    expect(analyzeForOptionsMock).not.toHaveBeenCalled();
  });

  it.each([
    ['current Pro subscriber', { tier: 'pro', admin: false, effectiveTier: 'pro' }],
    ['admin/owner whose login cookie says free', { tier: 'free', admin: true, effectiveTier: 'free' }],
  ])('lets a %s past the gate', async (_label, c) => {
    getSessionFromCookieMock.mockResolvedValue({ workspaceId: 'workspace-1', cid: 'cus_1', tier: c.tier, exp: 0 });
    gate.admin = c.admin;
    gate.effectiveTier = c.effectiveTier;

    const response = await POST(scanRequest() as any);
    expect(response.status).not.toBe(401);
    expect(response.status).not.toBe(403);
    expect(analyzeForOptionsMock).toHaveBeenCalled();
  });
});
