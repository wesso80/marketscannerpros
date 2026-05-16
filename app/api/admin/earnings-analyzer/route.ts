/**
 * POST /api/admin/earnings-analyzer
 *
 * JPMorgan-style earnings preview/recap note. Pulls AV EARNINGS +
 * INCOME_STATEMENT + OVERVIEW + TIME_SERIES_DAILY for one ticker,
 * computes 6Q EPS surprise + price reaction + 8Q reaction stats,
 * then sends the packet to gpt-4.1.
 *
 * Body:
 *   { ticker: string,
 *     framing?: 'pre-earnings'|'post-earnings',
 *     earningsDate?: string (YYYY-MM-DD),
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
  buildEarningsHistorySnapshot,
  serializeEarningsHistory,
} from "@/lib/admin/earningsHistory";
import {
  EARNINGS_NOTE_SYSTEM_PROMPT,
  buildEarningsNoteUserPrompt,
  validateEarningsNote,
  deriveEarningsEvidenceScore,
} from "@/lib/admin/earningsAnalyzer";

export const runtime = "nodejs";
export const maxDuration = 90;

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface RequestBody {
  ticker?: string;
  framing?: "pre-earnings" | "post-earnings";
  earningsDate?: string;
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
  const framing: "pre-earnings" | "post-earnings" =
    body.framing === "post-earnings" ? "post-earnings" : "pre-earnings";
  const earningsDate =
    body.earningsDate && DATE_RE.test(body.earningsDate) ? body.earningsDate : null;
  const exposure = body.personalExposureFlag ?? "none";
  const operatorNotes = (body.operatorNotes || "").slice(0, 1500);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 503 });
  }
  const client = new OpenAI({ apiKey });

  // 1. Build earnings packet.
  const snapshot = await buildEarningsHistorySnapshot(ticker);
  const serialized = serializeEarningsHistory(snapshot);

  // Stage 3: persist a packet snapshot for ARCA grounding + recall.
  if (admin.workspaceId) {
    const { persistMemoPacket } = await import("@/lib/admin/memoPacketPersister");
    void persistMemoPacket({
      workspaceId: admin.workspaceId,
      scope: "symbol",
      scopeKey: ticker,
      packetType: "earnings",
      sources: [{
        source: "alpha-vantage:earnings-history-snapshot",
        ok: snapshot.status === "ok",
        missingFields: snapshot.missingFields ?? [],
      }],
    });
  }

  // 2. Run AI note.
  const userPrompt = buildEarningsNoteUserPrompt({
    serializedPacket: serialized,
    framing,
    earningsDateOperator: earningsDate ?? snapshot.nextEarningsDateAV,
    personalExposureFlag: exposure,
    operatorNotes,
  });

  let aiResult:
    | { ok: true; note: ReturnType<typeof validateEarningsNote> }
    | { ok: false; reason: string };
  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EARNINGS_NOTE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || "{}");
    if (parsed && typeof parsed === "object") {
      const r = parsed as Record<string, unknown>;
      r.ticker = ticker;
      r.framing = framing;
      if (!r.personalExposureFlag) r.personalExposureFlag = exposure;
      if (earningsDate || snapshot.nextEarningsDateAV) {
        r.earningsDate = earningsDate ?? snapshot.nextEarningsDateAV;
      }
      r.evidenceQualityScore = deriveEarningsEvidenceScore({
        earningsRowsCount: snapshot.earningsHistory.length,
        revenueRowsCount: snapshot.revenueHistory.length,
        overviewOk: snapshot.endpointStatus.OVERVIEW === "ok",
        dailyOk: snapshot.endpointStatus.TIME_SERIES_DAILY === "ok",
        reactionSampleSize: snapshot.reactionStats.sampleSize,
      });
    }
    const v = validateEarningsNote(parsed);
    aiResult = v.ok ? { ok: true, note: v } : { ok: false, reason: v.reason };
  } catch (e) {
    aiResult = { ok: false, reason: e instanceof Error ? e.message : "openai_error" };
  }

  if (!aiResult.ok) {
    return NextResponse.json(
      wrapTruth(
        { note: null, snapshot, aiError: aiResult.reason },
        {
          source: "alpha-vantage:earnings+income+overview+daily+openai:gpt-4.1",
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

  // Confidence band based on packet completeness.
  const okEndpoints = Object.values(snapshot.endpointStatus).filter((s) => s === "ok").length;
  const totalEndpoints = Object.values(snapshot.endpointStatus).length || 1;
  const completeness = okEndpoints / totalEndpoints;
  let confidence: "high" | "medium" | "low" = "medium";
  let confidenceReason = `${okEndpoints}/${totalEndpoints} AV endpoints OK; reaction sample ${snapshot.reactionStats.sampleSize}/6.`;
  if (completeness >= 0.9 && snapshot.reactionStats.sampleSize >= 5) {
    confidence = "high";
  } else if (completeness < 0.5 || snapshot.reactionStats.sampleSize < 2) {
    confidence = "low";
    confidenceReason += " Consensus + whisper not in packet — operator must supply if material.";
  }

  return NextResponse.json(
    wrapTruth(
      { note: aiResult.note.ok ? aiResult.note.note : null, snapshot },
      {
        source: "alpha-vantage:earnings+income+overview+daily+openai:gpt-4.1",
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
