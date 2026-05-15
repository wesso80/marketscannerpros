/**
 * POST /api/admin/options-architect
 *
 * D.E. Shaw-style options strategy memo. Pulls AV TIME_SERIES_DAILY +
 * TREASURY_YIELD (3M) + OVERVIEW (for dividend yield) for one ticker,
 * computes HV20/HV60/HV252 (IV proxy), ATR, 52w hi/lo, then locally
 * constructs a candidate set of 10 option strategies with theoretical
 * Black-Scholes pricing + Greeks + max P/L + breakevens + POP, and
 * sends the packet to gpt-4.1 which selects ONE primary strategy and
 * writes the operator-grade memo.
 *
 * Body:
 *   { ticker: string,
 *     directionalView: 'bullish'|'bearish'|'neutral'|'volatile',
 *     timeHorizonDays: number (7..120, default 30),
 *     riskBudgetUSD: number (default 5000),
 *     personalExposureFlag?: 'none'|'low'|'elevated'|'high',
 *     operatorNotes?: string }
 *
 * Boundary: research-only. System never executes orders.
 * Hard-flagged unavailable: real options chain, real IV surface,
 * bid/ask spreads, open interest, options volume.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import {
  buildOptionsSnapshot,
  serializeOptionsSnapshot,
  type Outlook,
} from "@/lib/admin/optionsArchitect";
import {
  OPTIONS_MEMO_SYSTEM_PROMPT,
  buildOptionsMemoUserPrompt,
  validateOptionsMemo,
  deriveOptionsEvidenceScore,
} from "@/lib/admin/optionsMemo";

export const runtime = "nodejs";
export const maxDuration = 90;

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const OUTLOOKS: Outlook[] = ["bullish", "bearish", "neutral", "volatile"];

interface RequestBody {
  ticker?: string;
  directionalView?: Outlook;
  timeHorizonDays?: number;
  riskBudgetUSD?: number;
  personalExposureFlag?: "none" | "low" | "elevated" | "high";
  operatorNotes?: string;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const ticker = (body.ticker || "").trim().toUpperCase();
  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json(
      { error: "invalid_ticker", detail: `Bad ticker: ${body.ticker}` },
      { status: 400 },
    );
  }
  const directionalView: Outlook = OUTLOOKS.includes(body.directionalView as Outlook)
    ? (body.directionalView as Outlook)
    : "neutral";

  const rawHorizon = Number(body.timeHorizonDays);
  const timeHorizonDays = Number.isFinite(rawHorizon)
    ? Math.max(7, Math.min(120, Math.round(rawHorizon)))
    : 30;

  const rawBudget = Number(body.riskBudgetUSD);
  const riskBudgetUSD = Number.isFinite(rawBudget) && rawBudget > 0
    ? Math.min(rawBudget, 1_000_000)
    : 5000;

  const exposure = body.personalExposureFlag ?? "none";
  const operatorNotes = (body.operatorNotes || "").slice(0, 1500);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 503 });
  }
  const client = new OpenAI({ apiKey });

  // 1. Build options packet (BS-priced candidates).
  const snapshot = await buildOptionsSnapshot(ticker, directionalView, timeHorizonDays);
  const serialized = serializeOptionsSnapshot(snapshot);

  // If snapshot itself failed, return early with diagnostic envelope.
  if (snapshot.status === "error" || snapshot.candidates.length === 0) {
    return NextResponse.json(
      wrapTruth(
        { memo: null, snapshot, aiError: snapshot.error || "snapshot build failed" },
        {
          source: "alpha-vantage:daily+treasury+overview",
          fetchedAt: new Date().toISOString(),
          freshness: "stale",
          simulated: false,
          missingFields: snapshot.missingFields,
          confidence: "low",
          confidenceReason: snapshot.error || "no candidate strategies could be priced",
        },
      ),
      { status: 422 },
    );
  }

  // 2. Run AI memo.
  const userPrompt = buildOptionsMemoUserPrompt({
    serializedPacket: serialized,
    directionalView,
    timeHorizonDays,
    riskBudgetUSD,
    personalExposureFlag: exposure,
    operatorNotes,
  });

  let aiResult:
    | { ok: true; memo: ReturnType<typeof validateOptionsMemo> }
    | { ok: false; reason: string };
  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: OPTIONS_MEMO_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || "{}");
    if (parsed && typeof parsed === "object") {
      const r = parsed as Record<string, unknown>;
      r.ticker = ticker;
      r.directionalView = directionalView;
      r.timeHorizonDays = timeHorizonDays;
      r.riskBudgetUSD = riskBudgetUSD;
      if (!r.personalExposureFlag) r.personalExposureFlag = exposure;
      r.evidenceQualityScore = deriveOptionsEvidenceScore(snapshot);
    }
    const v = validateOptionsMemo(parsed);
    aiResult = v.ok ? { ok: true, memo: v } : { ok: false, reason: v.reason };
  } catch (e) {
    aiResult = { ok: false, reason: e instanceof Error ? e.message : "openai_error" };
  }

  if (!aiResult.ok) {
    return NextResponse.json(
      wrapTruth(
        { memo: null, snapshot, aiError: aiResult.reason },
        {
          source: "alpha-vantage:daily+treasury+overview+openai:gpt-4.1",
          fetchedAt: new Date().toISOString(),
          freshness: "stale",
          simulated: false,
          missingFields: snapshot.missingFields,
          confidence: "low",
          confidenceReason: `AI validation failed: ${aiResult.reason}`,
        },
      ),
      { status: 422 },
    );
  }

  // Confidence band.
  let confidence: "high" | "medium" | "low" = "medium";
  let confidenceReason = `HV20=${snapshot.hv20Pct}% used as IV proxy, ${snapshot.candidates.length} candidates priced, risk-free=${snapshot.riskFreeSource}.`;
  if (snapshot.hv20Pct != null && snapshot.hv60Pct != null && snapshot.riskFreeSource === "treasury-3m") {
    confidence = "high";
  } else if (snapshot.hv20Pct == null) {
    confidence = "low";
    confidenceReason = "HV20 unavailable — cannot price options.";
  }
  confidenceReason += " Real options chain, IV surface, bid/ask, and OI are NOT in source data — operator must validate at broker.";

  return NextResponse.json(
    wrapTruth(
      { memo: aiResult.memo.ok ? aiResult.memo.memo : null, snapshot },
      {
        source: "alpha-vantage:daily+treasury+overview+openai:gpt-4.1",
        fetchedAt: new Date().toISOString(),
        freshness: snapshot.status === "ok" ? "delayed" : "stale",
        simulated: false,
        missingFields: snapshot.missingFields,
        confidence,
        confidenceReason,
      },
    ),
  );
}
