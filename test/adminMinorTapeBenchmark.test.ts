import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const m = vi.hoisted(() => ({ q: vi.fn(async (_s: string, _p?: unknown[]) => [] as unknown[]), quote: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: m.q }));
vi.mock('@/lib/marketData/index', () => ({ getQuote: m.quote }));

import { captureBenchmarkSnapshot, isUnchangedBenchmark } from '@/lib/admin/portfolio-lab/benchmarkEngine';

const portfolio = { id: 'p1', workspaceId: 'w1', startingBalance: 200000, totalEquity: 200000, settings: { benchmarkSymbol: 'SPY' } } as never;

beforeEach(() => {
  m.q.mockReset();
  m.quote.mockReset();
  m.quote.mockResolvedValue({ data: { price: 771.35 } });
});

describe('ARCA benchmark snapshots (m3)', () => {
  it('isUnchangedBenchmark compares price and ARCA return', () => {
    expect(isUnchangedBenchmark({ benchmark_value: '771.35', arca_return_pct: '0' }, 771.35, 0)).toBe(true);
    expect(isUnchangedBenchmark({ benchmark_value: '771.35', arca_return_pct: '0' }, 772, 0)).toBe(false);
    expect(isUnchangedBenchmark({ benchmark_value: '771.35', arca_return_pct: '0' }, 771.35, 0.5)).toBe(false);
    expect(isUnchangedBenchmark({ benchmark_value: '771.35', arca_return_pct: null }, 771.35, 0)).toBe(false);
  });

  it('does not insert a row identical to the latest one (weekend/overnight repeats)', async () => {
    m.q.mockImplementation(async (sql: string) => (String(sql).includes('ORDER BY snapshot_at DESC') ? [{ benchmark_value: '771.35', arca_return_pct: '0' }] : []));
    const r = await captureBenchmarkSnapshot({ portfolio });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe('unchanged_since_last_snapshot');
    expect(m.q.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO arca_benchmark_snapshots'))).toBe(false);
  });

  it('inserts when the price moved', async () => {
    m.q.mockImplementation(async (sql: string) => (String(sql).includes('ORDER BY snapshot_at DESC') ? [{ benchmark_value: '770.00', arca_return_pct: '0' }] : []));
    await captureBenchmarkSnapshot({ portfolio });
    expect(m.q.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO arca_benchmark_snapshots'))).toBe(true);
  });
});

describe('Priority Desk tape (m1)', () => {
  it('appends a tape event only when the top candidates change', async () => {
    const src = readFileSync('app/api/admin/priority-desk/route.ts', 'utf8');
    expect(src).toContain('lastTopKeys.get(tapeKey) !== topKey');
    expect(src).not.toContain('Priority Desk read ${all.length} current saved packets');
    const { priorityDeskTopKey } = await import('@/app/api/admin/priority-desk/route');
    expect(priorityDeskTopKey([{ symbol: 'MA' }, { symbol: 'NVDA' }] as never)).toBe('MA, NVDA');
    expect(priorityDeskTopKey([])).toBe('');
  });
});
