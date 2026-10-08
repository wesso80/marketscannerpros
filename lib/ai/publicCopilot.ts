import { NextRequest, NextResponse } from 'next/server';
import { publicAiScope, markPublicAiProviderStarted } from '@/lib/publicAiQuota';
import { verifyPageEvidence, evidenceIdentity, combinePageEvidence } from './publicCopilotEvidence';
import { COPILOT_RESPONSE_SCHEMA, PUBLIC_COPILOT_INSTRUCTIONS, validateCopilotAnswer } from './publicCopilotPolicy';

const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
/** Public path has no intelligence context, trading tools, provider fetches or client-supplied history. */
export async function publicCopilot(req: NextRequest) {
  const scope = publicAiScope();
  if (!scope || scope.plan !== 'pro') return reply({ error: 'Pro required' }, 403);
  const body = await req.json();
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) return reply({ error: 'Enter a question of up to 2,000 characters.' }, 400);
  const core = verifyPageEvidence(body.evidenceToken, scope.subject);
  const evidence = core ? combinePageEvidence(core,body.sectionTokens ?? [],scope.subject) : null;
  if (!evidence) return reply({ code: 'PAGE_EVIDENCE_REQUIRED', error: 'Verified page evidence is unavailable or expired. Reload the Symbol report. Other pages are not connected yet.' }, 409);
  if(Buffer.byteLength(JSON.stringify(evidence))>160000)return reply({error:'This evidence snapshot is too large. Select a shorter chart period.'},413);
  if (body.pagePath !== evidence.page || body.symbol !== evidence.symbol) return reply({ error: 'The page changed. Reload its evidence before asking.' }, 409);
  const key = process.env.OPENAI_API_KEY;
  if (!key) return reply({ error: 'AI is temporarily unavailable. Page evidence remains available.' }, 503);
  markPublicAiProviderStarted();
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: process.env.PUBLIC_COPILOT_MODEL || 'gpt-6-luna', max_completion_tokens: 1800,
        messages: [{ role: 'system', content: PUBLIC_COPILOT_INSTRUCTIONS },
          { role: 'user', content: JSON.stringify({ PAGE_EVIDENCE: evidence, question: body.message.trim() }) }],
        response_format: { type: 'json_schema', json_schema: { name: 'page_explanation', strict: true, schema: COPILOT_RESPONSE_SCHEMA } },
      }),
    });
    // Received provider errors are definite failures. An interrupted call remains pending in the quota ledger.
    if (!response.ok) return reply({ error: 'AI could not answer. No question credit was used.' }, 422);
    const result = await response.json();
    let parsed: unknown;
    try { parsed = JSON.parse(result.choices?.[0]?.message?.content ?? ''); } catch { parsed = null; }
    const content = validateCopilotAnswer(parsed, evidence);
    if (!content) return reply({ error: 'The answer could not be verified against this page. No question credit was used.' }, 422);
    return reply({ content, contract: 'public-copilot-v1', evidenceId: evidenceIdentity(evidence),
      symbol: evidence.symbol, capturedAt: evidence.capturedAt, missing: evidence.missing,
      evidence: evidence.observations, usage: result.usage ?? null });
  } catch { return reply({ error: 'AI request was interrupted. Retry the same request ID to check its status.' }, 503); }
}
