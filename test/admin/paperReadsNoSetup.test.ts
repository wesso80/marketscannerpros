import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ tables: { excursions: true, marks: true, signals: true }, sql: [] as string[], absent: false, probeFails: false, fetch: vi.fn(), redisGet: vi.fn(async () => null) }));
vi.mock('@/lib/db', () => ({
  atomicQueries: async (work: () => Promise<unknown>) => work(),
  q: vi.fn(async (sql: string) => {
    m.sql.push(sql);
    if (!/^SELECT\b/i.test(sql.trim())) throw new Error('Read attempted a mutation: ' + sql);
    if (sql.includes('to_regclass')) { if (m.probeFails) throw Error('database unavailable'); return [m.tables]; }
    if (sql.includes('AS net')) return [{ net: '0', fees: '0', count: '0', invalid: '0' }];
    if (/crypto_trade_excursions|crypto_book_marks|crypto_signal_ledger/.test(sql)) {
      if (sql.includes('crypto_trade_excursions') && !m.tables.excursions) throw Error('missing excursions');
      if (sql.includes('crypto_book_marks') && !m.tables.marks) throw Error('missing marks');
      if (sql.includes('crypto_signal_ledger') && !m.tables.signals) throw Error('missing signals');
    }
    return [];
  }),
}));
vi.mock('@/lib/redis', () => ({ getRedis: () => ({ get: m.redisGet }) }));
vi.mock('@/lib/admin/portfolio-lab/portfolioStore', () => {
  const account = { id: 'book', workspaceId: 'workspace', name: 'Paper', startingBalance: 1000, currentCash: 1000, totalEquity: 1000, realisedPnl: 0, unrealisedPnl: 0 };
  return { getDefaultPortfolio: vi.fn(async () => m.absent ? null : account), getPortfolioById: vi.fn(async () => account), listOpenPositions: vi.fn(async () => []), listTrades: vi.fn(async () => []), listJournal: vi.fn(async () => []), insertPortfolio: vi.fn() };
});
import { cryptoPaperState, cryptoPaperTradeLog } from '@/lib/admin/cryptoPaper';
import { readPaperSchema } from '@/lib/admin/paperReadSchema';
import { excursionTablesReady } from '@/lib/admin/cryptoPaperExcursion';
import { signalLedgerReady } from '@/lib/admin/cryptoSignalLedger';
beforeEach(() => {
  m.tables = { excursions: true, marks: true, signals: true }; m.sql = []; m.absent = false; m.probeFails = false;
  m.fetch.mockReset(); m.fetch.mockRejectedValue(new Error('Provider calls forbidden during reads'));
  vi.stubGlobal('fetch', m.fetch);
});
afterEach(() => { vi.unstubAllGlobals(); });
describe('paper reads never initialize tables', () => {
  it('reads existing research tables in a cold process without changing writer readiness', async () => {
    expect(excursionTablesReady()).toBe(false); expect(signalLedgerReady()).toBe(false);
    const result = await cryptoPaperState('workspace');
    expect(result.giveBack).not.toBeNull(); expect(result.signalLedger).not.toBeNull();
    expect(excursionTablesReady()).toBe(false); expect(signalLedgerReady()).toBe(false);
    expect(m.sql.every(sql => /^SELECT\b/.test(sql.trim()))).toBe(true);
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it('preserves the core account when optional tables have not been migrated', async () => {
    m.tables = { excursions: false, marks: false, signals: false };
    const result = await cryptoPaperState('workspace');
    expect(result.portfolio?.id).toBe('book'); expect(result.giveBack).toBeNull(); expect(result.signalLedger).toBeNull();
    expect(m.sql.filter(sql => !sql.includes('to_regclass')).join('\n')).not.toMatch(/crypto_trade_excursions|crypto_book_marks|crypto_signal_ledger/);
  });
  it('does not query book marks when only excursions exist', async () => {
    m.tables.marks = false;
    const result = await cryptoPaperState('workspace');
    expect(result.giveBack).toBeNull(); expect(result.signalLedger).not.toBeNull();
    expect(m.sql.some(sql => sql.includes('LEFT JOIN crypto_trade_excursions'))).toBe(true);
    expect(m.sql.filter(sql => !sql.includes('to_regclass')).join('\n')).not.toContain('FROM crypto_book_marks');
  });
  it('exports CSV with and without research tables without DDL or provider calls', async () => {
    for (const exists of [true, false]) {
      m.tables.excursions = exists;
      expect(typeof await cryptoPaperTradeLog('workspace')).toBe('string');
    }
    expect(m.sql.every(sql => /^SELECT\b/.test(sql.trim()))).toBe(true);
    expect(m.fetch).not.toHaveBeenCalled();
  });
  it('returns no account without creating one', async () => {
    m.absent = true;
    expect((await cryptoPaperState('workspace')).portfolio).toBeNull();
    expect(await cryptoPaperTradeLog('workspace')).toBeNull();
    expect(m.sql.every(sql => /^SELECT\b/.test(sql.trim()))).toBe(true);
  });
  it('a failed schema probe remains unavailable without retrying setup', async () => {
    m.probeFails = true;
    expect(await readPaperSchema()).toEqual({ excursions: false, marks: false, signals: false });
    expect(m.sql).toHaveLength(1);
  });
});
