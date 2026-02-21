import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { labelSignalOutcomes } from '@/lib/signals/outcomeLabeler';

/**
 * POST /api/signals/label-outcomes
 * Trigger signal outcome labeling for the current user's workspace.
 * Can be called manually or from a cron job.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await labelSignalOutcomes(session.workspaceId);

    return NextResponse.json({
      success: true,
      labeled: result.labeled,
      errors: result.errors,
    });
  } catch (err) {
    console.error('[label-outcomes] Error:', err);
    return NextResponse.json({ error: 'Failed to label outcomes' }, { status: 500 });
  }
}
