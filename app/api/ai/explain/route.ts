// =====================================================
// MSP AI EXPLAIN API - Inline explanations for any metric
// POST /api/ai/explain - Generate explanation
// GET /api/ai/explain?cacheKey=... - Get cached explanation
// Features: Database caching, versioning, cost control
// =====================================================

import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import OpenAI from 'openai';
import type { ExplainRequest, ExplainResponse, PageSkill } from '@/lib/ai/types';
import { CONTEXT_VERSION, SKILL_VERSION_PREFIX } from '@/lib/ai/types';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// In-memory cache for fast lookups (backed by database for persistence)
const explanationCache = new Map<string, { response: ExplainResponse; timestamp: number }>();
const MEMORY_CACHE_TTL = 1000 * 60 * 15; // 15 minutes in-memory
const DB_CACHE_TTL_SECONDS = 3600; // 1 hour in database

// Generate cache key with value bucketing for better cache hits
function generateCacheKey(metricName: string, skill: PageSkill, value: unknown): string {
  const normalizedMetric = metricName.toLowerCase().replace(/\s+/g, '_');
  const valueBucket = getValueBucket(value);
  return `explain_${normalizedMetric}_${skill}_${valueBucket}`;
}

// Bucket numeric values for cache hits (e.g., RSI 72 and 74 hit same bucket)
function getValueBucket(value: unknown): string {
  if (value === undefined || value === null) return 'no_value';
  if (typeof value === 'number') {
    if (value < 0) return 'negative';
    if (value <= 20) return '0_20';
    if (value <= 30) return '20_30';
    if (value <= 50) return '30_50';
    if (value <= 70) return '50_70';
    if (value <= 80) return '70_80';
    return 'above_80';
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value.substring(0, 20);
  return 'complex';
}

// GET - Retrieve cached explanation (zero LLM cost)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const cacheKey = searchParams.get('cacheKey');

    if (!cacheKey) {
      return NextResponse.json({ error: 'cacheKey required' }, { status: 400 });
    }

    // Check memory cache first
    const memCached = explanationCache.get(cacheKey);
    if (memCached && Date.now() - memCached.timestamp < MEMORY_CACHE_TTL) {
      return NextResponse.json({ success: true, ...memCached.response, cached: true, source: 'memory' });
    }

    // Check database cache
    const dbResult = await q(
      `SELECT explanation, why_it_matters, actionable_insight 
       FROM ai_explain_cache 
       WHERE cache_key = $1 AND expires_at > NOW()`,
      [cacheKey]
    );

    if (dbResult.length > 0) {
      const row = dbResult[0];
      const response: ExplainResponse = {
        explanation: row.explanation,
        whyItMatters: row.why_it_matters,
        actionableInsight: row.actionable_insight,
      };
      
      // Update hit count
      await q(`UPDATE ai_explain_cache SET hit_count = hit_count + 1 WHERE cache_key = $1`, [cacheKey]);
      
      // Populate memory cache
      explanationCache.set(cacheKey, { response, timestamp: Date.now() });
      
      return NextResponse.json({ success: true, ...response, cached: true, source: 'database' });
    }

    return NextResponse.json({ success: false, cached: false, message: 'Not in cache' });

  } catch (error) {
    console.error('Error fetching cached explanation:', error);
    return NextResponse.json({ error: 'Cache lookup failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromCookie();
    if (!session?.workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { metricId, metricName, metricValue, context, skill } = body as ExplainRequest;

    if (!metricName) {
      return NextResponse.json({ error: 'Metric name required' }, { status: 400 });
    }

    const pageSkill = skill || 'home';
    const cacheKey = generateCacheKey(metricName, pageSkill, metricValue);
    const valueBucket = getValueBucket(metricValue);

    // Check memory cache first
    const memCached = explanationCache.get(cacheKey);
    if (memCached && Date.now() - memCached.timestamp < MEMORY_CACHE_TTL) {
      return NextResponse.json({ success: true, ...memCached.response, cached: true, cacheKey });
    }

    // Check database cache
    const dbCached = await q(
      `SELECT explanation, why_it_matters, actionable_insight 
       FROM ai_explain_cache 
       WHERE cache_key = $1 AND expires_at > NOW()`,
      [cacheKey]
    );

    if (dbCached.length > 0) {
      const row = dbCached[0];
      const response: ExplainResponse = {
        explanation: row.explanation,
        whyItMatters: row.why_it_matters,
        actionableInsight: row.actionable_insight,
      };
      
      // Update hit count
      await q(`UPDATE ai_explain_cache SET hit_count = hit_count + 1 WHERE cache_key = $1`, [cacheKey]);
      
      // Populate memory cache
      explanationCache.set(cacheKey, { response, timestamp: Date.now() });
      
      return NextResponse.json({ success: true, ...response, cached: true, cacheKey });
    }

    // Try to find in knowledge base first
    const knowledgeMatch = await q(
      `SELECT content, title FROM msp_knowledge 
       WHERE is_active = true 
         AND (title ILIKE $1 OR content ILIKE $1 OR $2 = ANY(tags))
       ORDER BY priority DESC
       LIMIT 1`,
      [`%${metricName}%`, metricName.toLowerCase().replace(/\s+/g, '_')]
    );

    let explanation: ExplainResponse;
    let tokensUsed = 0;

    if (knowledgeMatch.length > 0) {
      // Use knowledge base (zero LLM cost)
      explanation = {
        explanation: knowledgeMatch[0].content,
        whyItMatters: extractWhyItMatters(knowledgeMatch[0].content),
        actionableInsight: extractActionable(knowledgeMatch[0].content, metricValue),
      };
    } else {
      // Generate with AI
      const startTime = Date.now();
      
      const systemPrompt = `You are a concise trading education assistant for MarketScanner Pros. 
Explain trading metrics clearly in 2-3 sentences max. 
Always include: what it measures, why traders care, and one actionable insight.
Be specific to the current value when provided.
Never give financial advice - focus on education.`;

      const userPrompt = `Explain the metric "${metricName}"${metricValue !== undefined ? ` (current value: ${JSON.stringify(metricValue)})` : ''}.
Context: ${pageSkill} page. ${context ? JSON.stringify(context) : ''}

Respond in JSON format:
{
  "explanation": "What this metric measures in 1-2 sentences",
  "whyItMatters": "Why traders watch this metric",
  "actionableInsight": "What this specific value suggests (optional)"
}`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 300,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });

      const responseText = completion.choices[0]?.message?.content || '{}';
      const latency = Date.now() - startTime;
      tokensUsed = completion.usage?.total_tokens || 0;

      try {
        explanation = JSON.parse(responseText) as ExplainResponse;
      } catch {
        explanation = {
          explanation: responseText,
          whyItMatters: 'This metric helps traders make informed decisions.',
        };
      }

      // Log the response for learning (with versioning)
      await q(
        `INSERT INTO ai_responses 
         (workspace_id, page_skill, user_prompt, model_output, model_used, tokens_used, token_prompt, token_completion, latency_ms, context_version, skill_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          session.workspaceId,
          pageSkill,
          `Explain: ${metricName}`,
          responseText,
          'gpt-4o-mini',
          tokensUsed,
          completion.usage?.prompt_tokens || 0,
          completion.usage?.completion_tokens || 0,
          latency,
          CONTEXT_VERSION,
          `${pageSkill}@${SKILL_VERSION_PREFIX}`,
        ]
      );
    }

    // Store in database cache
    const expiresAt = new Date(Date.now() + DB_CACHE_TTL_SECONDS * 1000);
    await q(
      `INSERT INTO ai_explain_cache 
       (cache_key, metric_name, metric_value_bucket, skill, explanation, why_it_matters, actionable_insight, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (cache_key) DO UPDATE SET 
         explanation = EXCLUDED.explanation,
         why_it_matters = EXCLUDED.why_it_matters,
         actionable_insight = EXCLUDED.actionable_insight,
         expires_at = EXCLUDED.expires_at,
         hit_count = ai_explain_cache.hit_count + 1`,
      [
        cacheKey,
        metricName,
        valueBucket,
        pageSkill,
        explanation.explanation,
        explanation.whyItMatters,
        explanation.actionableInsight,
        expiresAt,
      ]
    );

    // Store in memory cache
    explanationCache.set(cacheKey, { response: explanation, timestamp: Date.now() });

    // Log the event
    await q(
      `INSERT INTO ai_events (workspace_id, event_type, event_data, page_context)
       VALUES ($1, 'widget_interaction', $2, $3)`,
      [
        session.workspaceId,
        JSON.stringify({ action: 'explain_metric', metricName, metricId, cached: false, tokensUsed }),
        JSON.stringify({ name: pageSkill }),
      ]
    );

    return NextResponse.json({ success: true, ...explanation, cached: false, cacheKey });

  } catch (error) {
    console.error('Error generating explanation:', error);
    return NextResponse.json({ error: 'Failed to generate explanation' }, { status: 500 });
  }
}

// Helper to extract "why it matters" from knowledge base content
function extractWhyItMatters(content: string): string {
  // Simple extraction - look for importance-related sentences
  const sentences = content.split(/[.!?]+/).filter(s => s.trim());
  const importanceSentence = sentences.find(s => 
    /important|matters|traders|watch|indicates|suggests|signals/i.test(s)
  );
  return importanceSentence?.trim() || sentences[1]?.trim() || 'This metric provides valuable market insight.';
}

// Helper to extract actionable insight based on value
function extractActionable(content: string, value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  
  // Look for conditional statements in the content
  const sentences = content.split(/[.!?]+/).filter(s => s.trim());
  const actionSentence = sentences.find(s => 
    /consider|should|could|may want|suggests|indicates/i.test(s)
  );
  return actionSentence?.trim();
}
