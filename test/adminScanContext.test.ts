import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildAdminScanContext, loadAdminRiskSnapshot } from '../lib/admin/scan-context';
import { q } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  q: vi.fn(),
}));

const qMock = vi.mocked(q);

describe('admin scan risk context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not use fake account equity when live risk state is unavailable', async () => {
    qMock.mockRejectedValue(new Error('db unavailable'));

    const risk = await loadAdminRiskSnapshot();
    const { context } = await buildAdminScanContext();

    expect(risk.source).toBe('fallback');
    expect(risk.permission).toBe('WAIT');
    expect(risk.equity).toBe(0);
    expect(risk.sizeMultiplier).toBe(0);
    expect(context.portfolioState.equity).toBe(0);
    expect(context.accountState.buyingPower).toBe(0);
    expect(context.accountState.accountRiskUnit).toBe(0);
    expect(context.metaHealthThrottle).toBeLessThanOrEqual(0.25);
  });
});