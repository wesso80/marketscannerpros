/**
 * POST /api/admin/sector-rotation
 *
 * Citadel-style sector rotation memo. Pulls SPY + 11 SPDR sector ETFs
 * + 10Y treasury + Fed funds (14 AV calls), computes RS / momentum /
 * breadth locally, then sends the packet to gpt-4.1.
 *
 * Body (all optional except riskTolerance default):
 *   { riskTolerance?: 'conservative'|'moderate'|'aggressive',
 *     timeHorizon?: string,
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
  buildSectorRotationSnapshot,
  serializeSectorRotation,
} from "@/lib/admin/sectorRotation";
import {
  SECTOR_MEMO_SYSTEM_PROMPT,
  buildSectorMemoUserPrompt,
  validateSectorMemo,
  deriveSectorEvidenceScore,
} from "@/lib/admin/sectorMemo";

export const runtime = "nodejs";
export const maxDuration = 120;

interface RequestBody {
  riskTolerance?: "conservative" | "moderate" | "aggressive";
  timeHorizon?: string;
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

  const riskTolerance = body.riskTolerance ?? "moderate";
  const timeHorizon = (body.timeHorizon || "").slice(0, 200);
  const currentExposures = (body.currentExposures || "").slice(0, 800);
  const exposure = body.personalExposureFlag ?? "none";
  const operatorNotes = (body.operatorNotes || "").slice(0, 1500);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 503 });
  }
  const client = new OpenAI({ apiKey });

  // 1. Build sector packet.
  const snapshot = await buildSectorRotationSnapshot();
  const serialized = serializeSectorRotation(snapshot);

  // Stage 3: persist a packet snapshot for ARCA + recall.
  if (admin.workspaceId) {
    const { persistMemoPacket } = await import("@/lib/admin/memoPacketPersister");
    void persistMemoPacket({
      workspaceId: admin.workspaceId,
      scope: "sector",
      scopeKey: "all-sectors",
      packetType: "sector",
      sources: [{
        source: "alpha-vantage:sector-rotation-snapshot",
        ok: snapshot.missingFields.length === 0,
        missingFields: snapshot.missingFields ?? [],
      }],
    });
  }

  // 2. Run AI memo.
  const userPrompt = buildSectorMemoUserPrompt({
    serializedPacket: serialized,
    riskTolerance,
    timeHorizon,
    currentExposures,
    personalExposureFlag: exposure,
    operatorNotes,
  });

  let aiResult:
    | { ok: true; memo: ReturnType<typeof validateSectorMemo> }
    | { ok: false; reason: string };
  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SECTOR_MEMO_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || "{}");
    if (parsed && typeof parsed === "object") {
      const r = parsed as Record<string, unknown>;
      if (!r.personalExposureFlag) r.personalExposureFlag = exposure;
      const sectorsOk = snapshot.sectors.filter((s) => s.status === "ok").length;
      r.evidenceQualityScore = deriveSectorEvidenceScore({
        sectorsOk,
        benchmarkOk: snapshot.benchmark.status === "ok",
        treasuryOk: snapshot.macro.treasury10y.status === "ok",
        fedFundsOk: snapshot.macro.fedFunds.status === "ok",
      });
    }
    const v = validateSectorMemo(parsed);
    aiResult = v.ok ? { ok: true, memo: v } : { ok: false, reason: v.reason };
  } catch (e) {
    aiResult = { ok: false, reason: e instanceof Error ? e.message : "openai_error" };
  }

  if (!aiResult.ok) {
    return NextResponse.json(
      wrapTruth(
        { memo: null, snapshot, aiError: aiResult.reason },
        {
          source: "alpha-vantage:daily+treasury+fedfunds+openai:gpt-4.1",
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

  const sectorsOk = snapshot.sectors.filter((s) => s.status === "ok").length;
  let confidence: "high" | "medium" | "low" = "medium";
  let confidenceReason = `${sectorsOk}/11 sectors OK; treasury=${snapshot.macro.treasury10y.status}; fed=${snapshot.macro.fedFunds.status}.`;
  if (sectorsOk >= 10 && snapshot.benchmark.status === "ok") {
    confidence = snapshot.macro.treasury10y.status === "ok" || snapshot.macro.fedFunds.status === "ok"
      ? "high" : "medium";
  } else if (sectorsOk < 6) {
    confidence = "low";
    confidenceReason += " Forward sector growth + sector P/E + fund flows not in packet — operator must supply if material.";
  }

  return NextResponse.json(
    wrapTruth(
      { memo: aiResult.memo.ok ? aiResult.memo.memo : null, snapshot },
      {
        source: "alpha-vantage:daily+treasury+fedfunds+openai:gpt-4.1",
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
