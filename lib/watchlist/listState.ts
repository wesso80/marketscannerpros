/**
 * Watchlist widget list-state helpers (TR-23). Pure, so they can be tested.
 */

export interface ItemLike {
  id: string;
  symbol: string;
}

export interface ListLike {
  id: string;
  name: string;
  item_count: number;
}

/**
 * Put the item returned by POST /api/watchlists/items into the list. The server upserts on
 * (watchlist, symbol), so re-adding a symbol returns the existing row: replace it in place
 * instead of appending a duplicate card. `added` is false when it was already listed.
 */
export function upsertWatchlistItem<T extends ItemLike>(items: T[], item: T): { items: T[]; added: boolean } {
  const sym = String(item.symbol ?? '').toUpperCase();
  const idx = items.findIndex((i) => i.id === item.id || String(i.symbol ?? '').toUpperCase() === sym);
  if (idx === -1) return { items: [...items, item], added: true };
  const next = items.slice();
  next[idx] = { ...items[idx], ...item };
  return { items: next, added: false };
}

/** Lists and selection after a watchlist is deleted: select the first remaining list, if any. */
export function afterWatchlistDeleted<T extends ListLike>(
  lists: T[],
  deletedId: string,
  selectedId: string | null | undefined,
): { lists: T[]; selected: T | null } {
  const remaining = lists.filter((w) => w.id !== deletedId);
  const keep = selectedId && selectedId !== deletedId ? remaining.find((w) => w.id === selectedId) : undefined;
  return { lists: remaining, selected: keep ?? remaining[0] ?? null };
}

export const WATCHLIST_NAME_MAX = 50; // same cap as POST /api/watchlists

/** Error message for an invalid watchlist name, or null when it is fine. */
export function watchlistNameError(name: unknown): string | null {
  if (typeof name !== 'string' || !name.trim()) return 'Watchlist name is required';
  if (name.trim().length > WATCHLIST_NAME_MAX) return `Watchlist name must be ${WATCHLIST_NAME_MAX} characters or fewer`;
  return null;
}
