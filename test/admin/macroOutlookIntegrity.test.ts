import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMacroOutlookSnapshot, macroMemoBlockReason, type MacroOutlookSnapshot } from '@/lib/admin/macroOutlook';
import { q } from '@/lib/db';
import { avFetchAdmin } from '@/lib/avRateGovernor';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
vi.mock('@/lib/avRateGovernor', () => ({ avFetchAdmin: vi.fn() }));
const keys = ['FED_FUNDS_RATE', 'US10Y', 'US2Y', 'YIELD_2S10S', 'VIX', 'DXY', 'CREDIT_HY_OAS', 'UNRATE', 'CPI_YOY'];
const snapshot = () => ({ spy: { status: 'ok' }, series: Object.fromEntries(keys.map(k => [k, { status: 'ok' }])) }) as MacroOutlookSnapshot;
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-27T12:00:00Z')); vi.stubEnv('ALPHA_VANTAGE_API_KEY', 'test-key'); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('macro freshness', () => {
  it('withholds the 0-of-9 current-series case', () => {
    const s = snapshot(); for (const series of Object.values(s.series)) series.status = 'stale';
    expect(macroMemoBlockReason(s)).toContain('withheld');
  });
  it('requires every named series and current SPY before generating a current call', () => {
    expect(macroMemoBlockReason(snapshot())).toBeNull();
    const s = snapshot(); delete s.series.VIX;
    expect(macroMemoBlockReason(s)).toContain('VIX');
    const oldSpy = snapshot(); oldSpy.spy.status = 'stale';
    expect(macroMemoBlockReason(oldSpy)).toContain('SPY');
  });
  it('computes CPI YoY from matching months and keeps missing prior comparisons null', async () => {
    vi.mocked(q).mockResolvedValue([
      { observed_on: '2026-09-01', value: '309' },
      { observed_on: '2026-08-01', value: '306' },
      { observed_on: '2025-09-01', value: '300' },
    ]);
    vi.mocked(avFetchAdmin).mockResolvedValue({ 'Time Series (Daily)': {} });
    const s = await buildMacroOutlookSnapshot();
    expect(s.series.CPI_YOY.latest).toBeCloseTo(3);
    expect(s.series.CPI_YOY.status).toBe('ok');
    expect(s.series.CPI_YOY.prior).toBeNull();
    expect(s.series.CPI_YOY.delta).toBeNull();
  });
  it('uses observation dates rather than request time and accepts DB string dates', async () => {
    vi.mocked(q).mockResolvedValue([{ observed_on: '2026-06-10', value: '100' }]);
    vi.mocked(avFetchAdmin).mockResolvedValue({ 'Time Series (Daily)': { '2026-06-10': { '4. close': '650' } } });
    const s = await buildMacroOutlookSnapshot();
    expect(s.spy.status).toBe('stale');
    expect(Object.values(s.series).filter(s => s.status !== "ok")).toHaveLength(9);
    expect(s.series.CPI_YOY.latest).toBeNull();
    expect(s.health).toBe('unavailable');
    expect(macroMemoBlockReason(s)).not.toBeNull();
  });
});
