import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { DISCLOSURE_VERSION } from '@/lib/disclosure';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ accepted: false });
  }

  try {
    const rows = await q(
      'SELECT 1 FROM disclosure_acceptance WHERE workspace_id = $1 AND version = $2 LIMIT 1',
      [session.workspaceId, DISCLOSURE_VERSION]
    );
    return NextResponse.json({ accepted: rows.length > 0, version: DISCLOSURE_VERSION }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error('[disclosure] Acceptance status unavailable');
    return NextResponse.json({ error: 'Acknowledgement status unavailable.' }, { status: 503 });
  }
}
