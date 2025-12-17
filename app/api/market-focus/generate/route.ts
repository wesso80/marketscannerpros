import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import OpenAI from "openai";
import { q } from "@/lib/db";

export const runtime = "nodejs";

function getOpenAIClient() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

type Candidate = {
  assetClass: "equity" | "crypto" | "commodity";
  symbol: string;
  name?: string;
  venue?: string;
  score: number;
  scannerPayload: any;
  keyLevels?: any;
  risks?: any;
};

function todayKeyUTC(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildMSPPrompt(c: Candidate): string {
  return `
You are MSP AI Analyst v1.1 for MarketScanner Pros.

Task: Generate a concise institutional-style explanation for today's DAILY AI MARKET FOCUS pick.

Asset:
- Asset class: ${c.assetClass}
- Symbol: ${c.symbol}
- Name: ${c.name ?? "N/A"}
- Score: ${c.score}

Scanner outputs:
${JSON.stringify(c.scannerPayload, null, 2)}

Key Levels: ${JSON.stringify(c.keyLevels, null, 2)}
Risks: ${JSON.stringify(c.risks, null, 2)}

Rules:
- Do NOT give buy/sell instructions or predict prices.
- Use MSP language: Bullish/Bearish Phase, Multi-TF Alignment, Liquidity Zone.
- Keep response under 150 words.
- Format: Executive Summary, Core Analysis, Key Levels, Risks.
`.trim();
}

async function generateExplanation(c: Candidate): Promise<string> {
  const client = getOpenAIClient();
  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are MSP AI Analyst, a professional market structure analyst." },
        { role: "user", content: buildMSPPrompt(c) }
      ],
      max_tokens: 400,
      temperature: 0.7,
    });
    return resp.choices[0]?.message?.content ?? "";
  } catch (err: any) {
    console.error("[generate] OpenAI error:", err?.message);
    return `Analysis unavailable: ${err?.message || "OpenAI error"}`;
  }
}

/**
 * Manual trigger for generating AI Market Focus.
 * Accessible when FREE_FOR_ALL_MODE is enabled, or to authenticated pro/pro_trader users.
 */
export async function POST(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");
  const adminKey = process.env.ADMIN_API_KEY;
  
  let authorized = false;
  
  if (process.env.FREE_FOR_ALL_MODE === "true") {
    authorized = true;
  } else if (adminKey && apiKey === adminKey) {
    authorized = true;
  } else {
    const session = await getSessionFromCookie();
    if (session?.tier === "pro_trader" || session?.tier === "pro") {
      authorized = true;
    }
  }
  
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized - Pro access required" }, { status: 401 });
  }

  const dateKey = todayKeyUTC();

  try {
    // Check if already generated today
    const existing = await q<{ id: string; status: string }>(
      `select id, status from daily_market_focus where date_key = $1 limit 1`,
      [dateKey]
    );

    if (existing[0]?.status === "ready") {
      return NextResponse.json({ status: "already_ready", date: dateKey, message: "Already generated today" });
    }

    let focusId = existing[0]?.id;

    if (!focusId) {
      const created = await q<{ id: string }>(
        `insert into daily_market_focus (focus_date, date_key, status) values ($1, $1, 'pending') returning id`,
        [dateKey]
      );
      focusId = created[0].id;
    } else {
      await q(`delete from daily_market_focus_items where focus_id = $1`, [focusId]);
    }

    // Fetch candidates from our local API - use production URL to avoid VERCEL_URL issues
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

    console.log("[generate] Fetching candidates from:", baseUrl);
    const candidatesRes = await fetch(`${baseUrl}/api/market-focus/candidates`, { 
      cache: "no-store",
      headers: { 'Content-Type': 'application/json' }
    });
    if (!candidatesRes.ok) {
      const errorText = await candidatesRes.text();
      console.error("[generate] Candidates error:", candidatesRes.status, errorText);
      throw new Error(`Candidates API error: ${candidatesRes.status}`);
    }
    const candidatesData = await candidatesRes.json();
    const allCandidates = candidatesData.candidates || [];

    // Pick top from each asset class
    const pickTop = (cls: string) => allCandidates
      .filter((c: Candidate) => c.assetClass.toLowerCase() === cls)
      .sort((a: Candidate, b: Candidate) => b.score - a.score)[0];

    const picks = [pickTop("equity"), pickTop("crypto"), pickTop("commodity")].filter(Boolean) as Candidate[];

    if (picks.length === 0) {
      throw new Error("No candidates available from scanner");
    }

    // Generate AI explanations
    const explained = await Promise.all(
      picks.map(async (c) => ({ ...c, explanation: await generateExplanation(c) }))
    );

    // Store in database
    for (const c of explained) {
      await q(
        `insert into daily_market_focus_items
          (focus_id, asset_class, symbol, name, venue, score, scanner_payload, explanation, key_levels, risks)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb)`,
        [
          focusId,
          c.assetClass,
          c.symbol,
          c.name ?? null,
          c.venue ?? null,
          c.score ?? null,
          JSON.stringify(c.scannerPayload ?? {}),
          c.explanation ?? "",
          JSON.stringify(c.keyLevels ?? {}),
          JSON.stringify(c.risks ?? {}),
        ]
      );
    }

    await q(`update daily_market_focus set status='ready', updated_at=now() where id=$1`, [focusId]);

    return NextResponse.json({
      status: "ready",
      date: dateKey,
      picks: explained.map(p => ({ assetClass: p.assetClass, symbol: p.symbol, score: p.score }))
    });
  } catch (err: any) {
    console.error("[generate] Error:", err);
    return NextResponse.json({ status: "failed", error: err?.message || "Generation failed" }, { status: 500 });
  }
}
