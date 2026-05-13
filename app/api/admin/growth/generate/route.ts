import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import { generatePosts } from '@/lib/growth/claude-client';
import { checkCompliance } from '@/lib/growth/compliance';
import { insertGeneratedPost, logComplianceCheck } from '@/lib/growth/db';
import { PROMPT_VERSION } from '@/lib/growth/types';
import type {
  GenerationBrief,
  Platform,
  PostType,
  Tone,
} from '@/lib/growth/types';

const VALID_PLATFORMS: Platform[] = ['x', 'instagram'];
const VALID_POST_TYPES: PostType[] = [
  'x_post', 'ig_caption', 'reel_script', 'carousel',
  'launch_announcement', 'feature_explainer', 'trader_education',
  'platform_update', 'founder_post', 'conversion', 'referral',
];
const VALID_TONES: Tone[] = [
  'founder_led', 'institutional_analyst', 'educational',
  'sharp_practical', 'community_builder',
];

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const brief = parseBrief(body);
  if ('error' in brief) {
    return NextResponse.json({ error: brief.error }, { status: 400 });
  }

  const workspaceId = auth.workspaceId ?? 'admin';
  const createdBy = auth.cid ?? 'admin';

  let generation;
  try {
    generation = await generatePosts(brief);
  } catch (err: any) {
    const message = err?.message ?? 'generation failed';
    const isMissingKey = /ANTHROPIC_API_KEY/.test(message);
    return NextResponse.json(
      { error: message },
      { status: isMissingKey ? 503 : 502 },
    );
  }

  if (generation.posts.length === 0) {
    return NextResponse.json({
      posts: [],
      message:
        'Claude returned no compliant drafts for this brief. Try loosening tone or refining the goal.',
      modelVersion: generation.modelVersion,
      tokenUsage: {
        input: generation.inputTokens,
        output: generation.outputTokens,
        cacheRead: generation.cacheReadTokens,
        cacheCreation: generation.cacheCreationTokens,
      },
    });
  }

  const persisted = [];
  for (const post of generation.posts) {
    const compliance = checkCompliance({
      caption: post.caption,
      hook: post.hook,
      cta: post.cta,
      disclaimer: post.disclaimer,
      hashtags: post.hashtags,
    });

    const row = await insertGeneratedPost({
      workspaceId,
      campaignId: brief.campaignId ?? null,
      postType: brief.postType,
      brief,
      post,
      complianceScore: compliance.score,
      complianceNotes: compliance.notes,
      riskFlags: compliance.riskFlags,
      modelVersion: generation.modelVersion,
      promptVersion: PROMPT_VERSION,
      createdBy,
    });

    await logComplianceCheck({
      postId: row.id,
      workspaceId,
      score: compliance.score,
      passed: compliance.passed,
      notes: compliance.notes,
      riskFlags: compliance.riskFlags,
    });

    persisted.push(row);
  }

  return NextResponse.json({
    posts: persisted,
    modelVersion: generation.modelVersion,
    tokenUsage: {
      input: generation.inputTokens,
      output: generation.outputTokens,
      cacheRead: generation.cacheReadTokens,
      cacheCreation: generation.cacheCreationTokens,
    },
  });
}

function parseBrief(body: any): GenerationBrief | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'body must be an object' };
  const { goal, audience, platform, postType, tone } = body;
  if (typeof goal !== 'string' || goal.length < 3) return { error: 'goal is required' };
  if (typeof audience !== 'string' || audience.length < 3) return { error: 'audience is required' };
  if (!VALID_PLATFORMS.includes(platform)) return { error: `platform must be one of ${VALID_PLATFORMS.join('|')}` };
  if (!VALID_POST_TYPES.includes(postType)) return { error: `postType must be one of ${VALID_POST_TYPES.join('|')}` };
  if (!VALID_TONES.includes(tone)) return { error: `tone must be one of ${VALID_TONES.join('|')}` };

  return {
    campaignId: typeof body.campaignId === 'number' ? body.campaignId : undefined,
    goal,
    audience,
    platform,
    postType,
    tone,
    feature: typeof body.feature === 'string' ? body.feature : undefined,
    offer: typeof body.offer === 'string' ? body.offer : undefined,
    count: typeof body.count === 'number' ? body.count : 1,
    extraContext: typeof body.extraContext === 'string' ? body.extraContext : undefined,
  };
}
