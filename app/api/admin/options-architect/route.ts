/**
 * POST /api/admin/options-architect
 *
 * D.E. Shaw-style options strategy memo. Pulls AV TIME_SERIES_DAILY +
 * HISTORICAL_OPTIONS (full chain, EOD T-1) + OVERVIEW (dividend yield)
 * for one ticker, then locally constructs a candidate set of 11 option
 * strategies built from REAL chain contracts (real bid/ask, real IV per
 * contract, real per-contract Greeks, real OI/volume), then sends the
 * packet to gpt-4.1 which selects ONE primary strategy and writes the
 * operator-grade memo.
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
 * Chain data is EOD T-1 — operator must re-validate live bid/ask
 * at the broker before order entry.
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

  // 1. Build options packet (REAL AV HISTORICAL_OPTIONS chain).
  const snapshot = await buildOptionsSnapshot(ticker, directionalView, timeHorizonDays);
  const serialized = serializeOptionsSnapshot(snapshot);

  // Stage 3: persist a packet snapshot for ARCA + recall.
  if (admin.workspaceId) {
    const { persistMemoPacket } = await import("@/lib/admin/memoPacketPersister");
    void persistMemoPacket({
      workspaceId: admin.workspaceId,
      scope: "symbol",
      scopeKey: ticker,
      packetType: "options",
      sources: [{
        source: "alpha-vantage:historical_options+overview+daily",
        ok: snapshot.status === "ok",
        missingFields: snapshot.missingFields ?? [],
      }],
    });
  }

  // If snapshot itself failed, return early with diagnostic envelope.
  if (snapshot.status === "error" || snapshot.candidates.length === 0) {
    return NextResponse.json(
      wrapTruth(
        { memo: null, snapshot, aiError: snapshot.error || "snapshot build failed" },
        {
          source: "alpha-vantage:daily+historical_options+overview",
          fetchedAt: new Date().toISOString(),
          freshness: "stale",
          simulated: false,
          missingFields: snapshot.missingFields,
          confidence: "low",
          confidenceReason: snapshot.error || "no candidate strategies could be built from the chain",
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
          source: "alpha-vantage:daily+historical_options+overview+openai:gpt-4.1",
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

  // Confidence band based on chain depth + selected-expiration OI.
  let confidence: "high" | "medium" | "low" = "medium";
  const avgOI = snapshot.expirationAvgOI ?? 0;
  let confidenceReason = `Chain asOf ${snapshot.chainAsOfDate ?? "n/a"}, ${snapshot.chainContractCount} contracts, selected expiration ${snapshot.selectedExpiration ?? "n/a"} (${snapshot.selectedExpirationDte ?? "?"}d, avg OI ${avgOI}), ATM IV ${snapshot.atmIVPct ?? "n/a"}%, ${snapshot.candidates.length} candidates built.`;
  if (snapshot.chainContractCount >= 500 && avgOI >= 500 && snapshot.atmIVPct != null) {
    confidence = "high";
  } else if (snapshot.chainContractCount < 100 || avgOI < 50) {
    confidence = "low";
    confidenceReason += " Low chain depth / thin OI — fills may be poor.";
  }
  confidenceReason += " Chain is EOD T-1; operator MUST re-validate live bid/ask at the broker before order entry.";

  return NextResponse.json(
    wrapTruth(
      { memo: aiResult.memo.ok ? aiResult.memo.memo : null, snapshot },
      {
        source: "alpha-vantage:daily+historical_options+overview+openai:gpt-4.1",
        fetchedAt: new Date().toISOString(),
        freshness: "delayed",
        simulated: false,
        missingFields: snapshot.missingFields,
        confidence,
        confidenceReason,
      },
    ),
  );
}
