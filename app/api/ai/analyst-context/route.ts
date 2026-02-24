/**
 * MSP Analyst Contextual Intelligence API
 *
 * @route POST /api/ai/analyst-context
 * @description Auto-generates structured intelligence for all 4 tabs
 *              (Explain / Plan / Act / Learn) from platform context.
 *              No manual query — the context IS the query.
 * @authentication Required (ms_auth cookie)
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { logger } from '@/lib/logger';
import { aiLimiter, getClientIP } from '@/lib/rateLimit';
import { AI_DAILY_LIMITS, isFreeForAllMode, normalizeTier } from '@/lib/entitlements';
import { computeACLFromScoring } from '@/lib/ai/adaptiveConfidenceLens';
import { computePerformanceThrottle, applyPerformanceDampener } from '@/lib/ai/performanceThrottle';
import { computeSessionPhaseOverlay } from '@/lib/ai/sessionPhase';
import { mapToScoringRegime, computeRegimeScore, estimateComponentsFromContext, deriveRegimeConfidence } from '@/lib/ai/regimeScoring';

export const runtime = 'nodejs';

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ─── System Prompt ──────────────────────────────────

const ANALYST_CONTEXT_SYSTEM_PROMPT = `
You are MSP AI Analyst — a contextual intelligence engine for MarketScanner Pros.

You are NOT a chatbot. You receive a structured snapshot of platform state and produce
analysis for exactly 4 tabs. Each tab has a strict format.

CRITICAL RULES:
1. Never fabricate data. If a field is null/missing, say "Data not available" for that dimension.
2. Never contradict the Risk Governor. If authorization is BLOCKED, the Plan and Act tabs must say NO TRADE.
3. All outputs must reference the actual regime, session phase, and authorization state provided.
4. Be concise. Traders scan, they don't read essays. Use bullet points and short sentences.
5. If data quality is "stale" or "unavailable", flag it prominently and reduce confidence language.
6. Never use generic filler like "markets are complex" or "always do your own research".

OUTPUT FORMAT — Return valid JSON with exactly these 4 keys:

{
  "explain": "Markdown string for the Explain tab",
  "plan": "Markdown string for the Plan tab",
  "act": "Markdown string for the Act tab",
  "learn": "Markdown string for the Learn tab"
}

TAB SPECIFICATIONS:

## EXPLAIN TAB
Contextual summary of what the platform sees RIGHT NOW for this ticker/regime.
- Current regime + what it means for this asset class
- Session phase + why it matters now
- Key signals from page data (score, direction, indicators)
- Data quality assessment
- 1-2 contradictions or anomalies if present
Format: 3-5 bullet points, each 1-2 sentences.

## PLAN TAB
Scenario planning based on current regime and authorization.
If BLOCKED: "No trade plan available — [reason]. Monitor for regime change."
If AUTHORIZED or CONDITIONAL:
- Bull scenario: trigger + target + probability language
- Bear scenario: trigger + target + probability language  
- Neutral/chop scenario: what would confirm range-bound
- Which scenario the regime currently favors
Format: 3 labeled scenarios, each 2-3 sentences.

## ACT TAB
Execution checklist gated by authorization and RU throttle.
If BLOCKED: "Execution blocked: [reason]. No action items."
If CONDITIONAL: Reduced-size entries only, with specific conditions.
If AUTHORIZED:
- Entry zone (if price data available)
- Position sizing guidance based on throttle %
- Stop loss logic based on ATR/volatility if available
- Key level to watch
- Time-in-force based on session phase
Format: Numbered checklist, 3-6 items.

## LEARN TAB
Historical context and educational insight for this specific situation.
- What typically happens in this regime + session phase combination
- Common mistakes traders make in this environment
- One pattern recognition insight relevant to current setup
Format: 2-3 bullet points, each 2-3 sentences.
`.trim();

// ─── POST Handler ───────────────────────────────────

export async function POST(req: NextRequest) {
  // Rate limit
  const ip = getClientIP(req);
  const rateCheck = aiLimiter.check(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.', retryAfter: rateCheck.retryAfter },
      { status: 429 },
    );
  }

  // Auth
  const freeForAll = isFreeForAllMode();
  let session = await getSessionFromCookie();
  if (!session && freeForAll) {
    session = { workspaceId: 'free-mode', tier: 'pro_trader', exp: Math.floor(Date.now() / 1000) + 3600 } as any;
  }
  if (!session) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const workspaceId = session.workspaceId;
  const tier = normalizeTier(session.tier);

  // Tier gate: must be pro or above
  if (tier === 'free' && !freeForAll) {
    return NextResponse.json(
      { error: 'MSP Analyst requires Pro or higher subscription.' },
      { status: 403 },
    );
  }

  // Daily limit check
  const dailyLimit = AI_DAILY_LIMITS[tier];
  try {
    const today = new Date().toISOString().split('T')[0];
    const usageResult = await q(
      `SELECT COUNT(*) as count FROM ai_usage WHERE workspace_id = $1 AND DATE(created_at) = $2`,
      [workspaceId, today],
    );
    const usageCount = parseInt(usageResult[0]?.count || '0');
    if (usageCount >= dailyLimit) {
      return NextResponse.json(
        { error: `Daily AI limit reached (${dailyLimit}/day). Resets at midnight UTC.`, limitReached: true },
        { status: 429 },
      );
    }
  } catch {
    // continue if DB check fails
  }

  // Parse context from client
  let ctx: any;
  try {
    const json = await req.json();
    ctx = json.context;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  if (!ctx) {
    return NextResponse.json({ error: 'Missing context object.' }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: 'AI service unavailable.' }, { status: 500 });
  }

  // ─── Server-side enrichment ───────────────────────

  // Regime scoring
  const regimeRaw = ctx.regime || 'RANGE_NEUTRAL';
  const scoringRegime = mapToScoringRegime(regimeRaw);
  const components = estimateComponentsFromContext({
    scannerScore: ctx.pageData?.score ?? ctx.pageData?.confluenceScore ?? 50,
    regime: regimeRaw,
    rsi: ctx.pageData?.rsi,
    cci: ctx.pageData?.cci,
    adx: ctx.pageData?.adx,
    aroonUp: ctx.pageData?.aroon_up,
    aroonDown: ctx.pageData?.aroon_down,
    obv: ctx.pageData?.obv,
    session: 'regular',
    derivativesAvailable: false,
  });
  const regimeScoring = computeRegimeScore(components, scoringRegime);

  // Regime confidence
  const regimeAgreement = deriveRegimeConfidence({
    adx: ctx.pageData?.adx ? Number(ctx.pageData.adx) : undefined,
    rsi: ctx.pageData?.rsi ? Number(ctx.pageData.rsi) : undefined,
    aroonUp: ctx.pageData?.aroon_up ? Number(ctx.pageData.aroon_up) : undefined,
    aroonDown: ctx.pageData?.aroon_down ? Number(ctx.pageData.aroon_down) : undefined,
    inferredRegime: regimeRaw,
  });

  // Event risk from context
  const eventRiskLevel = ctx.eventRisk === 'high' ? ('high' as const) : ('none' as const);

  // Session phase overlay
  const isCrypto = ctx.assetClass === 'crypto';
  const sessionPhase = computeSessionPhaseOverlay(isCrypto ? 'crypto' : 'equities');

  // ACL
  const aclResult = computeACLFromScoring(regimeScoring, {
    regimeConfidence: regimeAgreement.confidence,
    eventRisk: eventRiskLevel,
    riskGovernorPermission: ctx.permission === 'NO' ? 'BLOCK' : 'ALLOW',
    dataComponentsProvided: Object.keys(ctx.pageData || {}).length,
  });

  // Performance throttle
  let perfThrottle = computePerformanceThrottle({ sessionPnlR: 0, consecutiveLosses: 0 });
  try {
    const recentTrades = await q(
      `SELECT pnl_r FROM portfolio_closed WHERE workspace_id = $1 AND created_at > NOW() - INTERVAL '24 hours' ORDER BY created_at DESC LIMIT 20`,
      [workspaceId],
    );
    if (recentTrades?.length) {
      let sessionPnlR = 0;
      let consecutiveLosses = 0;
      let wins = 0;
      for (const t of recentTrades) sessionPnlR += Number(t.pnl_r || 0);
      for (const t of recentTrades) {
        if (Number(t.pnl_r || 0) < 0) consecutiveLosses++;
        else break;
      }
      const last5 = recentTrades.slice(0, 5);
      for (const t of last5) if (Number(t.pnl_r || 0) > 0) wins++;
      perfThrottle = computePerformanceThrottle({
        sessionPnlR,
        consecutiveLosses,
        rolling5WinRate: last5.length > 0 ? wins / last5.length : undefined,
      });
    }
  } catch {
    // non-critical
  }

  const phaseAdjustedThrottle = aclResult.throttle * sessionPhase.multiplier;
  const perfAdjusted = applyPerformanceDampener(phaseAdjustedThrottle, perfThrottle);
  const finalThrottle = perfAdjusted.throttle;

  // ─── Build the context prompt ─────────────────────

  const contextPrompt = `
PLATFORM STATE SNAPSHOT:

Ticker: ${ctx.ticker || 'None selected'}
Asset Class: ${ctx.assetClass || 'Unknown'}
Timeframe: ${ctx.timeframe || 'N/A'}
Current Price: ${ctx.currentPrice != null ? ctx.currentPrice : 'N/A'}

Regime: ${ctx.regimeLabel || 'Unknown'}  (raw: ${regimeRaw})
Risk Level: ${ctx.riskLevel || 'N/A'}
Permission: ${ctx.permission || 'N/A'}
Sizing: ${ctx.sizing || 'N/A'}
Volatility State: ${ctx.volatilityState || 'normal'}

Authorization: ${aclResult.authorization}
ACL Confidence: ${aclResult.confidence.toFixed(1)}%
ACL Throttle (final): ${(finalThrottle * 100).toFixed(0)}%
ACL Reason Codes: ${[...aclResult.reasonCodes, sessionPhase.reason, ...perfAdjusted.reasonCodes].join(' | ') || 'None'}

Session Phase: ${sessionPhase.phase} — ${sessionPhase.reason}
Session Favorable: ${sessionPhase.favorable ? 'YES' : 'NO'}
Session Multiplier: ×${sessionPhase.multiplier.toFixed(2)}

Regime Agreement: ${regimeAgreement.confidence}% (${regimeAgreement.agreementCount}/${regimeAgreement.totalChecks} signals)
Performance Throttle: ${perfThrottle.level} — ${perfThrottle.governorRecommendation}

Tier: ${tier}
Data Quality: ${ctx.dataQuality || 'unknown'}
Missing Data: ${(ctx.missingDataFields || []).join(', ') || 'None'}

Page Skill: ${ctx.pageSkill || 'None'}
Page Summary: ${ctx.pageSummary || 'No summary'}
Page Symbols: ${(ctx.pageSymbols || []).join(', ') || 'None'}
Page Data Keys: ${Object.keys(ctx.pageData || {}).join(', ') || 'None'}
${ctx.pageData?.direction ? `Direction: ${ctx.pageData.direction}` : ''}
${ctx.pageData?.score != null ? `Score: ${ctx.pageData.score}` : ''}
${ctx.pageData?.signalStrength ? `Signal Strength: ${ctx.pageData.signalStrength}` : ''}

Confluence Scoring:
- Weighted Score: ${regimeScoring.weightedScore.toFixed(1)}
- Trade Bias: ${regimeScoring.tradeBias}
- Weights: SQ=${regimeScoring.weights.SQ} TA=${regimeScoring.weights.TA} VA=${regimeScoring.weights.VA} LL=${regimeScoring.weights.LL} MTF=${regimeScoring.weights.MTF} FD=${regimeScoring.weights.FD}

Generate the 4-tab analysis as JSON. Remember: if authorization is BLOCKED, Plan and Act tabs must clearly state no trade.
`.trim();

  // ─── Call OpenAI ──────────────────────────────────

  try {
    const client = getOpenAIClient();
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ANALYST_CONTEXT_SYSTEM_PROMPT },
        { role: 'user', content: contextPrompt },
      ],
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { explain: raw, plan: '', act: '', learn: '' };
    }

    // Track usage
    try {
      await q(
        `INSERT INTO ai_usage (workspace_id, question, response_length, tier, prompt_tokens, completion_tokens, total_tokens, model, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          workspaceId,
          `[auto-context] ${ctx.ticker || 'no-ticker'} ${ctx.pageSkill || ''}`.substring(0, 500),
          raw.length,
          tier,
          response.usage?.prompt_tokens || 0,
          response.usage?.completion_tokens || 0,
          response.usage?.total_tokens || 0,
          'gpt-4o-mini',
        ],
      );
    } catch {
      // non-critical
    }

    return NextResponse.json({
      explain: parsed.explain || null,
      plan: parsed.plan || null,
      act: parsed.act || null,
      learn: parsed.learn || null,
      acl: {
        score: aclResult.confidence,
        confidence: regimeAgreement.confidence,
        throttle: finalThrottle,
        authorization: aclResult.authorization,
      },
      eventRisk: ctx.eventRisk || null,
      sessionPhase: {
        phase: sessionPhase.phase,
        favorable: sessionPhase.favorable,
        multiplier: sessionPhase.multiplier,
      },
      performanceThrottle: {
        level: perfThrottle.level,
        dampener: perfThrottle.ruDampener,
      },
      regimeAgreement: {
        confidence: regimeAgreement.confidence,
        agreement: `${regimeAgreement.agreementCount}/${regimeAgreement.totalChecks}`,
      },
    });
  } catch (err: any) {
    logger.error('Analyst context API error', { error: err?.message });
    if (err?.status === 429 || err?.code === 'rate_limit_exceeded') {
      return NextResponse.json({ error: 'AI service temporarily busy. Try again shortly.' }, { status: 429 });
    }
    return NextResponse.json({ error: err?.message || 'Analyst context generation failed.' }, { status: 500 });
  }
}
