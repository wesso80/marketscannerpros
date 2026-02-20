import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { getLatestGlobalSnapshot, getLatestMicroStates } from '@/lib/upe';

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [globalSnapshot, microStates] = await Promise.all([
      getLatestGlobalSnapshot(),
      getLatestMicroStates(),
    ]);

    return NextResponse.json({
      globalSnapshot,
      microStates,
      workspaceId: session.workspaceId,
    });
  } catch (error) {
    console.error('[upe/snapshot/global] failed', error);
    return NextResponse.json({ error: 'Failed to load global snapshot' }, { status: 500 });
  }
}
