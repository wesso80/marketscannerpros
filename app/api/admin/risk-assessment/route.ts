/**
 * POST /api/admin/risk-assessment
 *
 * MSP portfolio risk memo. One AV TIME_SERIES_DAILY +
 * OVERVIEW per holding plus SPY benchmark, all metrics computed
 * locally, then sent to gpt-4.1 for the narrative memo.
 *
 * Body:
 *   { holdings: [{ ticker, allocationPct, costBasis? }, ...],
 *     totalPortfolioValueUSD?: number,
 *     personalExposureFlag?: 'none'|'low'|'elevated'|'high',
 *     operatorNotes?: string }
 *
 * Boundary: research-only. System never executes orders.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import {
  buildPortfolioRiskSnapshot,
  serializePortfolioRisk,
  type PortfolioHolding,
} from "@/lib/admin/portfolioRisk";
import {
  RISK_MEMO_SYSTEM_PROMPT,
  buildRiskMemoUserPrompt,
  validateRiskMemo,
  deriveRiskEvidenceScore,
} from "@/lib/admin/riskMemo";

export const runtime = "nodejs";
export const maxDuration = 120;

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const MAX_HOLDINGS = 25;

interface RequestBody {
  holdings?: Array<{ ticker?: string; allocationPct?: number; costBasis?: number }>;
  totalPortfolioValueUSD?: number;
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

  const rawHoldings = Array.isArray(body.holdings) ? body.holdings : [];
  if (!rawHoldings.length) {
    return NextResponse.json(
      { error: "no_holdings", detail: "Provide at least one holding." },
      { status: 400 },
    );
  }
  if (rawHoldings.length > MAX_HOLDINGS) {
    return NextResponse.json(
      { error: "too_many_holdings", detail: `Max ${MAX_HOLDINGS} holdings per memo (AV quota).` },
      { status: 400 },
    );
  }

  const holdings: PortfolioHolding[] = [];
  for (const h of rawHoldings) {
    const t = (h.ticker || "").trim().toUpperCase();
    const pct = Number(h.allocationPct);
    if (!TICKER_RE.test(t)) {
      return NextResponse.json(
        { error: "invalid_ticker", detail: `Bad ticker: ${h.ticker}` },
        { status: 400 },
      );
    }
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return NextResponse.json(
        { error: "invalid_allocation", detail: `Bad allocation for ${t}: ${h.allocationPct}` },
        { status: 400 },
      );
    }
    holdings.push({
      ticker: t,
      allocationPct: pct,
      costBasis: Number.isFinite(Number(h.costBasis)) ? Number(h.costBasis) : undefined,
    });
  }

  const exposure = body.personalExposureFlag ?? "none";
  const operatorNotes = (body.operatorNotes || "").slice(0, 1500);
  const totalValue =
    Number.isFinite(Number(body.totalPortfolioValueUSD)) && Number(body.totalPortfolioValueUSD) > 0
      ? Number(body.totalPortfolioValueUSD)
      : null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 503 });
  }
  const client = new OpenAI({ apiKey });

  // 1. Build risk snapshot (parallel AV fetches inside)
  const snapshot = await buildPortfolioRiskSnapshot(holdings);
  const serialized = serializePortfolioRisk(snapshot);

  // Stage 3: persist a packet snapshot so ARCA can be invoked against the exact state.
  if (admin.workspaceId) {
    const { persistMemoPacket } = await import("@/lib/admin/memoPacketPersister");
    void persistMemoPacket({
      workspaceId: admin.workspaceId,
      scope: "portfolio",
      scopeKey: `portfolio-${holdings.length}-positions`,
      packetType: "risk",
      sources: [{
        source: "alpha-vantage:portfolio-risk-snapshot",
        ok: snapshot.missingFields.length === 0,
        missingFields: snapshot.missingFields ?? [],
      }],
    });
  }

  // 2. Run AI memo
  const userPrompt = buildRiskMemoUserPrompt({
    serializedRiskPacket: serialized,
    totalPortfolioValueUSD: totalValue,
    personalExposureFlag: exposure,
    operatorNotes,
  });

  let aiResult:
    | { ok: true; memo: ReturnType<typeof validateRiskMemo> }
    | { ok: false; reason: string };
  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: RISK_MEMO_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || "{}");
    if (parsed && typeof parsed === "object") {
      const r = parsed as Record<string, unknown>;
      if (!r.personalExposureFlag) r.personalExposureFlag = exposure;
      r.evidenceQualityScore = deriveRiskEvidenceScore({
        totalHoldings: snapshot.holdings.length,
        holdingsWithFullData: snapshot.holdings.filter((h) => h.status === "ok").length,
        benchmarkOk: snapshot.benchmark.status === "ok",
        hasCorrelations: snapshot.correlations.length > 0,
      });
    }
    const v = validateRiskMemo(parsed);
    aiResult = v.ok
      ? { ok: true, memo: v }
      : { ok: false, reason: v.reason };
  } catch (e) {
    aiResult = { ok: false, reason: e instanceof Error ? e.message : "openai_error" };
  }

  if (!aiResult.ok) {
    return NextResponse.json(
      wrapTruth(
        {
          memo: null,
          snapshot,
          aiError: aiResult.reason,
        },
        {
          source: "alpha-vantage:daily+overview+openai:gpt-4.1",
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

  const okHoldings = snapshot.holdings.filter((h) => h.status === "ok").length;
  const ratio = snapshot.holdings.length ? okHoldings / snapshot.holdings.length : 0;
  const confidence: "high" | "medium" | "low" =
    ratio >= 0.9 && snapshot.benchmark.status === "ok" ? "high"
      : ratio >= 0.6 ? "medium"
        : "low";

  return NextResponse.json(
    wrapTruth(
      {
        memo: aiResult.memo.ok ? aiResult.memo.memo : null,
        snapshot,
      },
      {
        source: "alpha-vantage:daily+overview+openai:gpt-4.1",
        fetchedAt: new Date().toISOString(),
        freshness: snapshot.benchmark.status === "ok" ? "delayed" : "stale",
        simulated: false,
        missingFields: snapshot.missingFields,
        confidence,
        confidenceReason: `${okHoldings}/${snapshot.holdings.length} holdings with full data; benchmark=${snapshot.benchmark.status}; pairs=${snapshot.correlations.length}`,
      },
    ),
  );
}
