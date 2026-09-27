import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ q: vi.fn(), atomicQueries: (work: () => Promise<unknown>) => work() }));
vi.mock('@/lib/admin/portfolio-lab/portfolioStore', () => ({
  getDefaultPortfolio: vi.fn(), getPortfolioById: vi.fn(), insertSnapshot: vi.fn(),
  listOrders: vi.fn(), listOpenPositions: vi.fn(), updatePortfolioBalances: vi.fn(),
}));
vi.mock('@/lib/admin/portfolio-lab/journalEngine', () => ({ writeJournal: vi.fn() }));
vi.mock('@/lib/admin/edgePacketSnapshots', () => ({ loadEdgePackets: vi.fn() }));
vi.mock('@/lib/admin/portfolio-lab/decisionEngine', () => ({ runDecisionEngine: vi.fn() }));
vi.mock('@/lib/admin/portfolio-lab/benchmarkEngine', () => ({ captureBenchmarkSnapshot: vi.fn() }));
vi.mock('@/lib/admin/portfolio-lab/playbookEngine', () => ({ rollupPlaybookPerformance: vi.fn() }));

import { q } from '@/lib/db';
import * as store from '@/lib/admin/portfolio-lab/portfolioStore';
import { writeJournal } from '@/lib/admin/portfolio-lab/journalEngine';
import { loadEdgePackets } from '@/lib/admin/edgePacketSnapshots';
import { runDecisionEngine } from '@/lib/admin/portfolio-lab/decisionEngine';
import { simulateArcaCycle } from '@/lib/admin/portfolio-lab/simulateCycle';
import { captureBenchmarkSnapshot } from '@/lib/admin/portfolio-lab/benchmarkEngine';
import { rollupPlaybookPerformance } from '@/lib/admin/portfolio-lab/playbookEngine';
import { ARCA_DEFAULT_SETTINGS } from '@/lib/admin/portfolio-lab/constants';
import type { ArcaPortfolio } from '@/lib/admin/portfolio-lab/types';

const portfolio = { id: 'p', workspaceId: 'w', mode: 'SIMULATED', status: 'ACTIVE',
  currentCash: 200000, totalEquity: 200000, startingBalance: 200000, realisedPnl: 0,
  unrealisedPnl: 0, settings: ARCA_DEFAULT_SETTINGS } as ArcaPortfolio;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captureBenchmarkSnapshot).mockResolvedValue({ ok: false, benchmarkSymbol: 'SPY' } as never);
  vi.mocked(rollupPlaybookPerformance).mockResolvedValue({ playbooksUpdated: 0 } as never);
  vi.mocked(q).mockImplementation(async (sql) => sql.includes('pg_try_advisory') ? [{ locked: true }] : []);
  vi.mocked(store.getDefaultPortfolio).mockResolvedValue(portfolio);
  vi.mocked(store.getPortfolioById).mockResolvedValue(portfolio);
  vi.mocked(store.listOrders).mockResolvedValue([]);
  vi.mocked(store.listOpenPositions).mockResolvedValue([]);
  vi.mocked(loadEdgePackets).mockResolvedValue([]);
  vi.mocked(runDecisionEngine).mockResolvedValue({ selected: [], rejected: [], scannedPackets: 0 });
});

describe('paper cycle coordination', () => {
  it('refuses an overlapping cycle before any ledger writes', async () => {
    vi.mocked(q).mockResolvedValue([{ locked: false }]);
    await expect(simulateArcaCycle({ workspaceId: 'w' })).rejects.toThrow('already running');
    expect(store.insertSnapshot).not.toHaveBeenCalled();
    expect(loadEdgePackets).not.toHaveBeenCalled();
  });
  it('skips a committed retry in the same window', async () => {
    vi.mocked(q).mockImplementation(async (sql) => sql.includes('pg_try_advisory') ? [{ locked: true }] : sql.includes('arca_trade_journal') ? [{ id: 1 }] : []);
    const result = await simulateArcaCycle({ workspaceId: 'w' });
    expect(result.notes[0]).toContain('retry skipped');
    expect(store.insertSnapshot).not.toHaveBeenCalled();
  });
  it('rechecks pause status after acquiring the row lock', async () => {
    vi.mocked(store.getPortfolioById).mockResolvedValue({ ...portfolio, status: 'PAUSED' });
    const result = await simulateArcaCycle({ workspaceId: 'w' });
    expect(result.notes[0]).toContain('PAUSED');
    expect(loadEdgePackets).not.toHaveBeenCalled();
    expect(writeJournal).not.toHaveBeenCalled();
  });
  it('records a completed no-trade cycle and only loads packets once', async () => {
    const result = await simulateArcaCycle({ workspaceId: 'w' });
    expect(result.ordersCreated).toBe(0);
    expect(loadEdgePackets).toHaveBeenCalledOnce();
    expect(runDecisionEngine).toHaveBeenCalledWith(expect.objectContaining({ rows: [] }));
    expect(store.insertSnapshot).toHaveBeenCalledWith(expect.objectContaining({ totalEquity: 200000 }));
    expect(writeJournal).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('Paper cycle completed:'), journalType: 'REVIEW' }));
  });
});
it('completes a 500-symbol rejected cycle with one bulk audit write', async () => {
  vi.mocked(runDecisionEngine).mockResolvedValue({ selected: [], scannedPackets: 500,
    rejected: Array.from({ length: 500 }, (_, i) => ({ packetId: `p${i}`, symbol: `S${i}`, passed: false, reasons: ['freshness_stale'] })) });
  vi.mocked(q).mockImplementation(async sql => sql.includes('pg_try_advisory') ? [{ locked: true }] :
    sql.includes('WITH input AS') ? Array.from({ length: 500 }, (_, i) => ({ id: String(i) })) : []);
  const result = await simulateArcaCycle({ workspaceId: 'w' });
  expect(result.noTradeRowsWritten).toBe(500);
  expect(result.gateRejections).toBe(500);
  expect(vi.mocked(q).mock.calls.filter(([sql]) => sql.includes('WITH input AS'))).toHaveLength(1);
  expect(writeJournal).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining('Paper cycle completed:') }));
});
