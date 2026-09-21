import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { DISCLOSURE_VERSION } from '@/lib/disclosure';

export async function POST(request: Request) {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (body?.version !== DISCLOSURE_VERSION) {
    return NextResponse.json({ error: 'Please reload and review the current disclosure.' }, { status: 409 });
  }

  try {
    await q(
    `INSERT INTO disclosure_acceptance (workspace_id, version, accepted_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET version = $2, accepted_at = NOW()
     WHERE disclosure_acceptance.version <> EXCLUDED.version`,
    [session.workspaceId, DISCLOSURE_VERSION]
  );
    return NextResponse.json({ ok: true, version: DISCLOSURE_VERSION });
  } catch {
    console.error('[disclosure] Acceptance could not be saved');
    return NextResponse.json({ error: 'Acknowledgement could not be saved. Please retry.' }, { status: 503 });
  }
}
