import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { getPost, markPostPublished } from '@/lib/growth/db';
import { publishToX, isXEnabled } from '@/lib/growth/twitter';
import { publishToInstagram, isInstagramEnabled } from '@/lib/growth/instagram';
import { MIN_PUBLISH_SCORE } from '@/lib/growth/types';

function parseId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: idStr } = await ctx.params;
  const id = parseId(idStr);
  if (id === null) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

  const workspaceId = 'admin';
  const post = await getPost(workspaceId, id);
  if (!post) return NextResponse.json({ error: 'not found' }, { status: 404 });

  // ── Hard gates before any platform call ──
  if (post.status !== 'approved') {
    return NextResponse.json(
      { error: `post status is "${post.status}" — must be "approved" before publishing.` },
      { status: 422 },
    );
  }
  if (post.compliance_score < MIN_PUBLISH_SCORE) {
    return NextResponse.json(
      {
        error: `compliance_score (${post.compliance_score}) is below the ${MIN_PUBLISH_SCORE} minimum.`,
      },
      { status: 422 },
    );
  }

  // ── Build platform-specific payload ──
  if (post.platform === 'x') {
    if (!isXEnabled()) {
      return NextResponse.json(
        {
          error:
            'X publishing is not enabled. Set X_API_ENABLED=true and X_OAUTH_ACCESS_TOKEN to enable. The post remains in "approved" status, ready to publish when keys are configured.',
          enabled: false,
        },
        { status: 503 },
      );
    }

    const text = composeXText(post);
    const result = await publishToX({ text });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? 'X publish failed', rateLimited: result.rateLimited, retryAfterSec: result.retryAfterSec },
        { status: result.rateLimited ? 429 : 502 },
      );
    }
    const updated = await markPostPublished({
      workspaceId,
      id,
      externalId: result.externalId!,
      externalUrl: result.externalUrl ?? null,
    });
    return NextResponse.json({ post: updated, externalUrl: result.externalUrl });
  }

  if (post.platform === 'instagram') {
    if (!isInstagramEnabled()) {
      return NextResponse.json(
        {
          error:
            'Instagram publishing is not enabled. Set IG_API_ENABLED=true, IG_ACCESS_TOKEN, IG_BUSINESS_ACCOUNT_ID. The post remains in "approved" status.',
          enabled: false,
        },
        { status: 503 },
      );
    }
    if (!post.media_url) {
      return NextResponse.json(
        { error: 'Instagram post requires media_url (image or video) — attach media before publishing.' },
        { status: 422 },
      );
    }
    const caption = composeIgCaption(post);
    const mediaType = post.post_type === 'reel_script' ? 'REELS' : post.post_type === 'carousel' ? 'CAROUSEL' : 'IMAGE';
    const result = await publishToInstagram({
      caption,
      mediaType,
      imageUrl: mediaType === 'IMAGE' ? post.media_url : undefined,
      videoUrl: mediaType === 'REELS' ? post.media_url : undefined,
      carouselItemUrls: mediaType === 'CAROUSEL' ? splitCarouselUrls(post.media_url) : undefined,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? 'Instagram publish failed', permissionError: result.permissionError },
        { status: result.permissionError ? 403 : 502 },
      );
    }
    const updated = await markPostPublished({
      workspaceId,
      id,
      externalId: result.externalId!,
      externalUrl: result.externalUrl ?? null,
    });
    return NextResponse.json({ post: updated, externalUrl: result.externalUrl });
  }

  return NextResponse.json({ error: `unsupported platform: ${post.platform}` }, { status: 400 });
}

function composeXText(post: Awaited<ReturnType<typeof getPost>>): string {
  if (!post) return '';
  // Caption already incorporates the hook (per prompt). Disclaimer is appended
  // only if it fits within the 280-char budget; else dropped (the disclaimer
  // is meant to be delivered as a thread reply per platform rules).
  const base = post.caption.trim();
  const disclaimer = (post.disclaimer ?? '').trim();
  if (disclaimer && (base.length + 1 + disclaimer.length) <= 280) {
    return `${base}\n${disclaimer}`.slice(0, 280);
  }
  return base.slice(0, 280);
}

function composeIgCaption(post: Awaited<ReturnType<typeof getPost>>): string {
  if (!post) return '';
  const lines = [post.caption.trim()];
  if (post.cta) lines.push('', post.cta.trim());
  if (post.disclaimer) lines.push('', post.disclaimer.trim());
  if (post.hashtags?.length) lines.push('', post.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' '));
  return lines.join('\n');
}

function splitCarouselUrls(media: string): string[] {
  // media_url for carousels is a comma-separated list of admin-uploaded image URLs.
  return media.split(',').map((s) => s.trim()).filter(Boolean);
}
