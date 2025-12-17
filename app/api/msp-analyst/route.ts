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
import { sql } from "@vercel/postgres";
import { logger } from "@/lib/logger";
import { analystRequestSchema } from "../../../lib/validation";

export const runtime = "nodejs";

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

export async function POST(req: NextRequest) {
  try {
    // Validate request body with Zod
    const json = await req.json();
    const body = analystRequestSchema.parse(json);
    
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
    if (!session && freeForAll) {
      // Temporary open-access session for free mode
      session = {
        workspaceId: "free-mode",
        tier: "pro_trader",
        exp: Math.floor(Date.now() / 1000) + 3600,
      } as any;
    }

    if (!session) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - Please log in" }),
        { status: 401 }
      );
    }

    const { workspaceId, tier } = session;

    // Define tier limits
    const tierLimits: Record<string, number | null> = {
      'free': 5,
      'pro': 50,
      'pro_trader': null, // Unlimited
    };

    const dailyLimit = tierLimits[tier] || 5; // Default to free tier

    // Check usage if not unlimited
    if (dailyLimit !== null) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const usageResult = await sql`
          SELECT COUNT(*) as count FROM ai_usage 
          WHERE workspace_id = ${workspaceId} AND DATE(created_at) = ${today}
        `;
        
        const usageCount = parseInt(usageResult.rows[0]?.count || '0');
        
        if (usageCount >= dailyLimit) {
          logger.warn('AI usage limit exceeded', {
            workspaceId,
            tier,
            dailyLimit,
            usageCount
          });
          
          return new Response(
            JSON.stringify({ 
              error: `Daily AI question limit reached (${dailyLimit} questions/day). ${tier === 'free' ? 'Upgrade to Pro for 50 questions/day or Pro Trader for unlimited.' : 'Limit resets at midnight UTC.'}`,
              limitReached: true,
              tier,
              dailyLimit,
              usageCount
            }),
            { status: 429 }
          );
        }
      } catch (dbErr) {
        logger.error('Error checking AI usage', { error: dbErr, workspaceId });
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
This query originated from the MarketScanner Pro scanner.
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
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
    });

    const text = response.choices[0]?.message?.content ?? "";

    // Track usage in database
    try {
      await sql`
        INSERT INTO ai_usage (workspace_id, question, response_length, tier, created_at)
        VALUES (${workspaceId}, ${query.substring(0, 500)}, ${text.length}, ${tier}, NOW())
      `;
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
    logger.error('MSP Analyst API error', {
      error: err?.message || 'Unknown error',
      stack: err?.stack
    });

    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || "Unknown error calling MSP Analyst",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}