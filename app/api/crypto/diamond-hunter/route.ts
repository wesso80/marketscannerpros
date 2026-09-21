import { NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { runDiamondHunterScan } from '@/lib/diamondHunterScanner';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = await runDiamondHunterScan();
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=30' },
    });
  } catch (error) {
    console.error('[DiamondHunter] scan failed:', error);
    return NextResponse.json({ error: 'Diamond Hunter scan failed' }, { status: 502 });
  }
}
