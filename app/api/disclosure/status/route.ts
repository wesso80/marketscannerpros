import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ accepted: false });
  }

  const rows = await q(
    'SELECT 1 FROM disclosure_acceptance WHERE workspace_id = $1 LIMIT 1',
    [session.workspaceId]
  );

  return NextResponse.json({ accepted: rows.length > 0 });
}
