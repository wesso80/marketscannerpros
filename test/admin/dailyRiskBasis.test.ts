import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureDailyRisk, type RiskEquitySnapshot } from '@/lib/admin/riskSnapshotMetrics';
import { loadAdminRiskSnapshot } from '@/lib/admin/scan-context';
import { q } from '@/lib/db';

vi.mock('@/lib/db', () => ({ q: vi.fn() }));
const now = new Date('2026-09-27T06:00:00Z');
const snapshot = (date: string, equity: number, pnl: number, basis = 'account_equity_v2'): RiskEquitySnapshot => ({ snapshot_date: date, total_value: equity, total_pl: pnl, snapshot_basis: basis });
const clean = [snapshot('2026-09-27', 98000, -12000), snapshot('2026-09-26', 100000, -10000)];

describe('daily account loss measurement', () => {
  it('uses prior-day equity and the P&L change, not lifetime losses or current equity', () => {
    expect(measureDailyRisk(clean, now)).toMatchObject({ equity: 98000, dailyPnl: -2000, dailyDrawdown: 0.02, dailyRiskBaselineEquity: 100000, dailyDrawdownKnown: true });
  });
  it('does not count withdrawals as losses', () => {
    const rows = [snapshot('2026-09-27', 50000, 0), snapshot('2026-09-26', 100000, 0)];
    expect(measureDailyRisk(rows, now)).toMatchObject({ dailyPnl: 0, dailyDrawdown: 0, dailyDrawdownKnown: true });
  });
  it.each([
    [],
    [clean[0]],
    [clean[1], snapshot('2026-09-25', 100000, 0)],
    [clean[0], snapshot('2026-09-25', 100000, 0)],
    [clean[0], snapshot('2026-09-26', 100000, 0, 'legacy_position_value')],
    [snapshot('2026-09-27', NaN, 0), clean[1]],
    [clean[0], snapshot('2026-09-26', 0, 0)],
  ])('withholds unavailable, stale, legacy or invalid baselines (%j)', (...rows) => {
    expect(measureDailyRisk(rows as RiskEquitySnapshot[], now).dailyDrawdownKnown).toBe(false);
  });
});

describe('canonical guard preserves restrictions', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now); vi.resetAllMocks(); });
  afterEach(() => vi.useRealTimers());
  function database(rows: RiskEquitySnapshot[], context: Record<string, unknown> = {}, unrealized = 0) {
    vi.mocked(q).mockImplementation(async sql => {
      if (sql.includes('FROM operator_state')) return [{ context_state: { equity: 100000, maxPositions: 10, permission: 'GO', ...context }, updated_at: now.toISOString() }];
      if (sql.includes('FROM portfolio_performance')) return rows;
      if (sql.includes('FROM portfolio_positions')) return [{ active_positions: 0, exposure_usd: '0', unrealized_pl: String(unrealized), largest_symbol_exposure: '0' }];
      return [{ open_risk_usd: '0', daily_pl: '0' }];
    });
  }
  it('keeps unknown daily risk at WAIT with no sizing after operator GO', async () => {
    database([clean[0]]);
    expect(await loadAdminRiskSnapshot('workspace-a')).toMatchObject({ permission: 'WAIT', sizeMultiplier: 0, dailyDrawdownKnown: false });
  });
  it('does not erase explicit BLOCK when equity is missing', async () => {
    database([], { permission: 'BLOCK', equity: 0 });
    expect(await loadAdminRiskSnapshot('workspace-a')).toMatchObject({ permission: 'BLOCK', sizeMultiplier: 0 });
  });
  it('retains the live legacy loss stop without labelling it daily loss', async () => {
    database([snapshot('2026-09-20', 70000, -120000, 'legacy_position_value')], {}, -122052);
    const risk = await loadAdminRiskSnapshot('workspace-a');
    expect(risk).toMatchObject({ permission: 'BLOCK', sizeMultiplier: 0, dailyDrawdownKnown: false, dailyDrawdown: 0 });
    expect(risk.operatorGuardReasons.join(' ')).toContain('Unverified legacy loss');
  });
  it('blocks a verified four-percent daily loss', async () => {
    database([snapshot('2026-09-27', 96000, -14000), clean[1]]);
    expect(await loadAdminRiskSnapshot('workspace-a')).toMatchObject({ permission: 'BLOCK', dailyDrawdownKnown: true, dailyDrawdown: 0.04 });
  });
  it('does not carry lifetime unrealized losses into a verified flat day', async () => {
    database([snapshot('2026-09-27', 100000, -10000), clean[1]], {}, -10000);
    expect(await loadAdminRiskSnapshot('workspace-a')).toMatchObject({ permission: 'GO', dailyDrawdownKnown: true, dailyDrawdown: 0 });
  });
  it('uses registered server observations instead of conflicting browser values', async () => {
    database([snapshot('2026-09-27', 999999, 100000), clean[1]]);
    const original = vi.mocked(q).getMockImplementation()!;
    vi.mocked(q).mockImplementation(async (sql, params) => {
      if (sql.includes('FROM account_equity_capture')) return [{ enabled: true, last_error: null }];
      if (sql.includes('FROM account_equity_observations')) return [
        { ...snapshot('2026-09-27', 96000, -14000), captured_at: now.toISOString() },
        { ...clean[1], captured_at: '2026-09-26T23:50:00Z' },
      ];
      return original(sql, params);
    });
    expect(await loadAdminRiskSnapshot('workspace-a')).toMatchObject({ permission: 'BLOCK', equity: 96000, dailyDrawdown: 0.04 });
  });

});
