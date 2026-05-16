/**
 * POST /api/admin/equity-research
 *
 * Body: { ticker: string, operatorNotes?: string, personalExposureFlag?: 'none'|'low'|'elevated'|'high' }
 *
 * Pipeline:
 *   1. Fetch Alpha Vantage fundamentals bundle (4 endpoints).
 *   2. Build the GS-style system + user prompt.
 *   3. Call OpenAI gpt-4.1 with strict JSON response_format.
 *   4. Validate against EquityResearchNote schema + forbidden-phrase scan.
 *   5. Return TruthEnvelope-wrapped result with derived freshness/confidence.
 *
 * Boundary: research-only. No order, no size, no execution language.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import {
  fetchFundamentalsBundle,
  serializeFundamentalsForPrompt,
  deriveBundleTruth,
} from "@/lib/admin/fundamentals";
import { buildAndPersistEquityResearchPacket } from "@/lib/admin/equityResearchPacket";
import {
  EQUITY_RESEARCH_SYSTEM_PROMPT,
  buildEquityResearchUserPrompt,
  validateEquityResearchNote,
  deriveEvidenceQualityScore,
} from "@/lib/admin/equityResearchNote";

export const runtime = "nodejs";
export const maxDuration = 60;

interface RequestBody {
  ticker?: string;
  operatorNotes?: string;
  personalExposureFlag?: "none" | "low" | "elevated" | "high";
}

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;

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
      { error: "invalid_ticker", detail: "Use 1-10 chars: A-Z 0-9 . -" },
      { status: 400 },
    );
  }
  const exposure = body.personalExposureFlag ?? "none";
  const operatorNotes = (body.operatorNotes || "").slice(0, 1000);

  // 1. Fetch fundamentals — if we have a workspaceId, also persist a packet
  //    snapshot so the Daily Operator Packet / ARCA can cite the exact JSON
  //    the model saw. Falls back to a plain fetch when no workspace context.
  const bundle = admin.workspaceId
    ? (await buildAndPersistEquityResearchPacket(admin.workspaceId, ticker)).bundle
    : await fetchFundamentalsBundle(ticker);
  const bundleTruth = deriveBundleTruth(bundle);

  // 2. Build prompt
  const userPrompt = buildEquityResearchUserPrompt({
    ticker,
    fundamentalsSerialized: serializeFundamentalsForPrompt(bundle),
    operatorNotes,
    personalExposureFlag: exposure,
  });

  // 3. Call OpenAI (or fallback if no key)
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      wrapTruth(
        {
          error: "openai_unavailable",
          fundamentals: bundle,
        },
        {
          source: "alpha-vantage:fundamentals",
          fetchedAt: bundle.fetchedAt,
          freshness: bundleTruth.freshness,
          simulated: false,
          missingFields: bundle.missingFields,
          confidence: "low",
          confidenceReason:
            "OPENAI_API_KEY missing — fundamentals returned without analysis.",
        },
      ),
      { status: 503 },
    );
  }

  let parsed: unknown;
  try {
    const client = new OpenAI({ apiKey });
    const resp = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EQUITY_RESEARCH_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const content = resp.choices?.[0]?.message?.content || "{}";
    parsed = JSON.parse(content);
  } catch (err) {
    return NextResponse.json(
      {
        error: "openai_error",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 502 },
    );
  }

  // Force-correct identity fields before validation.
  if (parsed && typeof parsed === "object") {
    const r = parsed as Record<string, unknown>;
    r.ticker = ticker;
    r.classification = "ADMIN_RESEARCH_NOTE_NOT_BROKER_EXECUTION";
    if (!r.personalExposureFlag) r.personalExposureFlag = exposure;
    // Override evidence score with our derived one (model can't see endpoint statuses reliably).
    r.evidenceQualityScore = deriveEvidenceQualityScore(bundle);
  }

  const validation = validateEquityResearchNote(parsed);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "validation_failed",
        detail: validation.reason,
        rawFundamentals: bundle,
      },
      { status: 422 },
    );
  }

  return NextResponse.json(
    wrapTruth(
      {
        note: validation.note,
        fundamentals: {
          endpointStatus: bundle.endpointStatus,
          missingFields: bundle.missingFields,
          errors: bundle.errors,
        },
      },
      {
        source: "alpha-vantage:fundamentals+openai:gpt-4.1",
        fetchedAt: bundle.fetchedAt,
        freshness: bundleTruth.freshness,
        simulated: false,
        missingFields: bundle.missingFields,
        confidence: bundleTruth.confidence,
        confidenceReason: bundleTruth.confidenceReason,
      },
    ),
  );
}
