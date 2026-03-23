import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

export async function POST() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await q(
    `INSERT INTO disclosure_acceptance (workspace_id, version, accepted_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (workspace_id) DO UPDATE SET version = $2, accepted_at = NOW()`,
    [session.workspaceId, '1']
  );

  return NextResponse.json({ ok: true });
}
