/**
 * Arca marketing helpers — shared by API, cron, and Jarvis tools.
 * Read-only signals + draft generation. Publishing is gated on approval.
 */

import OpenAI from 'openai';
import { q } from '@/lib/db';
import { xPostTweet } from '@/lib/arcaOAuth';

export const MARKETING_CHANNELS = ['x', 'instagram', 'discord', 'email', 'blog'] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export interface DraftRecord {
  id: number;
  channel: MarketingChannel;
  topic: string | null;
  content: string;
  status: 'pending' | 'approved' | 'rejected' | 'published' | 'failed';
  source: string | null;
  source_ref: string | null;
  metadata: any;
  scheduled_for: string | null;
  published_at: string | null;
  publish_error: string | null;
  created_at: string;
  updated_at: string;
}

let schemaEnsured = false;
export async function ensureMarketingSchema(): Promise<void> {
  if (schemaEnsured) return;
  await q(`
    CREATE TABLE IF NOT EXISTS arca_marketing_drafts (
      id BIGSERIAL PRIMARY KEY,
      channel TEXT NOT NULL,
      topic TEXT,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT,
      source_ref TEXT,
      metadata JSONB,
      scheduled_for TIMESTAMPTZ,
      published_at TIMESTAMPTZ,
      publish_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_arca_drafts_status_created
           ON arca_marketing_drafts (status, created_at DESC);`);
  await q(`CREATE INDEX IF NOT EXISTS idx_arca_drafts_channel
           ON arca_marketing_drafts (channel, status);`);
  schemaEnsured = true;
}

const CHANNEL_SPEC: Record<MarketingChannel, { limit: number; style: string }> = {
  x: {
    limit: 270,
    style:
      'Punchy single-tweet. Lead with the hook. 1–2 hashtags max. No links unless critical. No emojis.',
  },
  instagram: {
    limit: 2000,
    style:
      'Caption format: hook line, then 2–4 short paragraphs, then 5–10 niche hashtags on a new line. No emojis in body, hashtags are the personality.',
  },
  discord: {
    limit: 1800,
    style:
      'Operator-grade community note. Short bullets. Markdown OK. Include "research only" tone.',
  },
  email: {
    limit: 1200,
    style:
      'Subscriber email body. Short subject line on the FIRST line as "SUBJECT: ...", then 3–5 sentence body. Plain prose, no marketing fluff.',
  },
  blog: {
    limit: 4000,
    style:
      'Short blog post (300–500 words). H2 headings. Educational angle. Cite the data point being discussed.',
  },
};

const SYSTEM_PROMPT = `You are ARCA, the marketing voice of MarketScanner Pros (MSP).
Brand tone: institutional-grade, calm, data-led. Never hype, never financial advice, never "buy now / moon".
Audience: serious traders and prosumers.

Hard rules:
- Never recommend an action ("buy", "sell", "long", "short").
- Use research framing: "watching", "elevated probability", "setup forming", "invalidation at".
- If the underlying data is stale or partial, acknowledge it or skip it.
- No emojis. No exclamation marks. No "Don't miss out".
- Always plausibly true to the data provided. Never fabricate numbers.
- Always include a short disclaimer line at the end appropriate to the channel
  (one short phrase like "Research only — not financial advice.").

Length: respect the channel limit given.
Format: respect the channel style given.`;

export interface DraftInput {
  channel: MarketingChannel;
  topic?: string;
  data?: any; // optional structured market data to ground the post
  notes?: string; // operator hints
}

/**
 * Generate a marketing draft via OpenAI grounded in optional data.
 * Does NOT persist — caller decides.
 */
export async function generateDraft(input: DraftInput): Promise<{ content: string; topic: string }> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const spec = CHANNEL_SPEC[input.channel];
  if (!spec) throw new Error(`Unsupported channel: ${input.channel}`);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.ADMIN_JARVIS_MODEL || 'gpt-4.1';

  const dataBlock = input.data
    ? `\n\nGROUNDING DATA (do not invent beyond this):\n${JSON.stringify(input.data).slice(0, 6000)}`
    : '';
  const notes = input.notes ? `\n\nOPERATOR NOTES: ${input.notes}` : '';
  const topic = input.topic || 'general market commentary';

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.6,
    max_tokens: 700,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content:
          `Channel: ${input.channel}\n` +
          `Channel limit (chars): ${spec.limit}\n` +
          `Channel style: ${spec.style}\n` +
          `Topic: ${topic}` +
          dataBlock +
          notes +
          `\n\nWrite ONE draft now. Output the post content only — no preamble, no explanation.`,
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content?.trim() || '';
  return { content: content.slice(0, spec.limit + 200), topic };
}

export interface InsertDraftArgs extends DraftInput {
  source: string;
  source_ref?: string;
  metadata?: any;
  scheduled_for?: string | null;
}

export async function insertDraft(args: InsertDraftArgs): Promise<DraftRecord> {
  await ensureMarketingSchema();
  const gen = await generateDraft(args);
  const rows = await q<DraftRecord>(
    `INSERT INTO arca_marketing_drafts
       (channel, topic, content, status, source, source_ref, metadata, scheduled_for)
     VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7)
     RETURNING *`,
    [
      args.channel,
      gen.topic,
      gen.content,
      args.source,
      args.source_ref || null,
      args.metadata ? JSON.stringify(args.metadata) : null,
      args.scheduled_for || null,
    ],
  );
  return rows[0];
}

export async function listDrafts(filter: { status?: string; channel?: string; limit?: number }): Promise<DraftRecord[]> {
  await ensureMarketingSchema();
  const where: string[] = [];
  const params: any[] = [];
  if (filter.status) { params.push(filter.status); where.push(`status = $${params.length}`); }
  if (filter.channel) { params.push(filter.channel); where.push(`channel = $${params.length}`); }
  const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
  params.push(limit);
  const sql = `SELECT * FROM arca_marketing_drafts
               ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY created_at DESC LIMIT $${params.length}`;
  return q<DraftRecord>(sql, params);
}

export async function getDraft(id: number): Promise<DraftRecord | null> {
  await ensureMarketingSchema();
  const rows = await q<DraftRecord>('SELECT * FROM arca_marketing_drafts WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function updateDraft(id: number, patch: Partial<Pick<DraftRecord, 'content' | 'status' | 'topic' | 'scheduled_for'>>): Promise<DraftRecord | null> {
  await ensureMarketingSchema();
  const sets: string[] = ['updated_at = NOW()'];
  const params: any[] = [];
  for (const [k, v] of Object.entries(patch)) {
    params.push(v);
    sets.push(`${k} = $${params.length}`);
  }
  params.push(id);
  const rows = await q<DraftRecord>(
    `UPDATE arca_marketing_drafts SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return rows[0] || null;
}

export async function deleteDraft(id: number): Promise<boolean> {
  await ensureMarketingSchema();
  const rows = await q<{ id: number }>('DELETE FROM arca_marketing_drafts WHERE id = $1 RETURNING id', [id]);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Publishers
// ---------------------------------------------------------------------------

function getDiscordWebhook(): string | null {
  return (
    process.env.ADMIN_DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    process.env.DISCORD_BRIDGE_WEBHOOK_URL ||
    null
  );
}

async function publishDiscord(d: DraftRecord): Promise<void> {
  const url = getDiscordWebhook();
  if (!url) throw new Error('No Discord webhook configured (set ADMIN_DISCORD_WEBHOOK_URL)');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      content: d.content.slice(0, 1900),
      username: 'Arca · MSP',
      allowed_mentions: { parse: [] },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Discord publish failed (${res.status}): ${t.slice(0, 200)}`);
  }
}

/**
 * Publish an approved draft to its channel. Marks status published/failed.
 * Currently implemented: discord. Others record an explicit error.
 */
export async function publishDraft(id: number): Promise<DraftRecord | null> {
  const draft = await getDraft(id);
  if (!draft) return null;
  if (draft.status !== 'approved') {
    throw new Error(`Draft ${id} is not approved (status=${draft.status})`);
  }
  try {
    if (draft.channel === 'discord') {
      await publishDiscord(draft);
    } else if (draft.channel === 'x') {
      const text = draft.content.length > 280 ? draft.content.slice(0, 277) + '…' : draft.content;
      const tweet = await xPostTweet(text);
      await q(
        `UPDATE arca_marketing_drafts
            SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
          WHERE id = $1`,
        [id, JSON.stringify({ x_tweet_id: tweet.id })],
      );
    } else {
      throw new Error(
        `Channel "${draft.channel}" publisher not configured. Channel APIs (Instagram, Email, Blog) require credentials — copy the content for now.`,
      );
    }
    return updateDraft(id, { status: 'published' as any }).then((r) =>
      q<DraftRecord>(
        `UPDATE arca_marketing_drafts SET published_at = NOW(), publish_error = NULL WHERE id = $1 RETURNING *`,
        [id],
      ).then((rows) => rows[0] || r),
    );
  } catch (err: any) {
    const msg = err?.message || 'Publish failed';
    await q(
      `UPDATE arca_marketing_drafts SET status = 'failed', publish_error = $2, updated_at = NOW() WHERE id = $1`,
      [id, msg],
    );
    throw err;
  }
}
