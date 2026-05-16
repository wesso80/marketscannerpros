/**
 * POST /api/admin/macro-outlook
 *
 * MSP macro market outlook memo. Pulls SPY (1 AV call) + 9 macro series
 * from the local macro_series store (populated by FRED ingest cron),
 * then sends the deterministic packet to gpt-4.1 for synthesis.
 *
 * Body (all optional):
 *   { horizon?: '3-month'|'6-month'|'tactical-2-week',
 *     riskTolerance?: 'conservative'|'moderate'|'aggressive',
 *     currentExposures?: string,
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
  buildMacroOutlookSnapshot,
  serializeMacroOutlook,
} from "@/lib/admin/macroOutlook";
import {
  MACRO_MEMO_SYSTEM_PROMPT,
  buildMacroMemoUserPrompt,
  validateMacroMemo,
  deriveMacroEvidenceScore,
} from "@/lib/admin/macroMemo";

export const runtime = "nodejs";
export const maxDuration = 120;

interface RequestBody {
  horizon?: "3-month" | "6-month" | "tactical-2-week";
  riskTolerance?: "conservative" | "moderate" | "aggressive";
  currentExposures?: string;
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

  const horizon = body.horizon ?? "3-month";
  const riskTolerance = body.riskTolerance ?? "moderate";
  const currentExposures = (body.currentExposures || "").slice(0, 800);
  const exposure = body.personalExposureFlag ?? "none";
  const operatorNotes = (body.operatorNotes || "").slice(0, 2000);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 503 });
  }
  const client = new OpenAI({ apiKey });

  // 1. Build macro packet.
  const snapshot = await buildMacroOutlookSnapshot();
  const serialized = serializeMacroOutlook(snapshot);

  // Persist a packet snapshot for ARCA + recall.
  if (admin.workspaceId) {
    const { persistMemoPacket } = await import("@/lib/admin/memoPacketPersister");
    void persistMemoPacket({
      workspaceId: admin.workspaceId,
      scope: "macro",
      scopeKey: "macro-outlook",
      packetType: "macro",
      sources: [{
        source: snapshot.source,
        ok: snapshot.health === "ok",
        missingFields: snapshot.missingFields,
      }],
    });
  }

  // 2. Run AI memo.
  const userPrompt = buildMacroMemoUserPrompt({
    serializedPacket: serialized,
    horizon,
    riskTolerance,
    currentExposures,
    personalExposureFlag: exposure,
    operatorNotes,
  });

  const okSeriesCount = Object.values(snapshot.series).filter((s) => s.status === "ok").length;
  const totalSeries = Object.keys(snapshot.series).length;
  const spyOk = snapshot.spy.status === "ok";
  const evidenceQualityScore = deriveMacroEvidenceScore({
    spyOk,
    okSeriesCount,
    totalSeries,
  });

  let aiResult:
    | { ok: true; memo: ReturnType<typeof validateMacroMemo> }
    | { ok: false; reason: string };
  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: MACRO_MEMO_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || "{}");
    if (parsed && typeof parsed === "object") {
      const r = parsed as Record<string, unknown>;
      if (!r.personalExposureFlag) r.personalExposureFlag = exposure;
      r.evidenceQualityScore = evidenceQualityScore;
    }
    const v = validateMacroMemo(parsed);
    aiResult = v.ok ? { ok: true, memo: v } : { ok: false, reason: v.reason };
  } catch (e) {
    aiResult = { ok: false, reason: e instanceof Error ? e.message : "openai_error" };
  }

  const baseConfidence: "high" | "medium" | "low" =
    snapshot.health === "ok" ? "high" : snapshot.health === "degraded" ? "medium" : "low";
  let confidenceReason = `SPY=${snapshot.spy.status}; ${okSeriesCount}/${totalSeries} macro series OK; missing=${snapshot.missingFields.length}.`;
  if (snapshot.missingFields.length > 0) {
    confidenceReason += " Forward GDP / consumer / IG / put-call / AAII / FearGreed / aggregate EPS / fwd P/E not in packet — flagged.";
  }

  if (!aiResult.ok) {
    return NextResponse.json(
      wrapTruth(
        { memo: null, snapshot, aiError: aiResult.reason },
        {
          source: "alpha-vantage:spy + fred:macro_series + openai:gpt-4.1",
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

  return NextResponse.json(
    wrapTruth(
      { memo: aiResult.memo.ok ? aiResult.memo.memo : null, snapshot },
      {
        source: "alpha-vantage:spy + fred:macro_series + openai:gpt-4.1",
        fetchedAt: new Date().toISOString(),
        freshness: spyOk ? "delayed" : "stale",
        simulated: false,
        missingFields: snapshot.missingFields,
        confidence: baseConfidence,
        confidenceReason,
      },
    ),
  );
}
