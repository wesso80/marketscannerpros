/** TR-38 (Portfolio closed book vs Journal) and TR-39 (Trade Ledger Realized $ + Journal link cue). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import {
  chronologicalCloses, classifyClosedJournalLinks, closedLinkLabel, countsInClosedBook,
  dropServerOwnedRows, realizedByLink, splitClosedBook,
} from '@/lib/portfolio/closedReconcile';

const mocks = vi.hoisted(() => ({ q: vi.fn(), query: vi.fn(), tx: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q, tx: mocks.tx }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn(async () => ({ workspaceId: 'test-workspace' })) }));
vi.mock('@/lib/risk/runtimeSnapshot', () => ({ getRuntimeRiskSnapshotInput: vi.fn(async () => ({})) }));
vi.mock('@/lib/risk-governor-hard', () => ({ buildPermissionSnapshot: vi.fn(() => ({ risk_mode: 'NORMAL' })) }));
import { GET } from '@/app/api/portfolio/route';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const page = read('app/tools/portfolio/page.tsx');
const closeTrade = read('app/api/journal/close-trade/route.ts');

const row = (id: number, journal_entry_id: number | null, journal_row_id: number | null, extra: Record<string, unknown> = {}) =>
  ({ id, journal_entry_id, journal_row_id, journal_is_open: false, journal_status: 'CLOSED', ...extra });

describe('TR-38: classify closed rows against the Journal', () => {
  it('manual, linked, orphaned (journal entry deleted), re-opened and duplicate rows', () => {
    const links = classifyClosedJournalLinks([
      row(1, null, null),
      row(2, 10, 10),
      row(3, 11, null),
      row(4, 12, 12, { journal_is_open: true, journal_status: 'OPEN' }),
      row(5, 13, 13),
      row(6, 13, 13),
    ]);
    expect(Object.fromEntries(links)).toEqual({
      1: 'manual', 2: 'journal', 3: 'journal_missing', 4: 'journal_reopened', 5: 'journal_duplicate', 6: 'journal',
    });
  });

  it('only Journal-backed and Portfolio-only rows count; unclassified (local) rows keep counting', () => {
    expect(['journal', 'manual', undefined].every((l) => countsInClosedBook(l as never))).toBe(true);
    expect(['journal_missing', 'journal_reopened', 'journal_duplicate'].some((l) => countsInClosedBook(l as never))).toBe(false);
    const { counted, excluded } = splitClosedBook([
      { id: 1, journalLink: 'journal' as const }, { id: 2, journalLink: 'journal_missing' as const }, { id: 3 },
    ]);
    expect(counted.map((r) => r.id)).toEqual([1, 3]);
    expect(excluded.map((r) => r.id)).toEqual([2]);
  });

  it('an orphaned big winner no longer inflates realized P&L (the TR-38 shape: 3 small Journal closes + 1 orphan)', () => {
    const rows = [
      { id: 1, realizedPL: 2, journalLink: 'journal' as const },
      { id: 2, realizedPL: 2.83, journalLink: 'journal' as const },
      { id: 3, realizedPL: 0, journalLink: 'journal' as const },
      { id: 4, realizedPL: 13_000, journalLink: 'journal_missing' as const },
    ];
    const { counted, excluded } = splitClosedBook(rows);
    expect(counted).toHaveLength(3);
    expect(counted.reduce((s, r) => s + r.realizedPL, 0)).toBeCloseTo(4.83, 6);
    expect(excluded.map((r) => r.id)).toEqual([4]);
  });

  it('local fallback drops stale copies of journal-linked rows', () => {
    expect(dropServerOwnedRows([{ id: 1, journalEntryId: 7 }, { id: 2 }, { id: 3, journalEntryId: undefined }]).map((r) => r.id)).toEqual([2, 3]);
  });

  it('equity curve runs oldest close first', () => {
    const rows = [{ id: 3, closeDate: '2026-09-26' }, { id: 2, closeDate: '2026-09-26' }, { id: 1, closeDate: '2026-09-22' }];
    expect(chronologicalCloses(rows).map((r) => r.id)).toEqual([1, 2, 3]);
    expect(page).toContain('chronologicalCloses(closedPositions).reduce(');
  });
});

describe('TR-38: API and close-trade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.tx.mockImplementation(async (work) => work({ query: mocks.query }));
  });

  it('GET labels each closed row and follows the live Journal P&L for linked rows', async () => {
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM portfolio_closed c')) {
        expect(sql).toContain('j.id AS journal_row_id');
        return [
          { id: 1, symbol: 'AAA', side: 'LONG', quantity: '1', entry_price: '10', close_price: '12', entry_date: '2026-09-25', close_date: '2026-09-26', realized_pl: '2', journal_entry_id: 10, journal_row_id: 10, journal_is_open: false, journal_status: 'CLOSED', journal_pl: '3', journal_exit_price: '13' },
          { id: 2, symbol: 'BBB', side: 'LONG', quantity: '100', entry_price: '1', close_price: '2', entry_date: '2026-09-20', close_date: '2026-09-22', realized_pl: '100', journal_entry_id: 11, journal_row_id: null },
          { id: 3, symbol: 'CCC', side: 'LONG', quantity: '1', entry_price: '5', close_price: '6', entry_date: '2026-09-25', close_date: '2026-09-26', realized_pl: '1', journal_entry_id: null, journal_row_id: null },
        ];
      }
      return [];
    });
    const res = await GET(new NextRequest('https://example.test/api/portfolio'));
    const body = await res.json();
    const byId = Object.fromEntries(body.closedPositions.map((p: any) => [p.id, p]));
    expect(byId[1]).toMatchObject({ journalLink: 'journal', realizedPL: 3, closePrice: 13 });
    expect(byId[2]).toMatchObject({ journalLink: 'journal_missing', realizedPL: 100, closePrice: 2 });
    expect(byId[3]).toMatchObject({ journalLink: 'manual', realizedPL: 1 });
  });

  it('close-trade replaces an earlier mirror row for the same journal entry before inserting', () => {
    const del = closeTrade.indexOf('DELETE FROM portfolio_closed WHERE workspace_id = $1 AND journal_entry_id = $2');
    const ins = closeTrade.indexOf('INSERT INTO portfolio_closed');
    expect(del).toBeGreaterThan(0);
    expect(ins).toBeGreaterThan(del);
  });

  it('page counts only splitClosedBook(...).counted and lists the rest as not counted', () => {
    expect(page).toContain('splitClosedBook<ClosedPosition>(data.closedPositions || [])');
    expect(page).toContain('setUncountedClosed(loadedUncounted)');
    expect(page).toContain('data-testid="ledger-uncounted"');
    expect(page).toContain("serverWasEmpty ? dropServerOwnedRows(localClosedRaw) : localClosedRaw");
  });
});

describe('TR-39: Trade Ledger shows Realized $ and the Journal link', () => {
  it('has Realized and Link columns', () => {
    expect(page).toContain('<th scope="col" className="px-2 py-2 text-right">Realized</th>');
    expect(page).toContain('<th scope="col" className="px-2 py-2 text-left">Link</th>');
    expect(page).toContain('{formatSignedMoney(trade.realizedPL)}</td>');
    expect(page).toContain('colSpan={10}');
  });

  it('labels and splits realized by link', () => {
    expect(closedLinkLabel({ journalLink: 'journal' })).toBe('Journal');
    expect(closedLinkLabel({ journalLink: 'manual' })).toBe('Portfolio only');
    expect(closedLinkLabel({ journalLink: 'journal_missing' })).toBe('Journal entry deleted');
    expect(closedLinkLabel({ journalEntryId: 5 })).toBe('Journal');
    expect(closedLinkLabel({})).toBe('Portfolio only');
    expect(realizedByLink([
      { realizedPL: 3, journalLink: 'journal' }, { realizedPL: -1, journalLink: 'manual' }, { realizedPL: 2, journalEntryId: 9 },
    ])).toEqual({ journal: 5, journalCount: 2, manual: -1, manualCount: 1 });
  });
});
