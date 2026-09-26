import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws-1', tier: 'pro' }) }));
vi.mock('@/lib/proTraderAccess', () => ({ hasPaidSessionAccess: () => true }));

import { PUT as updateWatchlist } from '@/app/api/watchlists/route';
import { afterWatchlistDeleted, upsertWatchlistItem, watchlistNameError } from '@/lib/watchlist/listState';

describe('upsertWatchlistItem', () => {
  const items = [{ id: '1', symbol: 'AAPL', notes: 'x' }, { id: '2', symbol: 'MSFT', notes: null }];
  it('re-adding a listed symbol replaces it in place (no duplicate card, not counted as added)', () => {
    const r = upsertWatchlistItem(items, { id: '1', symbol: 'AAPL', notes: 'x' });
    expect(r.added).toBe(false);
    expect(r.items).toHaveLength(2);
    expect(r.items.map((i) => i.symbol)).toEqual(['AAPL', 'MSFT']);
  });
  it('matches by symbol case-insensitively too', () => {
    expect(upsertWatchlistItem(items, { id: '9', symbol: 'msft', notes: null }).added).toBe(false);
  });
  it('appends a new symbol', () => {
    const r = upsertWatchlistItem(items, { id: '3', symbol: 'NVDA', notes: null });
    expect(r.added).toBe(true);
    expect(r.items.map((i) => i.symbol)).toEqual(['AAPL', 'MSFT', 'NVDA']);
  });
});

describe('afterWatchlistDeleted', () => {
  const lists = [{ id: 'a', name: 'A', item_count: 1 }, { id: 'b', name: 'B', item_count: 0 }];
  it('selects the first remaining list when the selected one is deleted', () => {
    expect(afterWatchlistDeleted(lists, 'a', 'a')).toEqual({ lists: [lists[1]], selected: lists[1] });
  });
  it('keeps the current selection when another list is deleted', () => {
    expect(afterWatchlistDeleted(lists, 'b', 'a').selected).toEqual(lists[0]);
  });
  it('selects nothing when the last list is deleted', () => {
    expect(afterWatchlistDeleted([lists[0]], 'a', 'a')).toEqual({ lists: [], selected: null });
  });
});

describe('watchlistNameError', () => {
  it('rejects blank, non-string and over-long names', () => {
    expect(watchlistNameError('  ')).toMatch(/required/);
    expect(watchlistNameError(42)).toMatch(/required/);
    expect(watchlistNameError('x'.repeat(51))).toMatch(/50/);
    expect(watchlistNameError('Swing ideas')).toBeNull();
  });
});

describe('PUT /api/watchlists rename', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.q.mockImplementation(async (sql: string) => (sql.includes('UPDATE watchlists') ? [{ id: 'a', name: 'Swing ideas' }] : []));
  });
  const put = (body: unknown) => updateWatchlist(new NextRequest('https://example.test/api/watchlists', {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
  it('renames with a trimmed name', async () => {
    const res = await put({ id: 'a', name: '  Swing ideas ' });
    expect(res.status).toBe(200);
    expect(mocks.q.mock.calls[0][1]).toEqual(['Swing ideas', 'a', 'ws-1']);
  });
  it('refuses a blank name (was saved as an empty name)', async () => {
    const res = await put({ id: 'a', name: '   ' });
    expect(res.status).toBe(400);
    expect(mocks.q).not.toHaveBeenCalled();
  });
});

describe('widget and API wiring', () => {
  const widget = readFileSync(resolve(__dirname, '../components/WatchlistWidget.tsx'), 'utf8');
  const itemsRoute = readFileSync(resolve(__dirname, '../app/api/watchlists/items/route.ts'), 'utf8');
  it('uses the upsert helper instead of appending', () => {
    expect(widget).not.toContain('setItems([...items, data.item])');
    expect(widget).toContain('upsertWatchlistItem(items, data.item');
  });
  it('wires Delete List and Rename into the UI', () => {
    expect(widget).toContain('onClick={() => deleteWatchlist(selectedWatchlist.id)}');
    expect(widget).toContain('onClick={startRename}');
    expect(widget).toMatch(/method: 'PUT'[\s\S]*\/api\/watchlists|\/api\/watchlists'[\s\S]{0,40}method: 'PUT'/);
  });
  it('re-adding a symbol keeps its existing notes', () => {
    expect(itemsRoute).toContain('notes = COALESCE(EXCLUDED.notes, watchlist_items.notes)');
  });
});
