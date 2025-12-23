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
 * - Free: 5 requests/day
 * - Pro: 50 requests/day
 * - Pro Trader: Unlimited
 * 
 * @example
 * POST /api/msp-analyst
 * Body: { query: "Analyze BTC-USD", context: { symbol: "BTC-USD", currentPrice: 45000 } }
 */

import { NextRequest } from "next/server";
import OpenAI from "openai";
import { MSP_ANALYST_V11_PROMPT } from "@/lib/prompts/mspAnalystV11";
import { SCANNER_EXPLAINER_RULES, getScannerExplainerContext } from "@/lib/prompts/scannerExplainerRules";
import { getSessionFromCookie } from "@/lib/auth";
import { q } from "@/lib/db";
import { logger } from "@/lib/logger";
import { analystRequestSchema } from "../../../lib/validation";
import { ZodError } from "zod";
import { runMigrations } from "@/lib/migrations";

export const runtime = "nodejs";

// Run migrations on first request
let migrationsChecked = false;

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export async function POST(req: NextRequest) {
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
          error: "OPENAI_API_KEY not set on server",
          debug: {
            hasKey: !!process.env.OPENAI_API_KEY,
            envKeys: Object.keys(process.env).filter(k => k.includes('OPENAI')),
            nodeEnv: process.env.NODE_ENV
          }
        }),
        { status: 500 }
      );
    }

    // Get user session for tier checking; allow free-for-all mode to bypass auth
    const freeForAll = process.env.FREE_FOR_ALL_MODE === "true";
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

    // Allow anonymous users with 10 free AI questions per day
    if (!session) {
      // Generate anonymous workspace ID from request fingerprint
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 
                 req.headers.get('x-real-ip') || 
                 'unknown';
      const userAgent = req.headers.get('user-agent') || 'unknown';
      
      // Create a simple fingerprint hash
      const encoder = new TextEncoder();
      const data = encoder.encode(`anon_${ip}_${userAgent.slice(0, 50)}`);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const fingerprint = hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
      
      session = {
        workspaceId: `anon_${fingerprint}`,
        tier: "free",
        exp: Math.floor(Date.now() / 1000) + 3600,
      } as any;
      isAnonymous = true;
    }

    const workspaceId = session!.workspaceId;
    const tier = session!.tier;

    // Define tier limits (fair-use caps to prevent abuse)
    const tierLimits: Record<string, number> = {
      'free': 5,         // Free/anonymous users: 5 questions/day
      'pro': 50,         // Pro subscribers: 50 questions/day
      'pro_trader': 200, // Pro Trader: 200/day (generous for professional workflows)
    };

    const dailyLimit = tierLimits[tier] || 5; // Default to free tier

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

    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      {
        role: "system",
        content: MSP_ANALYST_V11_PROMPT,
      },
    ];

    if (mode) {
      messages.push({
        role: "system",
        content: `Mode: ${mode}. Follow this mode when answering.`,
      });
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
        
        // Fetch all derivatives data in parallel
        const [oiRes, lsRes, fundingRes, fearGreedRes] = await Promise.all([
          fetch(`${baseUrl}/api/open-interest`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
          fetch(`${baseUrl}/api/long-short-ratio`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
          fetch(`${baseUrl}/api/funding-rates`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
          fetch(`${baseUrl}/api/fear-greed`, { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        ]);

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