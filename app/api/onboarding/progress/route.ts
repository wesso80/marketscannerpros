import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

/**
 * GET /api/onboarding/progress
 *
 * Returns which onboarding milestones the user has completed.
 * Checks real data per workspace — no extra tracking tables.
 */
export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ authenticated: false });
  }

  const wid = session.workspaceId;

  const [watchlistRows, journalRows, portfolioRows] = await Promise.all([
    q<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM watchlist_items WHERE watchlist_id IN (SELECT id FROM watchlists WHERE workspace_id = $1)`,
      [wid],
    ).catch(() => [{ cnt: 0 }]),
    q<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM journal_entries WHERE workspace_id = $1`,
      [wid],
    ).catch(() => [{ cnt: 0 }]),
    q<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM portfolio_positions WHERE workspace_id = $1`,
      [wid],
    ).catch(() => [{ cnt: 0 }]),
  ]);

  return NextResponse.json({
    authenticated: true,
    hasWatchlist: (watchlistRows[0]?.cnt ?? 0) > 0,
    hasJournal: (journalRows[0]?.cnt ?? 0) > 0,
    hasPortfolio: (portfolioRows[0]?.cnt ?? 0) > 0,
  });
}
