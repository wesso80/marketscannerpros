/**
 * MSP Analyst AI Chat API
 * 
 * @route POST /api/msp-analyst
 * @description OpenAI-powered market analysis chatbot with tier-based rate limits
 * @authentication Required (ms_auth cookie)
 * 
 * @body {object} request
 * @body {string} request.query - User's question or command
 * @body {string} [request.mode] - Chat mode (default: 'chat')
 * @body {Array<{role: 'user'|'assistant', content: string}>} [request.history] - Conversation history
 * @body {object} [request.context] - Market context (symbol, timeframe, price, levels)
 * @body {object} [request.scanner] - Scanner signal data
 * 
 * @returns {object} AI response with usage stats
 * @returns {string} response.content - AI's answer
 * @returns {object} response.usage - Token usage and costs
 * 
 * @rateLimit
 * - Free: 10 requests/day
 * - Pro: 50 requests/day
 * - Pro Trader: 200 requests/day
 * 
 * @example
 * POST /api/msp-analyst
 * Body: { query: "Analyze BTC-USD", context: { symbol: "BTC-USD", currentPrice: 45000 } }
 */

import { NextRequest } from "next/server";
import OpenAI from "openai";
import { MSP_ANALYST_V2_PROMPT, buildAnalystV2SystemMessages } from "@/lib/prompts/mspAnalystV2";
import { PINE_SCRIPT_V2_PROMPT, isPineScriptRequest } from "@/lib/prompts/pineScriptEngineerV2";
import { SCANNER_EXPLAINER_RULES, getScannerExplainerContext } from "@/lib/prompts/scannerExplainerRules";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";
import { logger } from "@/lib/logger";
import { analystRequestSchema } from "../../../lib/validation";
import { ZodError } from "zod";
import { runMigrations } from "@/lib/migrations";
import { aiLimiter, getClientIP } from "@/lib/rateLimit";
import { getAdaptiveLayer } from "@/lib/adaptiveTrader";
import { computeInstitutionalFilter, inferStrategyFromText } from "@/lib/institutionalFilter";
import { AI_DAILY_LIMITS, isFreeForAllMode, normalizeTier } from "@/lib/entitlements";
import { mapToScoringRegime, computeRegimeScore, estimateComponentsFromContext } from "@/lib/ai/regimeScoring";
import { computeACLFromScoring } from "@/lib/ai/adaptiveConfidenceLens";
import type { PromptMode } from "@/lib/ai/types";

export const runtime = "nodejs";

// Run migrations on first request
let migrationsChecked = false;

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

/**
 * Infer market regime from indicator data with query-text fallback.
 * Replaces naive regex detection with actual technical analysis.
 */
function inferRegimeFromData(scanData: any, query: string): string {
  // Priority 1: Use actual technical indicators
  if (scanData) {
    const adx = scanData.adx !== undefined ? Number(scanData.adx) : NaN;
    const rsi = scanData.rsi !== undefined ? Number(scanData.rsi) : NaN;
    const aroonUp = scanData.aroon_up !== undefined ? Number(scanData.aroon_up) : NaN;
    const aroonDown = scanData.aroon_down !== undefined ? Number(scanData.aroon_down) : NaN;

    // Extreme RSI → vol expansion
    if (!isNaN(rsi) && (rsi > 80 || rsi < 20)) return 'VOL_EXPANSION';

    // Strong directional trend: ADX > 25
    if (!isNaN(adx) && adx > 25) {
      if (!isNaN(aroonUp) && !isNaN(aroonDown)) {
        if (aroonUp > 70 && aroonDown < 30) return 'TREND_UP';
        if (aroonDown > 70 && aroonUp < 30) return 'TREND_DOWN';
      }
      if (!isNaN(rsi)) {
        if (rsi >= 55) return 'TREND_UP';
        if (rsi <= 45) return 'TREND_DOWN';
      }
      return 'TREND_UP'; // Strong ADX defaults bullish
    }

    // Weak ADX → range bound
    if (!isNaN(adx) && adx < 20) return 'RANGE_NEUTRAL';

    // ADX 20-25 → borderline, conservative
    if (!isNaN(adx)) return 'RANGE_NEUTRAL';
  }

  // Priority 2: Query text heuristics (fallback when no indicator data)
  const q = query.toLowerCase();
  if (/risk.?off|stress|crash|sell.?off|panic|capitulat/.test(q)) return 'RISK_OFF_STRESS';
  if (/vol(?:atile|atility)?.*(?:spike|expan|high|extreme)|vix.*(?:spike|high)/.test(q)) return 'VOL_EXPANSION';
  if (/bear(?:ish)?|down.?trend|sell(?:ing)?.*pressure/.test(q)) return 'TREND_DOWN';
  if (/bull(?:ish)?|up.?trend|break.?out|momentum|rally/.test(q)) return 'TREND_UP';
  if (/range|chop|sideways|flat|consolidat/.test(q)) return 'RANGE_NEUTRAL';
  if (/contract|compress|squeeze|tight|low.?vol/.test(q)) return 'VOL_CONTRACTION';

  return 'RANGE_NEUTRAL';
}

/** Count real indicator data points available from scanner */
function countDataComponents(scanner: any): number {
  if (!scanner?.scanData) return 0;
  const d = scanner.scanData;
  let count = 0;
  if (d.rsi !== undefined && d.rsi !== null) count++;
  if (d.adx !== undefined && d.adx !== null) count++;
  if (d.cci !== undefined && d.cci !== null) count++;
  if (d.macd_hist !== undefined && d.macd_hist !== null) count++;
  if (d.obv !== undefined && d.obv !== null) count++;
  if (d.stoch_k !== undefined && d.stoch_k !== null) count++;
  if (d.aroon_up !== undefined && d.aroon_up !== null) count++;
  if (d.aroon_down !== undefined && d.aroon_down !== null) count++;
  if (d.atr !== undefined && d.atr !== null) count++;
  if (d.ema200 !== undefined && d.ema200 !== null) count++;
  return count;
}

export async function POST(req: NextRequest) {
  // Rate limit: 10 requests per minute per IP (prevents spam, separate from daily DB limits)
  const ip = getClientIP(req);
  const rateCheck = aiLimiter.check(ip);
  if (!rateCheck.allowed) {
    return new Response(
      JSON.stringify({ 
        error: "Too many requests. Please slow down.", 
        retryAfter: rateCheck.retryAfter 
      }),
      { status: 429, headers: { "Retry-After": String(rateCheck.retryAfter) } }
    );
  }

  // Ensure migrations are run
  if (!migrationsChecked) {
    migrationsChecked = true;
    runMigrations().catch(console.error);
  }

  try {
    // Validate request body with Zod
    let json;
    try {
      json = await req.json();
    } catch (parseErr) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        { status: 400 }
      );
    }
    
    let body;
    try {
      body = analystRequestSchema.parse(json);
    } catch (zodErr) {
      if (zodErr instanceof ZodError) {
        return new Response(
          JSON.stringify({ 
            error: "Validation failed", 
            details: zodErr.issues 
          }),
          { status: 400 }
        );
      }
      throw zodErr;
    }
    
    const { query, mode, history, context, scanner } = body;
    
    if (!process.env.OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ 
          error: "AI service unavailable",
          ...(process.env.NODE_ENV === 'development' ? {
            debug: {
              hasKey: !!process.env.OPENAI_API_KEY,
              nodeEnv: process.env.NODE_ENV
            }
          } : {})
        }),
        { status: 500 }
      );
    }

    // Get user session for tier checking; allow free-for-all mode to bypass auth
    const freeForAll = isFreeForAllMode();
    let session = await getSessionFromCookie();
    let isAnonymous = false;
    
    if (!session && freeForAll) {
      // Temporary open-access session for free mode
      session = {
        workspaceId: "free-mode",
        tier: "pro_trader",
        exp: Math.floor(Date.now() / 1000) + 3600,
      } as any;
    }

    // Require authentication — no anonymous AI access (prevents OpenAI credit burning)
    if (!session) {
      return new Response(
        JSON.stringify({ error: "Authentication required. Please log in to use AI analyst.", authRequired: true }),
        { status: 401 }
      );
    }

    const workspaceId = session!.workspaceId;
    const tier = normalizeTier(session!.tier);

    const directionValue = String(scanner?.direction || '').toLowerCase();
    const adaptiveDirection: 'bullish' | 'bearish' | 'neutral' | undefined =
      directionValue === 'bullish' || directionValue === 'bearish' || directionValue === 'neutral'
        ? directionValue
        : undefined;

    const adaptive = await getAdaptiveLayer(
      workspaceId,
      {
        skill: mode || 'ai_analyst',
        setupText: `${query} ${context?.symbol || ''} ${context?.timeframe || ''}`,
        direction: adaptiveDirection,
        timeframe: context?.timeframe || undefined,
      },
      Number(scanner?.score ?? 50)
    );

    // ===== INDICATOR-BASED REGIME INFERENCE (replaces naive regex) =====
    const regimeInferred = inferRegimeFromData(scanner?.scanData, query);
    const dataComponentCount = countDataComponents(scanner);

    const institutionalFilter = computeInstitutionalFilter({
      baseScore: Number(scanner?.score ?? 50),
      strategy: inferStrategyFromText(`${query} ${mode || ''}`),
      regime: regimeInferred === 'RANGE_NEUTRAL' || regimeInferred === 'VOL_CONTRACTION' ? 'ranging'
            : regimeInferred.startsWith('TREND') ? 'trending'
            : regimeInferred === 'VOL_EXPANSION' || regimeInferred === 'RISK_OFF_STRESS' ? 'high_volatility_chaos'
            : 'unknown',
      liquidity: {
        session: 'regular',
      },
      volatility: {
        state: regimeInferred === 'VOL_EXPANSION' || regimeInferred === 'RISK_OFF_STRESS' ? 'extreme'
              : /extreme|chaos|shock/.test(query.toLowerCase()) ? 'extreme' : 'normal',
      },
      dataHealth: {
        freshness: scanner?.source === 'msp-web-scanner' ? 'LIVE' : 'DELAYED',
      },
      riskEnvironment: {
        traderRiskDNA: adaptive.profile?.riskDNA,
        stressLevel: /fomc|cpi|nfp|earnings|news/.test(query.toLowerCase()) ? 'high' : 'medium',
      },
      newsEventSoon: /fomc|cpi|nfp|earnings|news/.test(query.toLowerCase()),
    });

    // Define tier limits (fair-use caps to prevent abuse)
    const dailyLimit = AI_DAILY_LIMITS[tier];

    // Check usage against daily limit
    if (dailyLimit) {
      try {
        const today = new Date().toISOString().split('T')[0];
        // Use text comparison for workspace_id (supports both UUID and anon_xxx formats)
        const usageResult = await q(
          `SELECT COUNT(*) as count FROM ai_usage 
          WHERE workspace_id = $1 AND DATE(created_at) = $2`,
          [workspaceId, today]
        );
        
        const usageCount = parseInt(usageResult[0]?.count || '0');
        
        if (usageCount >= dailyLimit) {
          logger.warn('AI usage limit exceeded', {
            workspaceId,
            tier,
            dailyLimit,
            usageCount
          });
          
          const upgradeMsg = tier === 'free' 
            ? 'Upgrade to Pro for 50/day or Pro Trader for 200/day.' 
            : 'Limit resets at midnight UTC.';
          
          return new Response(
            JSON.stringify({ 
              error: `Daily AI question limit reached (${dailyLimit}/day). ${upgradeMsg}`,
              limitReached: true,
              tier,
              dailyLimit,
              usageCount
            }),
            { status: 429 }
          );
        }
      } catch (dbErr: any) {
        // Table might not exist - log but continue
        logger.warn('AI usage check skipped (table may not exist)', { 
          error: dbErr?.message, 
          workspaceId 
        });
        // Continue anyway - don't block on DB errors
      }
    }

    if (!query) {
      return new Response(
        JSON.stringify({ error: "Missing 'query' in request body" }),
        { status: 400 }
      );
    }

    // ===== V2 DUAL-MODE PROMPT ROUTING =====
    const promptMode: PromptMode = isPineScriptRequest(query) ? 'pine_script' : 'analyst';
    const basePrompt = promptMode === 'pine_script' ? PINE_SCRIPT_V2_PROMPT : MSP_ANALYST_V2_PROMPT;

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      {
        role: "system",
        content: basePrompt,
      },
    ];

    if (mode) {
      messages.push({
        role: "system",
        content: `Mode: ${mode}. Follow this mode when answering.`,
      });
    }

    // ===== V2 REGIME-CALIBRATED SCORING + ACL =====
    const regimeLabel = institutionalFilter.filters.find(f => f.key === 'regime')?.reason || 'unknown';
    const scoringRegime = mapToScoringRegime(regimeInferred);
    
    // Estimate confluence components from available data
    const components = estimateComponentsFromContext({
      scannerScore: Number(scanner?.score ?? 50),
      regime: regimeInferred,
      rsi: scanner?.scanData?.rsi,
      cci: scanner?.scanData?.cci,
      adx: scanner?.scanData?.adx,
      aroonUp: scanner?.scanData?.aroon_up,
      aroonDown: scanner?.scanData?.aroon_down,
      obv: scanner?.scanData?.obv,
      session: 'regular',
      derivativesAvailable: false, // Will be set to true if crypto data fetched
    });
    
    const regimeScoring = computeRegimeScore(components, scoringRegime);
    
    // Determine event risk from query keywords
    const eventRiskLevel = /fomc|cpi|nfp|earnings|news/.test(query.toLowerCase()) ? 'high' as const : 'none' as const;
    
    const aclResult = computeACLFromScoring(regimeScoring, {
      regimeConfidence: institutionalFilter.finalScore,
      setupType: inferStrategyFromText(query) === 'breakout' ? 'breakout' :
                 inferStrategyFromText(query) === 'mean_reversion' ? 'mean_reversion' :
                 inferStrategyFromText(query) === 'momentum' ? 'momentum' :
                 inferStrategyFromText(query) === 'macro_swing' ? 'swing' : undefined,
      eventRisk: eventRiskLevel,
      riskGovernorPermission: institutionalFilter.noTrade ? 'BLOCK' : 'ALLOW',
      dataComponentsProvided: dataComponentCount,
    });
    
    // Inject V2 platform state (regime weights + ACL)
    const v2StateInjection = buildAnalystV2SystemMessages({
      regimeLabel: scoringRegime,
      riskLevel: institutionalFilter.finalGrade,
      permission: institutionalFilter.noTrade ? 'BLOCK' : 'ALLOW',
      regimeWeights: regimeScoring.weights,
      aclResult: {
        confidence: aclResult.confidence,
        authorization: aclResult.authorization,
        throttle: aclResult.throttle,
        reasonCodes: aclResult.reasonCodes,
      },
      volatilityState: institutionalFilter.filters.find(f => f.key === 'volatility')?.reason,
    });
    
    if (v2StateInjection) {
      messages.push({ role: "system", content: v2StateInjection });
    }

    // NEW: inject strict scanner explainer rules if this came from scanner
    if (scanner && scanner.source === "msp-web-scanner") {
      // First, inject the hard constraint rules
      messages.push({
        role: "system",
        content: SCANNER_EXPLAINER_RULES,
      });

      // Then inject the specific scan context with score-locked guidance
      if (scanner.scanData) {
        const scannerContext = getScannerExplainerContext({
          score: scanner.score ?? 0,
          symbol: context?.symbol ?? scanner.scanData.symbol ?? "Unknown",
          timeframe: context?.timeframe ?? "N/A",
          price: scanner.scanData.price,
          rsi: scanner.scanData.rsi,
          cci: scanner.scanData.cci,
          macd_hist: scanner.scanData.macd_hist,
          ema200: scanner.scanData.ema200,
          atr: scanner.scanData.atr,
          adx: scanner.scanData.adx,
          stoch_k: scanner.scanData.stoch_k,
          stoch_d: scanner.scanData.stoch_d,
          aroon_up: scanner.scanData.aroon_up,
          aroon_down: scanner.scanData.aroon_down,
          obv: scanner.scanData.obv,
        });
        messages.push({
          role: "system",
          content: scannerContext,
        });
      } else {
        // Fallback: legacy scanner format without full scanData
        messages.push({
          role: "system",
          content: `
Scanner Origin Context:
This query originated from the MarketScannerPros scanner.
- Signal Type: ${scanner.signal ?? "N/A"}
- Direction: ${scanner.direction ?? "N/A"}
- Signal Score: ${scanner.score ?? "N/A"}

CRITICAL: Your trade guidance MUST NOT contradict the score of ${scanner.score ?? "N/A"}.
Use scanner-specific logic:
1. Focus on explaining WHY this specific signal fired
2. Reference the technical indicators that created this setup
3. Provide entry/exit guidance based on the signal strength
4. Discuss risk management specific to this signal type
5. End with a verdict: ✅ Trade-Ready | ⚠️ Wait for Confirmation | ❌ No-Trade Zone
          `.trim(),
        });
      }
    }

    // NEW: inject structured market context so the model uses REAL values
    if (context && (context.symbol || context.timeframe || context.currentPrice || (context.keyLevels?.length))) {
      messages.push({
        role: "system",
        content: `
Market Context (authoritative, do NOT change these values):
- Symbol: ${context.symbol ?? "N/A"}
- Timeframe: ${context.timeframe ?? "N/A"}
- Current Price: ${context.currentPrice ?? "N/A"}
- Key Levels: ${JSON.stringify(context.keyLevels ?? [])}

You must treat this data as ground truth.
Do NOT invent different prices or levels. 
If information is missing, say so explicitly instead of guessing.
        `.trim(),
      });
    }

    messages.push({
      role: "system",
      content: `
Adaptive Trader Personality Layer (ATPL):
- Profile Status: ${adaptive.profile ? 'READY' : 'WARMING_UP'}
- Style Bias: ${adaptive.profile?.styleBias || 'unknown'}
- Risk DNA: ${adaptive.profile?.riskDNA || 'unknown'}
- Decision Timing: ${adaptive.profile?.decisionTiming || 'unknown'}
- Setup Fit Score: ${adaptive.match.personalityMatch}%
- Adaptive Confidence: ${adaptive.match.adaptiveScore}%
- No-Trade Bias: ${adaptive.match.noTradeBias ? 'ACTIVE' : 'INACTIVE'}
- Reasons: ${adaptive.match.reasons.join(' | ')}

Instruction:
- Personalize recommendations to this profile.
- If No-Trade Bias is ACTIVE, prioritize wait/skip language unless very strong counter-evidence exists.
- If profile is warming up, clearly state lower personalization confidence.
      `.trim(),
    });

    messages.push({
      role: "system",
      content: `
Institutional Filter Engine (IFE):
- Final Quality Score: ${institutionalFilter.finalScore}
- Final Grade: ${institutionalFilter.finalGrade}
- Recommendation: ${institutionalFilter.recommendation}
- No-Trade Trigger: ${institutionalFilter.noTrade ? 'ACTIVE' : 'INACTIVE'}
- Filter States: ${institutionalFilter.filters.map(f => `${f.label}=${f.status}`).join(' | ')}

Instruction:
- If No-Trade Trigger is ACTIVE, your default recommendation should be WAIT / NO TRADE unless there is exceptional contradictory evidence.
- Always surface which institutional filters pass, warn, or block before giving execution guidance.
      `.trim(),
    });

    // NEW: Inject derivatives context if crypto-related query
    const cryptoKeywords = ['btc', 'eth', 'bitcoin', 'ethereum', 'crypto', 'sol', 'xrp', 'doge', 'bnb', 'ada', 'avax', 'link', 'matic', 'ltc'];
    const queryLower = query.toLowerCase();
    const symbolLower = (context?.symbol || '').toLowerCase();
    
    const isCryptoQuery = cryptoKeywords.some(kw => queryLower.includes(kw) || symbolLower.includes(kw)) ||
                          context?.symbol?.includes('USDT') ||
                          context?.symbol?.includes('-USD');
    
    if (isCryptoQuery) {
      try {
        // Determine base URL for internal API calls
        const host = req.headers.get('host') || 'localhost:5000';
        const protocol = host.includes('localhost') ? 'http' : 'https';
        const baseUrl = `${protocol}://${host}`;
        
        // Fetch all derivatives data in parallel (surface failures for data health)
        const safeJsonFetch = async (url: string, label: string) => {
          try {
            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) { console.warn(`[msp-analyst] ${label} returned HTTP ${r.status}`); return null; }
            return await r.json();
          } catch (err) {
            console.warn(`[msp-analyst] ${label} fetch failed:`, err instanceof Error ? err.message : err);
            return null;
          }
        };

        const [oiRes, lsRes, fundingRes, fearGreedRes] = await Promise.all([
          safeJsonFetch(`${baseUrl}/api/open-interest`, 'open-interest'),
          safeJsonFetch(`${baseUrl}/api/long-short-ratio`, 'long-short-ratio'),
          safeJsonFetch(`${baseUrl}/api/funding-rates`, 'funding-rates'),
          safeJsonFetch(`${baseUrl}/api/fear-greed`, 'fear-greed'),
        ]);

        // Track data health for response metadata
        const dataHealth = {
          openInterest: oiRes !== null,
          longShortRatio: lsRes !== null,
          fundingRates: fundingRes !== null,
          fearGreed: fearGreedRes !== null,
        };

        let derivativesContext = '\n📊 DERIVATIVES & SENTIMENT DATA (Live from Binance Futures):\n';
        
        if (oiRes && oiRes.total) {
          derivativesContext += `
OPEN INTEREST:
- Total OI: ${oiRes.total.formatted}
- 24h Change: ${oiRes.total.change24h !== undefined ? (oiRes.total.change24h >= 0 ? '+' : '') + oiRes.total.change24h.toFixed(2) + '%' : 'N/A'}
- BTC Dominance: ${oiRes.total.btcDominance}%
- ETH Dominance: ${oiRes.total.ethDominance}%
- BTC OI: ${oiRes.btc?.formatted || 'N/A'} (${oiRes.btc?.change24h !== undefined ? (oiRes.btc.change24h >= 0 ? '+' : '') + oiRes.btc.change24h.toFixed(2) + '%' : 'N/A'} 24h)
- ETH OI: ${oiRes.eth?.formatted || 'N/A'} (${oiRes.eth?.change24h !== undefined ? (oiRes.eth.change24h >= 0 ? '+' : '') + oiRes.eth.change24h.toFixed(2) + '%' : 'N/A'} 24h)
`;
        }

        if (lsRes && lsRes.average) {
          derivativesContext += `
LONG/SHORT RATIO:
- Average L/S Ratio: ${lsRes.average.longShortRatio}
- Long Accounts: ${lsRes.average.longPercent}%
- Short Accounts: ${lsRes.average.shortPercent}%
- Sentiment: ${lsRes.average.sentiment}
`;
        }

        if (fundingRes && fundingRes.average) {
          derivativesContext += `
💰 FUNDING RATES:
- Average Funding: ${fundingRes.average.fundingRatePercent}%
- Annualized: ${fundingRes.average.annualized}%
- Sentiment: ${fundingRes.average.sentiment}
- Next Funding: ${fundingRes.nextFunding?.timeUntilFormatted || 'N/A'}
`;
        }

        // Add Fear & Greed Index
        if (fearGreedRes && fearGreedRes.current) {
          const fgValue = fearGreedRes.current.value;
          derivativesContext += `
😱 CRYPTO FEAR & GREED INDEX:
- Score: ${fgValue}/100
- Classification: ${fearGreedRes.current.classification}
- Trend: ${fgValue < 25 ? '🔴 Extreme Fear (contrarian bullish)' : 
           fgValue < 45 ? '🟠 Fear' : 
           fgValue < 55 ? '🟡 Neutral' : 
           fgValue < 75 ? '🟢 Greed' : '🔴 Extreme Greed (contrarian bearish)'}
`;
        }

        if (oiRes?.total || lsRes?.average || fundingRes?.average || fearGreedRes?.data) {
          messages.push({
            role: "system",
            content: derivativesContext + `

🎯 DERIVATIVES INTERPRETATION GUIDE:
Use this data to enhance your analysis:

1. OPEN INTEREST SIGNALS:
   - OI ↑ + Price ↑ = Strong bullish (new money entering longs)
   - OI ↑ + Price ↓ = Strong bearish (new shorts opening)
   - OI ↓ + Price ↑ = Weak rally (short covering)
   - OI ↓ + Price ↓ = Capitulation (long liquidations)
   - OI change >5% in 24h = High conviction move

2. LONG/SHORT RATIO:
   - L/S > 1.5 = Crowded longs (risk of squeeze down)
   - L/S < 0.7 = Crowded shorts (risk of squeeze up)
   - Extreme readings often precede reversals

3. FUNDING RATES:
   - Funding > 0.05% = Overleveraged longs (bearish signal)
   - Funding < -0.05% = Overleveraged shorts (bullish signal)
   - Neutral funding = Balanced market

4. FEAR & GREED:
   - <25 = Extreme Fear (historically good buying opportunity)
   - >75 = Extreme Greed (historically good time to take profits)

Always mention which derivatives signals support or contradict your analysis.
            `.trim(),
          });
        }
      } catch (derivErr) {
        // Silently fail - derivatives data is optional enhancement
        logger.debug('Failed to fetch derivatives data for AI context', { error: derivErr });
      }
    }

    if (history && Array.isArray(history)) {
      for (const msg of history) {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }

    messages.push({
      role: "user",
      content: query,
    });

    const client = getOpenAIClient();
    
    let response;
    try {
      response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages,
      });
    } catch (openaiErr: any) {
      // Handle OpenAI-specific errors
      if (openaiErr?.code === 'rate_limit_exceeded' || openaiErr?.status === 429) {
        logger.warn('OpenAI rate limit exceeded', { error: openaiErr.message });
        return new Response(
          JSON.stringify({
            ok: false,
            error: "AI service is temporarily busy. Please try again in a few minutes.",
            rateLimited: true
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      }
      throw openaiErr;
    }

    const text = response.choices[0]?.message?.content ?? "";
    const usage = response.usage;

    // Track usage in database (including tokens for cost tracking)
    try {
      await q(
        `INSERT INTO ai_usage (workspace_id, question, response_length, tier, prompt_tokens, completion_tokens, total_tokens, model, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          workspaceId, 
          query.substring(0, 500), 
          text.length, 
          tier,
          usage?.prompt_tokens || 0,
          usage?.completion_tokens || 0,
          usage?.total_tokens || 0,
          'gpt-4o-mini'
        ]
      );
    } catch (dbErr) {
      logger.error('Error tracking AI usage', { error: dbErr, workspaceId });
      // Don't fail the request if tracking fails
    }

    logger.info('AI analyst request completed', {
      workspaceId,
      tier,
      queryLength: query.length,
      responseLength: text.length
    });

    return new Response(
      JSON.stringify({
        ok: true,
        text,
        // V2 structured metadata
        promptMode,
        decision: {
          regime: scoringRegime,
          riskEnvironment: institutionalFilter.finalGrade,
          volatilityState: institutionalFilter.filters.find(f => f.key === 'volatility')?.status || 'unknown',
          confluenceScore: regimeScoring.weightedScore,
          authorization: aclResult.authorization,
          throttle: aclResult.throttle,
          tradeBias: regimeScoring.tradeBias,
          verdict: aclResult.authorization === 'BLOCKED' ? 'NO_TRADE' :
                   aclResult.authorization === 'CONDITIONAL' ? 'CONDITIONAL' :
                   regimeScoring.tradeBias === 'HIGH_CONFLUENCE' ? 'TRADE_READY' : 'WATCH',
          reasonCodes: aclResult.reasonCodes,
        },
        confidence: {
          value: aclResult.confidence,
          type: 'composite',
          horizon: 'next_session',
          components: [
            { name: 'SQ', weight: regimeScoring.weights.SQ, value: regimeScoring.rawComponents.SQ },
            { name: 'TA', weight: regimeScoring.weights.TA, value: regimeScoring.rawComponents.TA },
            { name: 'VA', weight: regimeScoring.weights.VA, value: regimeScoring.rawComponents.VA },
            { name: 'LL', weight: regimeScoring.weights.LL, value: regimeScoring.rawComponents.LL },
            { name: 'MTF', weight: regimeScoring.weights.MTF, value: regimeScoring.rawComponents.MTF },
            { name: 'FD', weight: regimeScoring.weights.FD, value: regimeScoring.rawComponents.FD },
          ],
          calibrationNote: `Regime: ${scoringRegime} | ACL Pipeline: Base=${aclResult.pipeline.step1_base}→Final=${aclResult.pipeline.step5_final}`,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    // Detailed error logging for debugging
    const errorDetails = {
      message: err?.message || 'Unknown error',
      name: err?.name,
      code: err?.code,
      stack: err?.stack?.split('\n').slice(0, 5).join('\n')
    };
    
    logger.error('MSP Analyst API error', errorDetails);

    // Return detailed error in development, generic in production
    const isDev = process.env.NODE_ENV === 'development';
    
    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || "Unknown error calling MSP Analyst",
        ...(isDev || true ? { debug: errorDetails } : {}) // Always show debug for now
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}