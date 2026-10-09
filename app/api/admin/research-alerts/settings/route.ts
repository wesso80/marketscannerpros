import { validAdminMutationOrigin } from '@/lib/admin/mutationOrigin';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { readResearchNotificationSettings, setResearchNotificationsPaused } from '@/lib/admin/researchNotificationSettings';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  try { return NextResponse.json(await readResearchNotificationSettings(auth.workspaceId)); }
  catch { return NextResponse.json({ error: 'Notification settings unavailable' }, { status: 503 }); }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const origin = req.headers.get('origin');
  if (!validAdminMutationOrigin(origin, req.nextUrl.origin)) return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (typeof body?.paused !== 'boolean') return NextResponse.json({ error: 'paused must be a boolean' }, { status: 400 });
  try { return NextResponse.json(await setResearchNotificationsPaused(auth.workspaceId, body.paused)); }
  catch { return NextResponse.json({ error: 'Notification settings could not be saved' }, { status: 503 }); }
}
