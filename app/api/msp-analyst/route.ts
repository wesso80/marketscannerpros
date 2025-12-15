import { NextRequest } from "next/server";
import OpenAI from "openai";
import { MSP_ANALYST_V11_PROMPT } from "@/lib/prompts/mspAnalystV11";
import { getSessionFromCookie } from "@/lib/auth";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

type AnalystHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

type AnalystContext = {
  symbol?: string;
  timeframe?: string;
  currentPrice?: number;
  keyLevels?: number[];
};

type ScannerPayload = {
  source?: string;
  signal?: string;
  direction?: string;
  score?: number;
};

type AnalystRequestBody = {
  query: string;
  mode?: string;
  history?: AnalystHistoryItem[];
  context?: AnalystContext;
  scanner?: ScannerPayload;
};

export async function POST(req: NextRequest) {
  try {
    console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
    console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length || 0);
    
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

    // Get user session for tier checking
    const session = await getSessionFromCookie();
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
        console.error('Error checking AI usage:', dbErr);
        // Continue anyway - don't block on DB errors
      }
    }

    const body = (await req.json()) as AnalystRequestBody;

    if (!body?.query) {
      return new Response(
        JSON.stringify({ error: "Missing 'query' in request body" }),
        { status: 400 }
      );
    }

    const { query, mode, history, context, scanner } = body;

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

    // NEW: inject scanner metadata if this came from scanner
    if (scanner && scanner.source === "msp-web-scanner") {
      messages.push({
        role: "system",
        content: `
Scanner Origin Context:
This query originated from the MarketScanner Pro scanner.
- Signal Type: ${scanner.signal ?? "N/A"}
- Direction: ${scanner.direction ?? "N/A"}
- Signal Score: ${scanner.score ?? "N/A"}

Use scanner-specific logic:
1. Focus on explaining WHY this specific signal fired
2. Reference the technical indicators that created this setup
3. Provide entry/exit guidance based on the signal strength
4. Discuss risk management specific to this signal type
5. Be more tactical and trade-focused vs. general analysis
        `.trim(),
      });
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
      console.error('Error tracking AI usage:', dbErr);
      // Don't fail the request if tracking fails
    }

    return new Response(
      JSON.stringify({
        ok: true,
        text,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("MSP Analyst API error:", err);

    return new Response(
      JSON.stringify({
        ok: false,
        error: err?.message || "Unknown error calling MSP Analyst",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
