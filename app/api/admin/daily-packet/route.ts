/**
 * GET /api/admin/daily-packet
 *   ?format=json  (default) — returns the packet object
 *   ?format=html            — returns the rendered print-friendly HTML
 *
 * Auth: requireAdmin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { buildDailyPacket } from '@/lib/dailyPacket/builder';
import { renderDailyPacketHtml } from '@/lib/dailyPacket/htmlRenderer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await requireAdmin(req);
  if (!session.ok || !session.workspaceId) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const format = url.searchParams.get('format') ?? 'json';
  try {
    const packet = await buildDailyPacket(session.workspaceId);
    if (format === 'html') {
      const html = renderDailyPacketHtml(packet);
      return new Response(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return NextResponse.json({ ok: true, packet });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
