import { NextResponse } from "next/server";
import OpenAI from "openai";
import { q } from "@/lib/db";

export const runtime = "nodejs";

// Helper function to create OpenAI client at runtime
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
  const base = process.env.SCANNER_BASE_URL!;
  const url = `${base}/api/market-focus/candidates?assetClass=${assetClass}`;

  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(process.env.SCANNER_API_KEY ? { "x-api-key": process.env.SCANNER_API_KEY } : {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Scanner service error (${assetClass}) ${res.status}: ${txt}`);
  }

  const data = await res.json();
  // Expect data.candidates: Candidate[]
  return (data.candidates ?? []) as Candidate[];
}

function buildMSPPrompt(c: Candidate): string {
  // No financial advice; provide context + scenarios only.
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

Rules:
- Do NOT give buy/sell instructions.
- Do NOT predict exact prices.
- Use MSP language: Bullish Phase / Bearish Phase / Consolidation Phase (Orange), Multi-TF Alignment, Liquidity Zone, Breakout Confirmation, Trend Continuation vs Exhaustion.
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
  
  // Initialize client at runtime
  const client = getOpenAIClient();

  const resp = await client.responses.create({
    // Use whatever model you have provisioned; Responses API is the recommended API.
    // See OpenAI docs for Responses API. :contentReference[oaicite:1]{index=1}
    model: "gpt-5",
    input,
  });

  // output_text is provided by the SDK for plain-text responses.
  return resp.output_text ?? "";
}

export async function POST(req: Request) {
  // Secure this endpoint (cron/admin only)
  const secret = req.headers.get("x-cron-secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dateKey = todayKeyUTC();

  // Upsert focus header
  const existing = await q<{ id: string; status: string }>(
    `select id, status from daily_market_focus where date_key = $1 limit 1`,
    [dateKey]
  );

  let focusId = existing[0]?.id;

  if (!focusId) {
    const created = await q<{ id: string }>(
      `insert into daily_market_focus (date_key, status) values ($1, 'pending') returning id`,
      [dateKey]
    );
    focusId = created[0].id;
  } else {
    // If already ready, you can either skip or regenerate (your choice).
    if (existing[0].status === "ready") {
      return NextResponse.json({ status: "already_ready", date: dateKey });
    }
    // Clear any previous items if re-running
    await q(`delete from daily_market_focus_items where focus_id = $1`, [focusId]);
  }

  try {
    // 1) Pull candidates per asset class from Python service
    const [eq, cr, co] = await Promise.all([
      fetchCandidates("equity"),
      fetchCandidates("crypto"),
      fetchCandidates("commodity"),
    ]);

    const pickTop = (arr: Candidate[]) => arr.sort((a, b) => b.score - a.score)[0];

    const picks = [pickTop(eq), pickTop(cr), pickTop(co)].filter(Boolean) as Candidate[];

    if (picks.length !== 3) {
      throw new Error(`Not enough candidates. equity=${eq.length} crypto=${cr.length} commodity=${co.length}`);
    }

    // 2) Generate explanations via OpenAI (server-side)
    const explained = await Promise.all(
      picks.map(async (c) => ({ ...c, explanation: await generateExplanation(c) }))
    );

    // 3) Store items
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
          JSON.stringify(c.keyLevels ?? {}),
          JSON.stringify(c.risks ?? {}),
        ]
      );
    }

    // 4) Mark ready
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
