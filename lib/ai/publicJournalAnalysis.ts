import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { publicAiScope, markPublicAiProviderStarted } from '@/lib/publicAiQuota';
import { buildJournalEvidence, renderJournalSelection, JOURNAL_SELECTION_SCHEMA, type JournalEvidenceRow } from './journalEvidence';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function publicJournalAnalysis(_req: NextRequest) {
  const scope = publicAiScope();
  const session = await getSessionFromCookie();
  if (!scope || scope.plan !== 'pro' || !session?.workspaceId || scope.subject !== `account:${session.workspaceId}`) return reply({ error: 'Pro required' }, 403);
  // Client entries are deliberately ignored. Only records owned by this workspace are read.
  const rows = await q<JournalEvidenceRow>(`SELECT is_open, outcome, pl, trade_date, exit_date
    FROM journal_entries WHERE workspace_id = $1 ORDER BY trade_date DESC, id DESC LIMIT 2001`, [session.workspaceId]);
  if (!rows.length) return reply({ error: 'No saved journal records to summarize.' }, 400);
  const evidence = buildJournalEvidence(rows);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return reply({ error: 'AI is temporarily unavailable.', evidence }, 503);
  markPublicAiProviderStarted();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.PUBLIC_COPILOT_MODEL || 'gpt-6-luna', max_completion_tokens: 600,
        messages: [{ role: 'system', content: 'Select evidence IDs and educational explanation keys only. The saved historical evidence is the only source. No prose, advice, forecasts, calculations or outside facts. Select all relevant evidence IDs; explanation keys are history, missing and scope.' },
          { role: 'user', content: JSON.stringify(evidence) }],
        response_format: { type: 'json_schema', json_schema: { name: 'journal_education', strict: true, schema: JOURNAL_SELECTION_SCHEMA } },
      }),
    });
    if (!response.ok) return reply({ error: 'AI could not answer. No question credit was used.', evidence }, 422);
    const result = await response.json();
    let parsed: unknown;
    try { parsed = JSON.parse(result.choices?.[0]?.message?.content ?? ''); } catch { parsed = null; }
    const analysis = renderJournalSelection(parsed, evidence);
    if (!analysis) return reply({ error: 'The answer could not be verified. No question credit was used.', evidence }, 422);
    return reply({ analysis, evidence, contract: 'journal-education-v1' });
  } catch {
    return reply({ error: 'AI request was interrupted. Retry the same request ID to check its status.', evidence }, 503);
  }
}
