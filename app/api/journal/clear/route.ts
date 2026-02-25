import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

/**
 * DELETE /api/journal/clear
 * Wipes all journal entries (and related snapshots) for the authenticated workspace.
 */
export async function DELETE(_req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { workspaceId } = session;

    // Delete child tables first (FK references), then journal entries
    await q(`DELETE FROM journal_trade_snapshots WHERE workspace_id = $1`, [workspaceId]);
    await q(`DELETE FROM journal_entries WHERE workspace_id = $1`, [workspaceId]);

    return NextResponse.json({ ok: true, message: 'Journal cleared' });
  } catch (err: unknown) {
    console.error('[journal/clear] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
