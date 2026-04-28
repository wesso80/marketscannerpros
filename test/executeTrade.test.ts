import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionFromCookieMock = vi.fn();
const qMock = vi.fn();
const evaluateGovernorMock = vi.fn();
const getLatestPortfolioEquityMock = vi.fn();

vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: getSessionFromCookieMock,
}));

vi.mock('@/lib/db', () => ({
  q: qMock,
}));

vi.mock('@/lib/execution/riskGovernor', () => ({
  evaluateGovernor: evaluateGovernorMock,
}));

vi.mock('@/lib/journal/riskAtEntry', () => ({
  computeEntryRiskMetrics: vi.fn(() => ({
    normalizedR: 1,
    dynamicR: 1,
    riskPerTradeAtEntry: 0.01,
    equityAtEntry: 100000,
  })),
  getLatestPortfolioEquity: getLatestPortfolioEquityMock,
}));

function requestFor(body: unknown) {
  return new Request('http://localhost/api/execute-trade', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('/api/execute-trade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionFromCookieMock.mockResolvedValue({ workspaceId: 'workspace-1', cid: 'cus_1', tier: 'pro_trader' });
  });

  it('rejects LIVE mode before governor checks, risk lookups, or journal writes', async () => {
    const { POST } = await import('../app/api/execute-trade/route');

    const response = await POST(requestFor({
      mode: 'LIVE',
      proposal: { proposal_id: 'proposal-live-1' },
    }) as any);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error).toContain('Live order submission is not available');
    expect(evaluateGovernorMock).not.toHaveBeenCalled();
    expect(getLatestPortfolioEquityMock).not.toHaveBeenCalled();
    expect(qMock).not.toHaveBeenCalled();
  });
});
