import { NextRequest, NextResponse } from "next/server";
import { getSessionFromCookie } from "@/lib/auth";
import OpenAI from "openai";
import { q } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds for generation

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

function getScoreBias(score: number): { bias: string; stance: string } {
  if (score >= 80) return { bias: "Bullish", stance: "Bullish Continuation" };
  if (score >= 70) return { bias: "Bullish-Leaning", stance: "Constructive – Favor Longs" };
  if (score >= 55) return { bias: "Neutral", stance: "Range Rotation – Wait for Clarity" };
  if (score >= 40) return { bias: "Bearish-Leaning", stance: "Cautious – Reduce Exposure" };
  return { bias: "Bearish", stance: "Risk-Off – Defensive Positioning" };
}

function buildMSPPrompt(c: Candidate): string {
  const { bias, stance } = getScoreBias(c.score);
  const payload = c.scannerPayload || {};
  const biasWord = c.score >= 70 ? "bullish" : c.score < 40 ? "bearish" : "neutral";
  
  return `
MSP AI Analyst v2.1 — Concise Market Analysis

ASSET: ${c.symbol} (${c.assetClass}) | Score: ${c.score} | Phase: ${payload.phase || "N/A"} | Structure: ${payload.structure || "N/A"}
Support: ${c.keyLevels?.support ?? "N/A"} | Resistance: ${c.keyLevels?.resistance ?? "N/A"}

BIAS LOCK: Score ${c.score} = ${bias.toUpperCase()}. Do NOT contradict this.

OUTPUT (exactly this format, ~80 words max):

**Trade Stance:** ${stance}

**Summary:** [1 sentence stating the ${biasWord} bias and primary driver.]

**Context:** [1-2 sentences on WHY momentum/structure supports this view. No indicator lists.]

**Key Levels:**
- Support: ${c.keyLevels?.support ?? "N/A"} – break invalidates ${biasWord} thesis
- Resistance: ${c.keyLevels?.resistance ?? "N/A"} – clear to accelerate move

**Risk:** [1 sentence: entry guidance + "A break below/above X invalidates the ${biasWord} thesis."]

RULES: No buy/sell advice. No filler. Sound like a desk note, not a tutorial.
`.trim();
}

async function generateExplanation(c: Candidate): Promise<string> {
  const client = getOpenAIClient();
  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are MSP AI Analyst, a senior market structure analyst at an institutional trading desk. You write concise, internally consistent analysis. You never contradict your own data." },
        { role: "user", content: buildMSPPrompt(c) }
      ],
      max_tokens: 350,
      temperature: 0.5,
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

    // Fetch candidates - always use production URL to avoid deployment URL issues
    const baseUrl = "https://www.marketscannerpros.app";

    console.log("[generate] Fetching candidates from:", baseUrl);
    
    // Fetch each asset class separately to handle failures individually
    const fetchCandidatesForClass = async (assetClass: string) => {
      try {
        console.log(`[generate] Fetching ${assetClass} candidates...`);
        const res = await fetch(`${baseUrl}/api/market-focus/candidates?assetClass=${assetClass}&_t=${Date.now()}`, { 
          cache: "no-store",
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.error(`[generate] ${assetClass} candidates error:`, res.status, errText);
          return [];
        }
        const data = await res.json();
        console.log(`[generate] ${assetClass} got ${data.candidates?.length || 0} candidates`);
        return data.candidates || [];
      } catch (err: any) {
        console.error(`[generate] ${assetClass} fetch failed:`, err?.message);
        return [];
      }
    };

    // Fetch sequentially to avoid rate limit conflicts between asset classes
    // Each endpoint has internal batching, but running all 3 in parallel causes issues
    const equityCandidates = await fetchCandidatesForClass("equity");
    const cryptoCandidates = await fetchCandidatesForClass("crypto");
    const commodityCandidates = await fetchCandidatesForClass("commodity");

    console.log("[generate] Candidates fetched:", {
      equity: equityCandidates.length,
      crypto: cryptoCandidates.length,
      commodity: commodityCandidates.length,
    });

    // Pick top from each asset class
    const pickTop = (arr: Candidate[]) => arr.sort((a, b) => b.score - a.score)[0];

    const equityPick = equityCandidates.length > 0 ? pickTop(equityCandidates) : null;
    const cryptoPick = cryptoCandidates.length > 0 ? pickTop(cryptoCandidates) : null;
    const commodityPick = commodityCandidates.length > 0 ? pickTop(commodityCandidates) : null;
    
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
