import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_EQUITY_BAR_STALE_SESSIONS,
  createEquityBarStaleRun,
  equityBarStaleSessionLimit,
  equityDailyBarIsStale,
  equityDailyBarSessionsBehind,
} from '@/lib/signals/equityBarStale';

const NOW = Date.parse('2026-10-10T15:00:00Z');

describe('equity daily bar staleness', () => {
  afterEach(() => {
    delete process.env.EQUITY_BAR_STALE_SESSIONS;
  });

  it('ignores a 2018 bar and keeps a bar on the last completed session', () => {
    expect(equityDailyBarIsStale('2018-06-14', NOW)).toBe(true);
    expect(equityDailyBarSessionsBehind('2018-06-14', NOW)).toBeGreaterThan(DEFAULT_EQUITY_BAR_STALE_SESSIONS);
    expect(equityDailyBarIsStale('2026-10-09', NOW)).toBe(false);
    expect(equityDailyBarSessionsBehind('2026-10-09', NOW)).toBe(0);
  });

  it('allows 5 US sessions behind and skips the 6th', () => {
    expect(equityDailyBarSessionsBehind('2026-10-02', NOW)).toBe(5);
    expect(equityDailyBarIsStale('2026-10-02', NOW)).toBe(false);
    expect(equityDailyBarSessionsBehind('2026-10-01', NOW)).toBe(6);
    expect(equityDailyBarIsStale('2026-10-01', NOW)).toBe(true);
  });

  it('reads EQUITY_BAR_STALE_SESSIONS and falls back when the value is unusable', () => {
    expect(equityBarStaleSessionLimit({})).toBe(5);
    expect(equityBarStaleSessionLimit({ EQUITY_BAR_STALE_SESSIONS: '2' })).toBe(2);
    expect(equityDailyBarIsStale('2026-10-06', NOW, 2)).toBe(true);
    expect(equityBarStaleSessionLimit({ EQUITY_BAR_STALE_SESSIONS: 'nope' })).toBe(5);
    expect(equityBarStaleSessionLimit({ EQUITY_BAR_STALE_SESSIONS: '99' })).toBe(5);
  });

  it('logs each skipped symbol once per run', () => {
    const log = vi.fn();
    const run = createEquityBarStaleRun('worker', log);
    expect(run.skip('sto', '2018-06-14', NOW)).toBe(true);
    expect(run.skip('STO', '2018-06-14', NOW)).toBe(true);
    expect(run.skip('AAPL', '2026-10-09', NOW)).toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain('[worker] STO:');
    expect(String(log.mock.calls[0][0])).toContain('2018-06-14');

    const next = createEquityBarStaleRun('worker', log);
    expect(next.skip('STO', '2018-06-14', NOW)).toBe(true);
    expect(log).toHaveBeenCalledTimes(2);
  });
});
