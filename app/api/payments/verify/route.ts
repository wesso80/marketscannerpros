import { NextResponse } from 'next/server';
import { verifySession } from '@/lib/payments';
import { setSubscription } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const { paid, workspaceId } = await verifySession(sessionId);

    if (paid && workspaceId) {
      await setSubscription(workspaceId, 'paid', 'active');
      return NextResponse.json({ paid: true, workspaceId });
    }

    return NextResponse.json({ paid: false }, { status: 400 });
  } catch (error: any) {
    console.error('[VERIFY ERROR]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
