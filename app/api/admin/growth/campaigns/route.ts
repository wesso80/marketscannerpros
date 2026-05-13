import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { createCampaign, listCampaigns } from '@/lib/growth/db';
import type { Platform } from '@/lib/growth/types';

const VALID_PLATFORMS: Platform[] = ['x', 'instagram'];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const workspaceId = auth.workspaceId ?? 'admin';
  try {
    const campaigns = await listCampaigns(workspaceId);
    return NextResponse.json({ campaigns });
  } catch (err: any) {
    if (err.message?.includes('does not exist')) {
      return NextResponse.json({ campaigns: [], message: 'social_campaigns table not created yet — run migration 076.' });
    }
    console.error('[growth/campaigns] list failed:', err);
    return NextResponse.json({ error: 'failed to list campaigns', details: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const { name, goal, audience, offer, tone, platforms } = body ?? {};
  if (typeof name !== 'string' || name.length < 2) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (typeof goal !== 'string' || goal.length < 3) return NextResponse.json({ error: 'goal required' }, { status: 400 });
  if (typeof audience !== 'string' || audience.length < 3) return NextResponse.json({ error: 'audience required' }, { status: 400 });

  const cleanedPlatforms: Platform[] | undefined = Array.isArray(platforms)
    ? platforms.filter((p: unknown): p is Platform => typeof p === 'string' && VALID_PLATFORMS.includes(p as Platform))
    : undefined;

  const workspaceId = auth.workspaceId ?? 'admin';
  const createdBy = auth.cid ?? 'admin';

  const campaign = await createCampaign({
    workspaceId,
    name,
    goal,
    offer: typeof offer === 'string' ? offer : null,
    audience,
    tone: typeof tone === 'string' ? tone : undefined,
    platforms: cleanedPlatforms,
    createdBy,
  });
  return NextResponse.json({ campaign });
}
