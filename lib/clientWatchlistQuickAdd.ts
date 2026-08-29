/* ---------------------------------------------------------------------------
   Client helper: add a symbol to the Workspace watchlist from any research
   surface with a single call. Talks to POST /api/watchlists/quick-add, which
   finds-or-creates the destination watchlist server-side.
   --------------------------------------------------------------------------- */

export type QuickAddAssetType = 'equity' | 'crypto';

export interface QuickAddResult {
  ok: boolean;
  /** True when the symbol was already on the list (no-op update). */
  alreadyPresent?: boolean;
  /** Name of the watchlist the symbol landed in. */
  watchlistName?: string;
  /** 401 = not signed in; 403 = list limit reached; other = generic failure. */
  status: number;
  error?: string;
}

export async function quickAddToWatchlist(
  symbol: string,
  opts: { assetType?: QuickAddAssetType; note?: string } = {},
): Promise<QuickAddResult> {
  const clean = symbol?.trim();
  if (!clean) return { ok: false, status: 400, error: 'Symbol required' };

  try {
    const res = await fetch('/api/watchlists/quick-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: clean, assetType: opts.assetType, note: opts.note }),
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      return {
        ok: true,
        alreadyPresent: Boolean(data?.alreadyPresent),
        watchlistName: data?.watchlist?.name,
        status: res.status,
      };
    }

    const data = await res.json().catch(() => ({}));
    return { ok: false, status: res.status, error: data?.error || 'Failed to add to watchlist' };
  } catch {
    return { ok: false, status: 0, error: 'Network error' };
  }
}
