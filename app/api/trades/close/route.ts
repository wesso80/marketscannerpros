import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const tradeId = Number(body?.tradeId || body?.journalEntryId || 0);
    const exitPrice = Number(body?.exitPrice);
    const exitTs = String(body?.exitTs || new Date().toISOString());
    const reason = String(body?.reason || 'manual').toLowerCase();
    const notes = typeof body?.notes === 'string' ? body.notes : '';

    if (!Number.isFinite(tradeId) || tradeId <= 0) {
      return NextResponse.json({ error: 'tradeId is required' }, { status: 400 });
    }
    if (!Number.isFinite(exitPrice) || exitPrice <= 0) {
      return NextResponse.json({ error: 'Valid exitPrice is required' }, { status: 400 });
    }

    const mappedReason = reason === 'target_hit'
      ? 'tp'
      : reason === 'stop_hit'
      ? 'sl'
      : reason === 'time_stop'
      ? 'time'
      : reason === 'signal_flip'
      ? 'invalidated'
      : 'manual';

    const journalCloseUrl = new URL('/api/journal/close-trade', req.url);
    const response = await fetch(journalCloseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: req.headers.get('cookie') || '',
      },
      body: JSON.stringify({
        journalEntryId: tradeId,
        exitPrice,
        exitTs,
        exitReason: mappedReason,
        closeSource: 'manual',
        notes,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: payload?.error || 'Failed to close trade' }, { status: response.status });
    }

    return NextResponse.json({
      success: true,
      tradeId,
      decisionPacketId: payload?.decisionPacketId || body?.decisionPacketId || null,
      close: payload,
    });
  } catch (error) {
    console.error('[trades/close] POST error:', error);
    return NextResponse.json({ error: 'Failed to close trade' }, { status: 500 });
  }
}
