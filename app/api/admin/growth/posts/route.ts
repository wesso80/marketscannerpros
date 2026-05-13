import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { listPosts } from '@/lib/growth/db';
import type { Platform, PostStatus } from '@/lib/growth/types';
import { wrapTruth } from '@/lib/admin';

const VALID_STATUSES: PostStatus[] = ['draft', 'review', 'approved', 'posted', 'rejected'];
const VALID_PLATFORMS: Platform[] = ['x', 'instagram'];

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status');
  const platformParam = url.searchParams.get('platform');
  const campaignIdParam = url.searchParams.get('campaignId');
  const limitParam = url.searchParams.get('limit');

  const status =
    statusParam && VALID_STATUSES.includes(statusParam as PostStatus)
      ? (statusParam as PostStatus)
      : undefined;
  const platform =
    platformParam && VALID_PLATFORMS.includes(platformParam as Platform)
      ? (platformParam as Platform)
      : undefined;
  const campaignId =
    campaignIdParam && Number.isFinite(Number(campaignIdParam))
      ? Number(campaignIdParam)
      : undefined;
  const limit =
    limitParam && Number.isFinite(Number(limitParam)) ? Number(limitParam) : 100;

  // Growth Centre is single-tenant admin-only — all rows live under workspace_id='admin'.
  const workspaceId = 'admin';

  try {
    const posts = await listPosts({ workspaceId, status, platform, campaignId, limit });
    return NextResponse.json({
      posts,
      truth: wrapTruth(
        { source: 'admin:postgres', count: posts.length },
        {
          source: 'admin:postgres',
          freshness: 'real-time',
          simulated: false,
          missingFields: [],
          confidence: 'high',
          confidenceReason: 'social_posts query succeeded.',
        },
      ),
    });
  } catch (err: any) {
    if (err.message?.includes('does not exist')) {
      return NextResponse.json({
        posts: [],
        message: 'social_posts table not created yet — run migration 076.',
      });
    }
    console.error('[growth/posts] list failed:', err);
    return NextResponse.json({ error: 'failed to list posts', details: err.message }, { status: 500 });
  }
}
