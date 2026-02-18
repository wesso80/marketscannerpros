import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { ensureNotificationSchema } from '@/lib/notifications/tradeEvents';

type NotificationRow = {
  id: number;
  title: string;
  body: string;
  href: string | null;
  metadata: Record<string, unknown> | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ items: [], unreadCount: 0 });
    }

    await ensureNotificationSchema();

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit') || 15)));
    const unreadOnly = url.searchParams.get('unreadOnly') === 'true';

    const items = await q<NotificationRow>(
      `SELECT id, title, body, href, metadata, is_read, read_at, created_at
         FROM notifications
        WHERE workspace_id = $1
          AND ($2::boolean = false OR is_read = false)
        ORDER BY created_at DESC
        LIMIT $3`,
      [session.workspaceId, unreadOnly, limit]
    );

    const unreadRows = await q<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM notifications
        WHERE workspace_id = $1
          AND is_read = false`,
      [session.workspaceId]
    );

    return NextResponse.json({
      items,
      unreadCount: Number(unreadRows[0]?.count || 0),
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[notifications] GET error:', error);
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureNotificationSchema();

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || '').toLowerCase();

    if (action === 'mark_all_read') {
      await q(
        `UPDATE notifications
            SET is_read = true,
                read_at = COALESCE(read_at, NOW())
          WHERE workspace_id = $1
            AND is_read = false`,
        [session.workspaceId]
      );

      return NextResponse.json({ success: true, action: 'mark_all_read' });
    }

    if (action === 'mark_read') {
      const notificationId = Number(body?.notificationId);
      if (!Number.isFinite(notificationId) || notificationId <= 0) {
        return NextResponse.json({ error: 'notificationId is required' }, { status: 400 });
      }

      const rows = await q(
        `UPDATE notifications
            SET is_read = true,
                read_at = COALESCE(read_at, NOW())
          WHERE workspace_id = $1
            AND id = $2
          RETURNING id`,
        [session.workspaceId, notificationId]
      );

      if (!rows.length) {
        return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, action: 'mark_read', notificationId });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('[notifications] POST error:', error);
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 });
  }
}
