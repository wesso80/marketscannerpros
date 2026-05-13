/**
 * Claude client for the Growth Command Centre.
 *
 * ENV REQUIRED:
 *   ANTHROPIC_API_KEY  — Anthropic API key. If missing, generation fails with
 *                        a clear 503 from the route; no fallback content is
 *                        fabricated (data-integrity rule).
 *
 * Model: claude-opus-4-7  (current most-capable Anthropic model as of 2026).
 * Caching: system prompt is large and stable per (tone, feature, platform,
 *          post_type) — we mark it cache_control: 'ephemeral' so repeat calls
 *          within the cache TTL (5 min) skip re-billing the prompt body.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { GenerationBrief, GeneratedPost } from './types';
import { systemPrompt, userPrompt } from './prompts';

const MODEL = process.env.GROWTH_CLAUDE_MODEL || 'claude-opus-4-7';
const MAX_TOKENS = 2400;

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY env var is not set — cannot generate growth content. ' +
        'Set ANTHROPIC_API_KEY in your environment.',
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export interface ClaudeGenerationResult {
  posts: GeneratedPost[];
  modelVersion: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export async function generatePosts(brief: GenerationBrief): Promise<ClaudeGenerationResult> {
  const sys = systemPrompt(brief);
  const usr = userPrompt(brief);

  const resp = await client().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: sys,
      },
    ],
    messages: [{ role: 'user', content: usr }],
  });

  const textBlock = resp.content.find((c: { type: string }) => c.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content.');
  }

  const raw = textBlock.text.trim();
  const cleaned = stripJsonFences(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Claude returned non-JSON output. Raw response (first 500 chars): ${cleaned.slice(0, 500)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Claude response was JSON but not an array of posts.');
  }

  // Soft-validate: anything truly broken gets dropped (do not fabricate fields).
  const posts: GeneratedPost[] = parsed
    .filter((p): p is GeneratedPost => isValidPostShape(p))
    .map((p) => normalisePost(p, brief));

  const usage = resp.usage as
    | (typeof resp.usage & {
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      })
    | undefined;

  return {
    posts,
    modelVersion: resp.model ?? MODEL,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
  };
}

function stripJsonFences(s: string): string {
  // Tolerate the occasional ```json ... ``` even though the prompt forbids it.
  const fenced = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1].trim() : s;
}

function isValidPostShape(p: unknown): boolean {
  if (!p || typeof p !== 'object') return false;
  const obj = p as Record<string, unknown>;
  return (
    (obj.platform === 'x' || obj.platform === 'instagram') &&
    typeof obj.caption === 'string' &&
    obj.caption.length > 0
  );
}

function normalisePost(p: GeneratedPost, brief: GenerationBrief): GeneratedPost {
  return {
    platform: p.platform ?? brief.platform,
    hook: p.hook ?? '',
    caption: p.caption,
    hashtags: Array.isArray(p.hashtags) ? p.hashtags.slice(0, 30) : [],
    visual_suggestion: p.visual_suggestion ?? '',
    disclaimer: p.disclaimer ?? '',
    compliance_score: typeof p.compliance_score === 'number' ? p.compliance_score : 0,
    compliance_notes: Array.isArray(p.compliance_notes) ? p.compliance_notes : [],
    cta: p.cta ?? '',
    risk_flags: Array.isArray(p.risk_flags) ? p.risk_flags : [],
    carousel_slides: brief.postType === 'carousel' && Array.isArray(p.carousel_slides)
      ? p.carousel_slides
      : undefined,
  };
}
