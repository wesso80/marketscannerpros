// DB helpers for the Growth Command Centre.
// Wraps `q` / `tx` from @/lib/db so route handlers stay thin.

import { q, tx } from '@/lib/db';
import type {
  CampaignRow,
  ComplianceNote,
  GeneratedPost,
  GenerationBrief,
  PostStatus,
  Platform,
  PostType,
  SocialPostRow,
} from './types';

// ─── Campaigns ───────────────────────────────────────────────────────────────

export async function listCampaigns(workspaceId: string): Promise<CampaignRow[]> {
  return q<CampaignRow>(
    `SELECT * FROM social_campaigns
     WHERE workspace_id = $1
     ORDER BY created_at DESC
     LIMIT 200`,
    [workspaceId],
  );
}

export async function createCampaign(input: {
  workspaceId: string;
  name: string;
  goal: string;
  offer?: string | null;
  audience: string;
  tone?: string;
  platforms?: Platform[];
  createdBy: string;
}): Promise<CampaignRow> {
  const rows = await q<CampaignRow>(
    `INSERT INTO social_campaigns
       (workspace_id, name, goal, offer, audience, tone, platforms, created_by)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'founder_led'), COALESCE($7, ARRAY['x','instagram']::TEXT[]), $8)
     RETURNING *`,
    [
      input.workspaceId,
      input.name,
      input.goal,
      input.offer ?? null,
      input.audience,
      input.tone ?? null,
      input.platforms ?? null,
      input.createdBy,
    ],
  );
  return rows[0];
}

export async function findCampaignByName(workspaceId: string, name: string): Promise<CampaignRow | null> {
  const rows = await q<CampaignRow>(
    `SELECT * FROM social_campaigns WHERE workspace_id = $1 AND name = $2 LIMIT 1`,
    [workspaceId, name],
  );
  return rows[0] ?? null;
}

// ─── Posts ───────────────────────────────────────────────────────────────────

export async function insertGeneratedPost(input: {
  workspaceId: string;
  campaignId: number | null;
  postType: PostType;
  brief: GenerationBrief;
  post: GeneratedPost;
  complianceScore: number;
  complianceNotes: ComplianceNote[];
  riskFlags: string[];
  modelVersion: string;
  promptVersion: string;
  createdBy: string;
}): Promise<SocialPostRow> {
  const initialStatus: PostStatus = input.complianceScore >= 85 ? 'review' : 'draft';
  const rows = await q<SocialPostRow>(
    `INSERT INTO social_posts (
       workspace_id, campaign_id, platform, post_type,
       hook, caption, hashtags, visual_suggestion, cta, disclaimer,
       carousel_slides,
       status,
       compliance_score, compliance_notes, risk_flags,
       source, model_version, prompt_version, generation_brief,
       created_by
     ) VALUES (
       $1, $2, $3, $4,
       $5, $6, $7, $8, $9, $10,
       $11,
       $12,
       $13, $14::jsonb, $15,
       'claude_growth_agent', $16, $17, $18::jsonb,
       $19
     )
     RETURNING *`,
    [
      input.workspaceId,
      input.campaignId,
      input.post.platform,
      input.postType,
      input.post.hook,
      input.post.caption,
      input.post.hashtags,
      input.post.visual_suggestion,
      input.post.cta,
      input.post.disclaimer,
      input.post.carousel_slides ? JSON.stringify(input.post.carousel_slides) : null,
      initialStatus,
      input.complianceScore,
      JSON.stringify(input.complianceNotes),
      input.riskFlags,
      input.modelVersion,
      input.promptVersion,
      JSON.stringify(input.brief),
      input.createdBy,
    ],
  );
  return rows[0];
}

export async function logComplianceCheck(input: {
  postId: number;
  workspaceId: string;
  score: number;
  passed: boolean;
  notes: ComplianceNote[];
  riskFlags: string[];
}): Promise<void> {
  await q(
    `INSERT INTO social_compliance_checks (post_id, workspace_id, score, passed, notes, risk_flags)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      input.postId,
      input.workspaceId,
      input.score,
      input.passed,
      JSON.stringify(input.notes),
      input.riskFlags,
    ],
  );
}

export interface ListPostsFilter {
  workspaceId: string;
  status?: PostStatus | PostStatus[];
  platform?: Platform;
  campaignId?: number;
  limit?: number;
}

export async function listPosts(filter: ListPostsFilter): Promise<SocialPostRow[]> {
  const where: string[] = ['workspace_id = $1'];
  const params: any[] = [filter.workspaceId];

  if (filter.status) {
    if (Array.isArray(filter.status)) {
      params.push(filter.status);
      where.push(`status = ANY($${params.length})`);
    } else {
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
  }
  if (filter.platform) {
    params.push(filter.platform);
    where.push(`platform = $${params.length}`);
  }
  if (filter.campaignId !== undefined) {
    params.push(filter.campaignId);
    where.push(`campaign_id = $${params.length}`);
  }

  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);

  return q<SocialPostRow>(
    `SELECT * FROM social_posts
     WHERE ${where.join(' AND ')}
     ORDER BY created_at DESC
     LIMIT ${limit}`,
    params,
  );
}

export async function getPost(workspaceId: string, id: number): Promise<SocialPostRow | null> {
  const rows = await q<SocialPostRow>(
    `SELECT * FROM social_posts WHERE workspace_id = $1 AND id = $2 LIMIT 1`,
    [workspaceId, id],
  );
  return rows[0] ?? null;
}

export async function updatePostStatus(input: {
  workspaceId: string;
  id: number;
  status: PostStatus;
  approvedBy?: string | null;
  rejectedReason?: string | null;
  scheduledFor?: string | null;
}): Promise<SocialPostRow | null> {
  return tx(async (client) => {
    const setClauses: string[] = ['status = $3', 'updated_at = NOW()'];
    const params: any[] = [input.workspaceId, input.id, input.status];

    if (input.status === 'approved') {
      params.push(input.approvedBy ?? null);
      setClauses.push(`approved_by = $${params.length}`);
      setClauses.push(`approved_at = NOW()`);
    }
    if (input.status === 'rejected') {
      params.push(input.rejectedReason ?? null);
      setClauses.push(`rejected_reason = $${params.length}`);
    }
    if (input.scheduledFor !== undefined) {
      params.push(input.scheduledFor);
      setClauses.push(`scheduled_for = $${params.length}`);
    }

    const res = await client.query(
      `UPDATE social_posts
       SET ${setClauses.join(', ')}
       WHERE workspace_id = $1 AND id = $2
       RETURNING *`,
      params,
    );
    return (res.rows[0] as SocialPostRow) ?? null;
  });
}

export async function markPostPublished(input: {
  workspaceId: string;
  id: number;
  externalId: string;
  externalUrl: string | null;
}): Promise<SocialPostRow | null> {
  const rows = await q<SocialPostRow>(
    `UPDATE social_posts
     SET status = 'posted',
         posted_at = NOW(),
         external_id = $3,
         external_url = $4,
         updated_at = NOW()
     WHERE workspace_id = $1 AND id = $2
     RETURNING *`,
    [input.workspaceId, input.id, input.externalId, input.externalUrl],
  );
  return rows[0] ?? null;
}

export async function deletePost(workspaceId: string, id: number): Promise<boolean> {
  const rows = await q<{ id: number }>(
    `DELETE FROM social_posts WHERE workspace_id = $1 AND id = $2 RETURNING id`,
    [workspaceId, id],
  );
  return rows.length > 0;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface PerformanceRow {
  id: number;
  caption_preview: string;
  platform: Platform;
  post_type: PostType;
  status: PostStatus;
  posted_at: string | null;
  external_url: string | null;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  engagement_rate: number | null;
  snapshot_at: string | null;
}

export async function listPerformance(workspaceId: string, limit = 50): Promise<PerformanceRow[]> {
  // Latest metrics snapshot per post.
  return q<PerformanceRow>(
    `SELECT
       p.id,
       SUBSTRING(p.caption, 1, 120) AS caption_preview,
       p.platform,
       p.post_type,
       p.status,
       p.posted_at,
       p.external_url,
       COALESCE(m.impressions, 0)::bigint AS impressions,
       COALESCE(m.likes, 0)::bigint AS likes,
       COALESCE(m.replies, 0)::bigint AS replies,
       COALESCE(m.reposts, 0)::bigint AS reposts,
       m.engagement_rate,
       m.snapshot_at
     FROM social_posts p
     LEFT JOIN LATERAL (
       SELECT * FROM social_post_metrics
       WHERE post_id = p.id
       ORDER BY snapshot_at DESC
       LIMIT 1
     ) m ON TRUE
     WHERE p.workspace_id = $1
       AND p.status IN ('posted', 'approved')
     ORDER BY p.posted_at DESC NULLS LAST, p.created_at DESC
     LIMIT $2`,
    [workspaceId, Math.min(Math.max(limit, 1), 500)],
  );
}
