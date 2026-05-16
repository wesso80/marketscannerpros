/**
 * POST /api/admin/quant-screener
 *
 * Renaissance-style multi-factor quant screen. Pulls OVERVIEW + DAILY for
 * each ticker in the supplied universe (capped at 30) plus SPY benchmark
 * — quota footprint = 2 × n + 1 AV calls. Computes value/quality/momentum/
 * growth factor scores locally, then sends to gpt-4.1 for ranking + memo.
 *
 * Body (all optional):
 *   { universe?: string[],
 *     preferredSectors?: string,
 *     marketCapRange?: string,
 *     emphasisFactors?: string,
 *     excludeFactors?: string,
 *     personalExposureFlag?: 'none'|'low'|'elevated'|'high',
 *     operatorNotes?: string }
 *
 * If universe is omitted or empty, falls back to DEFAULT_UNIVERSE (25 names).
 *
 * Boundary: research-only. System never executes orders.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import {
  buildQuantScreenSnapshot,
  serializeQuantScreen,
} from "@/lib/admin/quantScreener";
import {
  QUANT_MEMO_SYSTEM_PROMPT,
  buildQuantMemoUserPrompt,
  validateQuantMemo,
  deriveQuantEvidenceScore,
  DEFAULT_UNIVERSE,
} from "@/lib/admin/quantMemo";

export const runtime = "nodejs";
export const maxDuration = 300;

interface RequestBody {
  universe?: string[];
  preferredSectors?: string;
  marketCapRange?: string;
  emphasisFactors?: string;
  excludeFactors?: string;
  personalExposureFlag?: "none" | "low" | "elevated" | "high";
  operatorNotes?: string;
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    // empty body OK
  }

  const supplied = Array.isArray(body.universe)
    ? body.universe.filter((t) => typeof t === "string")
    : [];
  const universe = supplied.length > 0 ? supplied : DEFAULT_UNIVERSE;

  const preferredSectors = (body.preferredSectors || "").slice(0, 300);
  const marketCapRange = (body.marketCapRange || "").slice(0, 200);
  const emphasisFactors = (body.emphasisFactors || "").slice(0, 300);
  const excludeFactors = (body.excludeFactors || "").slice(0, 300);
  const exposure = body.personalExposureFlag ?? "none";
  const operatorNotes = (body.operatorNotes || "").slice(0, 1500);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 503 });
  }
  const client = new OpenAI({ apiKey });

  // 1. Build screen packet (parallel AV pulls, capped at 30 names).
  const snapshot = await buildQuantScreenSnapshot(universe);
  const serialized = serializeQuantScreen(snapshot);

  // Stage 3: persist a packet snapshot for ARCA + recall.
  if (admin.workspaceId) {
    const { persistMemoPacket } = await import("@/lib/admin/memoPacketPersister");
    void persistMemoPacket({
      workspaceId: admin.workspaceId,
      scope: "multi",
      scopeKey: `universe-${universe.length}-symbols`,
      packetType: "quant",
      sources: [{
        source: "alpha-vantage:quant-screen-snapshot",
        ok: snapshot.missingFields.length === 0,
        missingFields: snapshot.missingFields ?? [],
      }],
    });
  }

  // 2. AI memo.
  const userPrompt = buildQuantMemoUserPrompt({
    serializedPacket: serialized,
    preferredSectors,
    marketCapRange,
    emphasisFactors,
    excludeFactors,
    personalExposureFlag: exposure,
    operatorNotes,
  });

  let aiResult:
    | { ok: true; memo: ReturnType<typeof validateQuantMemo> }
    | { ok: false; reason: string };
  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: QUANT_MEMO_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || "{}");
    if (parsed && typeof parsed === "object") {
      const r = parsed as Record<string, unknown>;
      if (!r.personalExposureFlag) r.personalExposureFlag = exposure;
      r.evidenceQualityScore = deriveQuantEvidenceScore(snapshot);
    }
    const v = validateQuantMemo(parsed);
    aiResult = v.ok ? { ok: true, memo: v } : { ok: false, reason: v.reason };
  } catch (e) {
    aiResult = { ok: false, reason: e instanceof Error ? e.message : "openai_error" };
  }

  const okCount = snapshot.universeStats.okCount;
  const totalUniverse = snapshot.universe.length;

  if (!aiResult.ok) {
    return NextResponse.json(
      wrapTruth(
        { memo: null, snapshot, aiError: aiResult.reason },
        {
          source: "alpha-vantage:overview+daily+openai:gpt-4.1",
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

  // Confidence based on data quality + universe size.
  let confidence: "high" | "medium" | "low" = "medium";
  let confidenceReason = `${okCount}/${totalUniverse} tickers OK; SPY=${snapshot.benchmark.status}.`;
  if (okCount >= 15 && snapshot.benchmark.status === "ok" && okCount / totalUniverse >= 0.8) {
    confidence = "high";
  } else if (okCount < 8 || snapshot.benchmark.status !== "ok") {
    confidence = "low";
    confidenceReason += " Sentiment factor inputs (insider/13F/short-interest/revisions) are NOT in packet — operator must supply if material.";
  }

  return NextResponse.json(
    wrapTruth(
      { memo: aiResult.memo.ok ? aiResult.memo.memo : null, snapshot },
      {
        source: "alpha-vantage:overview+daily+openai:gpt-4.1",
        fetchedAt: new Date().toISOString(),
        freshness: snapshot.benchmark.status === "ok" ? "delayed" : "stale",
        simulated: false,
        missingFields: snapshot.missingFields,
        confidence,
        confidenceReason,
      },
    ),
  );
}
