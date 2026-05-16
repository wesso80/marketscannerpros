/**
 * lib/earnings/transcripts.ts — Earnings call transcript ingest + LLM summary.
 *
 * Source: Alpha Vantage EARNINGS_CALL_TRANSCRIPT
 *   https://www.alphavantage.co/documentation/#earnings-call-transcript
 *   params: function=EARNINGS_CALL_TRANSCRIPT, symbol, quarter (YYYYQn)
 *
 * Returns: { symbol, quarter, transcript: [{ speaker, title, content, sentiment }] }
 *
 * Summarisation: gpt-4.1 with strict JSON schema; output stored versioned
 * so re-runs don't destroy history. We never invent guidance — if the
 * transcript doesn't mention forward guidance, the field is empty.
 *
 * Boundary: research-only. No execution.
 */

import { q } from '@/lib/db';
import { avFetch } from '@/lib/avRateGovernor';
import OpenAI from 'openai';

const AV_BASE = 'https://www.alphavantage.co/query';

export interface TranscriptSegment {
  speaker: string;
  title: string;
  content: string;
  sentiment: string | number | null;
}

interface AvTranscriptResponse {
  symbol?: string;
  quarter?: string;
  transcript?: TranscriptSegment[];
  Information?: string;
  Note?: string;
  'Error Message'?: string;
}

export async function ingestTranscript(symbol: string, quarter: string): Promise<{
  ok: boolean;
  reason?: string;
  segments?: number;
}> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-av-key' };

  const url = `${AV_BASE}?function=EARNINGS_CALL_TRANSCRIPT&symbol=${encodeURIComponent(symbol)}&quarter=${encodeURIComponent(quarter)}&apikey=${apiKey}`;
  let json: AvTranscriptResponse | null;
  try {
    json = await avFetch<AvTranscriptResponse>(url, `TRANSCRIPT ${symbol} ${quarter}`);
  } catch (e: unknown) {
    return { ok: false, reason: e instanceof Error ? e.message : 'av-error' };
  }
  if (!json) return { ok: false, reason: 'av-no-data' };
  const segments = Array.isArray(json.transcript) ? json.transcript : [];
  if (segments.length === 0) return { ok: false, reason: 'no-transcript' };

  const wordCount = segments.reduce((s, seg) => s + (seg.content?.split(/\s+/).length ?? 0), 0);
  const speakers = new Set(segments.map((s) => s.speaker).filter(Boolean));

  await q(
    `INSERT INTO earnings_transcripts (
       symbol, quarter, transcript, speaker_count, word_count, source, fetched_at
     ) VALUES ($1, $2, $3::jsonb, $4, $5, 'alphavantage', NOW())
     ON CONFLICT (symbol, quarter) DO UPDATE SET
       transcript = EXCLUDED.transcript,
       speaker_count = EXCLUDED.speaker_count,
       word_count = EXCLUDED.word_count,
       fetched_at = NOW()`,
    [symbol.toUpperCase(), quarter, JSON.stringify(segments), speakers.size, wordCount],
  );

  return { ok: true, segments: segments.length };
}

export interface TranscriptSummary {
  oneLiner: string;
  keyThemes: string[];
  guidanceChanges: string[];
  redFlags: string[];
  tone: 'bullish' | 'bearish' | 'mixed' | 'neutral';
  surpriseDirection: 'beat' | 'miss' | 'in_line' | 'unknown';
}

const SYSTEM_PROMPT = `You summarise public-company earnings call transcripts for a research desk.
Strict rules:
- Use ONLY information present in the transcript. Never invent numbers or guidance.
- If forward guidance is not mentioned, return an empty guidanceChanges array.
- Tone reflects overall management language, not your opinion of the company.
- surpriseDirection: 'beat' / 'miss' / 'in_line' only if management or analyst Q&A
  explicitly references results vs expectations; otherwise 'unknown'.
- Output STRICT JSON matching the supplied schema. No prose, no markdown.`;

export async function summariseTranscript(symbol: string, quarter: string): Promise<{
  ok: boolean;
  reason?: string;
  summary?: TranscriptSummary;
  version?: number;
}> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, reason: 'no-openai-key' };

  const rows = await q<{ transcript: TranscriptSegment[] }>(
    `SELECT transcript FROM earnings_transcripts WHERE symbol = $1 AND quarter = $2`,
    [symbol.toUpperCase(), quarter],
  );
  if (rows.length === 0) return { ok: false, reason: 'no-transcript' };
  const segments = rows[0].transcript;

  // Build a compact text input (cap total chars to keep token use reasonable)
  const MAX_CHARS = 60_000;
  let buf = '';
  for (const s of segments) {
    const block = `[${s.speaker} — ${s.title}]\n${s.content}\n\n`;
    if (buf.length + block.length > MAX_CHARS) break;
    buf += block;
  }

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model: 'gpt-4.1',
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Summarise the ${symbol} ${quarter} earnings call. Return JSON with this shape exactly:\n{\n  "oneLiner": string,\n  "keyThemes": string[] (max 6),\n  "guidanceChanges": string[] (max 6),\n  "redFlags": string[] (max 6),\n  "tone": "bullish" | "bearish" | "mixed" | "neutral",\n  "surpriseDirection": "beat" | "miss" | "in_line" | "unknown"\n}\n\nTRANSCRIPT:\n${buf}`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? '';
  let parsed: TranscriptSummary;
  try {
    parsed = JSON.parse(raw) as TranscriptSummary;
  } catch {
    return { ok: false, reason: 'llm-parse-error' };
  }

  // Determine next version
  const v = await q<{ next_version: number }>(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
       FROM earnings_transcript_summaries
      WHERE symbol = $1 AND quarter = $2`,
    [symbol.toUpperCase(), quarter],
  );
  const version = v[0]?.next_version ?? 1;

  await q(
    `INSERT INTO earnings_transcript_summaries (
       symbol, quarter, model, version, summary, tone, surprise_direction, source_freshness
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, 'real-time')`,
    [symbol.toUpperCase(), quarter, 'gpt-4.1', version, JSON.stringify(parsed),
     parsed.tone, parsed.surpriseDirection],
  );

  return { ok: true, summary: parsed, version };
}

export interface StoredSummary {
  symbol: string;
  quarter: string;
  version: number;
  model: string;
  summary: TranscriptSummary;
  tone: string | null;
  surpriseDirection: string | null;
  generatedAt: string;
  fetchedAt: string | null;
  wordCount: number | null;
  speakerCount: number | null;
}

export async function getLatestSummary(symbol: string, quarter: string): Promise<StoredSummary | null> {
  const rows = await q<{
    symbol: string; quarter: string; version: number; model: string;
    summary: TranscriptSummary; tone: string | null;
    surprise_direction: string | null; generated_at: Date;
    fetched_at: Date | null; word_count: number | null; speaker_count: number | null;
  }>(
    `SELECT s.symbol, s.quarter, s.version, s.model, s.summary, s.tone,
            s.surprise_direction, s.generated_at,
            t.fetched_at, t.word_count, t.speaker_count
       FROM earnings_transcript_summaries s
       LEFT JOIN earnings_transcripts t ON t.symbol = s.symbol AND t.quarter = s.quarter
      WHERE s.symbol = $1 AND s.quarter = $2
      ORDER BY s.version DESC
      LIMIT 1`,
    [symbol.toUpperCase(), quarter],
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    symbol: r.symbol,
    quarter: r.quarter,
    version: r.version,
    model: r.model,
    summary: r.summary,
    tone: r.tone,
    surpriseDirection: r.surprise_direction,
    generatedAt: r.generated_at.toISOString(),
    fetchedAt: r.fetched_at ? r.fetched_at.toISOString() : null,
    wordCount: r.word_count,
    speakerCount: r.speaker_count,
  };
}

export async function listQuartersForSymbol(symbol: string): Promise<string[]> {
  const rows = await q<{ quarter: string }>(
    `SELECT quarter FROM earnings_transcripts WHERE symbol = $1 ORDER BY quarter DESC LIMIT 16`,
    [symbol.toUpperCase()],
  );
  return rows.map((r) => r.quarter);
}
