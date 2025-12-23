import { NextResponse } from "next/server";
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

async function fetchCandidates(assetClass: Candidate["assetClass"]): Promise<Candidate[]> {
  // Use local API endpoint instead of external SCANNER_BASE_URL
  const baseUrl = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}` 
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  
  const url = `${baseUrl}/api/market-focus/candidates?assetClass=${assetClass}`;

  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Candidates API error (${assetClass}) ${res.status}: ${txt}`);
  }

  const data = await res.json();
  return (data.candidates ?? []) as Candidate[];
}

function buildMSPPrompt(c: Candidate): string {
  return `
You are MSP AI Analyst v1.1 for MarketScanner Pros.

Task:
Generate a concise institutional-style explanation for today's DAILY AI MARKET FOCUS pick.

Asset:
- Asset class: ${c.assetClass}
- Symbol: ${c.symbol}
- Name: ${c.name ?? "N/A"}
- Venue: ${c.venue ?? "N/A"}
- Score: ${c.score}

Scanner outputs (raw):
${JSON.stringify(c.scannerPayload, null, 2)}

Key Levels:
${JSON.stringify(c.keyLevels, null, 2)}

Identified Risks:
${JSON.stringify(c.risks, null, 2)}

Rules:
- Do NOT give buy/sell instructions.
- Do NOT predict exact prices.
- Use MSP language: Bullish Phase / Bearish Phase / Consolidation Phase (Orange), Multi-TF Alignment, Liquidity Zone, Breakout Confirmation, Trend Continuation vs Exhaustion.
- Keep response under 200 words.
- Output format (exact headings):
Executive Summary:
Core Analysis:
Key Levels / Liquidity: 
Risks / Invalidation:
Next Steps (How to use on MSP):
`.trim();
}

async function generateExplanation(c: Candidate): Promise<string> {
  const input = buildMSPPrompt(c);
  const client = getOpenAIClient();

  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are MSP AI Analyst, a professional market structure analyst for MarketScanner Pros." },
        { role: "user", content: input }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    return resp.choices[0]?.message?.content ?? "";
  } catch (err: any) {
    console.error("[generate-market-focus] OpenAI error:", err?.message);
    return `Analysis unavailable: ${err?.message || "OpenAI error"}`;
  }
}

// Accept both GET (for cron-job.org) and POST
export async function GET(req: Request) {
  return runMarketFocusJob(req);
}

export async function POST(req: Request) {
  return runMarketFocusJob(req);
}

async function runMarketFocusJob(req: Request) {
  // Optional secret check - only enforced if CRON_SECRET is set
  const secret = req.headers.get("x-cron-secret");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateKey = todayKeyUTC();

  const existing = await q<{ id: string; status: string }>(
    `select id, status from daily_market_focus where date_key = $1 limit 1`,
    [dateKey]
  );

  let focusId = existing[0]?.id;

  if (!focusId) {
    const created = await q<{ id: string }>(
      `insert into daily_market_focus (focus_date, date_key, status) values ($1, $1, 'pending') returning id`,
      [dateKey]
    );
    focusId = created[0].id;
  } else {
    if (existing[0].status === "ready") {
      return NextResponse.json({ status: "already_ready", date: dateKey });
    }
    await q(`delete from daily_market_focus_items where focus_id = $1`, [focusId]);
  }

  try {
    const [eq, cr, co] = await Promise.all([
      fetchCandidates("equity").catch(e => { console.error("Equity fetch failed:", e); return []; }),
      fetchCandidates("crypto").catch(e => { console.error("Crypto fetch failed:", e); return []; }),
      fetchCandidates("commodity").catch(e => { console.error("Commodity fetch failed:", e); return []; }),
    ]);

    console.log(`[generate-market-focus] Got candidates: equity=${eq.length} crypto=${cr.length} commodity=${co.length}`);

    const pickTop = (arr: Candidate[]) => arr.sort((a, b) => b.score - a.score)[0];
    
    // Build picks array, skipping any empty asset classes
    const picks: Candidate[] = [];
    if (eq.length > 0) picks.push(pickTop(eq));
    if (cr.length > 0) picks.push(pickTop(cr));
    if (co.length > 0) picks.push(pickTop(co));

    if (picks.length === 0) {
      throw new Error(`No candidates at all. equity=${eq.length} crypto=${cr.length} commodity=${co.length}`);
    }
    
    // Log what we're picking
    console.log(`[generate-market-focus] Top picks: ${picks.map(p => `${p.assetClass}:${p.symbol}(${p.score})`).join(", ")}`);

    const explained = await Promise.all(
      picks.map(async (c) => ({ ...c, explanation: await generateExplanation(c) }))
    );

    for (const c of explained) {
      await q(
        `insert into daily_market_focus_items
          (focus_id, asset_class, symbol, name, venue, score, scanner_payload, explanation, key_levels, risks)
         values
          ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10::jsonb)`,
        [
          focusId,
          c.assetClass,
          c.symbol,
          c.name ?? null,
          c.venue ?? null,
          c.score ?? null,
          JSON.stringify(c.scannerPayload ?? {}),
          c.explanation ?? "",
          JSON.stringify(c.keyLevels ??  {}),
          JSON.stringify(c.risks ?? {}),
        ]
      );
    }

    await q(`update daily_market_focus set status='ready', updated_at=now() where id=$1`, [focusId]);

    return NextResponse.json({ status: "ready", date: dateKey, picks: explained.map(p => ({ assetClass: p.assetClass, symbol: p.symbol, score: p.score })) });
  } catch (err: any) {
    await q(
      `update daily_market_focus set status='failed', notes=$2, updated_at=now() where id=$1`,
      [focusId, String(err?.message ?? err)]
    );
    return NextResponse.json({ status: "failed", error: String(err?.message ?? err) }, { status: 500 });
  }
}
