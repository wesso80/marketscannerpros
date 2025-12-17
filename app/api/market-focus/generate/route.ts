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
  
  // Check for force regenerate parameter
  const { searchParams } = new URL(req.url);
  const forceRegenerate = searchParams.get("force") === "true";

  try {
    // Check if already generated today
    const existing = await q<{ id: string; status: string }>(
      `select id, status from daily_market_focus where date_key = $1 limit 1`,
      [dateKey]
    );

    if (existing[0]?.status === "ready" && !forceRegenerate) {
      return NextResponse.json({ status: "already_ready", date: dateKey, message: "Already generated today. Use ?force=true to regenerate." });
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

    // Fetch candidates - use production URL directly to avoid subdomain/deployment issues
    const baseUrl = "https://www.marketscannerpros.app";

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

    // Log what we got
    console.log("[generate] Total candidates:", allCandidates.length);
    console.log("[generate] By asset class:", {
      equity: allCandidates.filter((c: Candidate) => c.assetClass.toLowerCase() === "equity").length,
      crypto: allCandidates.filter((c: Candidate) => c.assetClass.toLowerCase() === "crypto").length,
      commodity: allCandidates.filter((c: Candidate) => c.assetClass.toLowerCase() === "commodity").length,
    });

    // Pick top from each asset class
    const pickTop = (cls: string) => allCandidates
      .filter((c: Candidate) => c.assetClass.toLowerCase() === cls)
      .sort((a: Candidate, b: Candidate) => b.score - a.score)[0];

    const equityPick = pickTop("equity");
    const cryptoPick = pickTop("crypto");
    const commodityPick = pickTop("commodity");
    
    console.log("[generate] Picks:", {
      equity: equityPick?.symbol || "NONE",
      crypto: cryptoPick?.symbol || "NONE",
      commodity: commodityPick?.symbol || "NONE",
    });

    const picks = [equityPick, cryptoPick, commodityPick].filter(Boolean) as Candidate[];

    if (picks.length === 0) {
      throw new Error("No candidates available from scanner");
    }

    // Generate AI explanations
    const explained = await Promise.all(
      picks.map(async (c) => ({ ...c, explanation: await generateExplanation(c) }))
    );

    // Store in database
    for (const c of explained) {
      const payload = c.scannerPayload || {};
      await q(
        `INSERT INTO daily_market_focus_items
          (focus_id, asset_class, symbol, score, phase, structure, risk_level, 
           price, change_percent, rsi, macd_histogram, atr, ai_explanation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          focusId,
          c.assetClass.toLowerCase(),
          c.symbol,
          c.score ?? 0,
          payload.phase ?? null,
          payload.structure ?? null,
          payload.risk ?? null,
          payload.price ?? null,
          null, // change_percent not in scanner payload
          payload.rsi ?? null,
          payload.macdHist ?? null,
          payload.atr ?? null,
          c.explanation ?? "",
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
