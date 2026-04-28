import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../app/api/options-scan/route';
import { getSessionFromCookie } from '@/lib/auth';
import { optionsAnalyzer } from '@/lib/options-confluence-analyzer';

vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: vi.fn(),
}));

vi.mock('@/lib/proTraderAccess', () => ({
  hasProTraderAccess: (tier: string | null | undefined) => tier === 'pro_trader',
}));

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
  });

  it('rejects non-Pro Trader users before running an options scan', async () => {
    getSessionFromCookieMock.mockResolvedValue({ workspaceId: 'workspace-1', cid: 'cus_1', tier: 'pro' });

    const request = new Request('http://localhost/api/options-scan', {
      method: 'POST',
      body: JSON.stringify({ symbol: 'AAPL' }),
      headers: { 'content-type': 'application/json' },
    });

    const response = await POST(request as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ success: false, error: 'Options Scanner requires Pro Trader access' });
    expect(analyzeForOptionsMock).not.toHaveBeenCalled();
  });
});