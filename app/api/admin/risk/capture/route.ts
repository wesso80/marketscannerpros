import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { enableAccountCapture } from '@/lib/portfolio/serverCapture';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  // Workspace comes only from authenticated identity; the request cannot target another account.
  try {
    return NextResponse.json(await enableAccountCapture(auth.workspaceId));
  } catch (error) {
    console.error('[admin:risk:capture]', error);
    return NextResponse.json({ error: 'Capture failed; saved inputs could not be read consistently.' }, { status: 500 });
  }
}
