/**
 * POST /api/admin/daily-brief
 *
 * Combined Goldman-style fundamental + Morgan Stanley-style technical
 * brief for a single ticker. Runs both data fetches in parallel,
 * sends each to gpt-4.1 with strict schemas, returns one envelope.
 *
 * Body:
 *   { ticker: string,
 *     position?: 'long'|'short'|'watching',
 *     personalExposureFlag?: 'none'|'low'|'elevated'|'high',
 *     operatorNotes?: string,
 *     skipFundamentals?: boolean,
 *     skipTechnical?: boolean }
 *
 * Boundary: research-only. No order, no execution language. Levels are
 * analytical references, not instructions.
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
import {
  EQUITY_RESEARCH_SYSTEM_PROMPT,
  buildEquityResearchUserPrompt,
  validateEquityResearchNote,
  deriveEvidenceQualityScore,
  type EquityResearchNote,
} from "@/lib/admin/equityResearchNote";
import {
  fetchDailyOhlcv,
  buildTechnicalSnapshot,
  serializeTechnicalSnapshot,
} from "@/lib/admin/priceSeries";
import {
  TECHNICAL_NOTE_SYSTEM_PROMPT,
  buildTechnicalUserPrompt,
  validateTechnicalNote,
  deriveTechnicalEvidenceScore,
  type TechnicalNote,
} from "@/lib/admin/technicalNote";

export const runtime = "nodejs";
export const maxDuration = 90;

interface RequestBody {
  ticker?: string;
  position?: "long" | "short" | "watching";
  personalExposureFlag?: "none" | "low" | "elevated" | "high";
  operatorNotes?: string;
  skipFundamentals?: boolean;
  skipTechnical?: boolean;
}

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const TOTAL_TECHNICAL_INDICATORS = 8; // sma, rsi, macd, bbands, volume, swing, fib, atr

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

  const position = body.position ?? "watching";
  const exposure = body.personalExposureFlag ?? "none";
  const operatorNotes = (body.operatorNotes || "").slice(0, 1000);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 503 });
  }
  const client = new OpenAI({ apiKey });

  // 1. Parallel data fetch
  const [bundle, ohlcv] = await Promise.all([
    body.skipFundamentals ? null : fetchFundamentalsBundle(ticker),
    body.skipTechnical ? null : fetchDailyOhlcv(ticker),
  ]);

  // Stage 3: persist a daily-brief packet snapshot for ARCA + recall.
  if (admin.workspaceId) {
    const { persistMemoPacket } = await import("@/lib/admin/memoPacketPersister");
    void persistMemoPacket({
      workspaceId: admin.workspaceId,
      scope: "symbol",
      scopeKey: ticker,
      packetType: "daily-brief",
      sources: [
        { source: "alpha-vantage:fundamentals-bundle", ok: !!bundle && bundle.missingFields.length < 4 },
        { source: "alpha-vantage:daily-ohlcv", ok: !!ohlcv && ohlcv.status === "ok" },
      ],
    });
  }

  // 2. Build snapshots + prompts
  const fundamentalsTruth = bundle ? deriveBundleTruth(bundle) : null;
  const techSnapshot = ohlcv
    ? buildTechnicalSnapshot(ticker, ohlcv.bars, ohlcv.status, ohlcv.error)
    : null;

  // 3. Run AI calls in parallel
  type AiResult<T> =
    | { ok: true; note: T }
    | { ok: false; reason: string };

  const fundamentalsTask: Promise<AiResult<EquityResearchNote> | null> = bundle
    ? runFundamentalsAI(client, {
        ticker,
        bundle,
        operatorNotes,
        exposure,
      })
    : Promise.resolve(null);

  const technicalTask: Promise<AiResult<TechnicalNote> | null> = techSnapshot
    ? runTechnicalAI(client, {
        ticker,
        position,
        snapshot: techSnapshot,
        operatorNotes,
        exposure,
      })
    : Promise.resolve(null);

  const [fundamentalsResult, technicalResult] = await Promise.all([
    fundamentalsTask,
    technicalTask,
  ]);

  // 4. Compose envelope
  const errors: string[] = [];
  if (fundamentalsResult && !fundamentalsResult.ok)
    errors.push(`fundamentals: ${fundamentalsResult.reason}`);
  if (technicalResult && !technicalResult.ok)
    errors.push(`technical: ${technicalResult.reason}`);

  const fundamentalsNote =
    fundamentalsResult && fundamentalsResult.ok ? fundamentalsResult.note : null;
  const technicalNote =
    technicalResult && technicalResult.ok ? technicalResult.note : null;

  // Worst-of confidence + freshness
  const confidences = [
    fundamentalsTruth?.confidence,
    techSnapshot?.status === "ok" ? "medium" : "low",
  ].filter(Boolean) as Array<"high" | "medium" | "low">;
  const worstConfidence: "high" | "medium" | "low" = confidences.includes("low")
    ? "low"
    : confidences.includes("medium")
      ? "medium"
      : "high";

  return NextResponse.json(
    wrapTruth(
      {
        ticker,
        position,
        fundamentalsNote,
        technicalNote,
        synthesis: composeSynthesis(fundamentalsNote, technicalNote),
        diagnostics: {
          fundamentals: bundle
            ? {
                endpointStatus: bundle.endpointStatus,
                missingFields: bundle.missingFields,
                errors: bundle.errors,
              }
            : null,
          technical: techSnapshot
            ? {
                status: techSnapshot.status,
                error: techSnapshot.error,
                missingFields: techSnapshot.missingFields,
                lastBarDate: techSnapshot.lastBar?.date ?? null,
              }
            : null,
          aiErrors: errors,
        },
      },
      {
        source: "alpha-vantage:fundamentals+daily+openai:gpt-4.1",
        fetchedAt: new Date().toISOString(),
        freshness: techSnapshot?.status === "ok" ? "delayed" : "stale",
        simulated: false,
        missingFields: [
          ...(bundle?.missingFields ?? []),
          ...(techSnapshot?.missingFields ?? []),
        ],
        confidence: worstConfidence,
        confidenceReason:
          (fundamentalsTruth?.confidenceReason ?? "no fundamentals") +
          " | " +
          (techSnapshot?.status === "ok"
            ? "technical snapshot OK"
            : `technical status=${techSnapshot?.status ?? "skipped"}`),
      },
    ),
  );
}

/* ───────────── Sub-tasks ───────────── */

async function runFundamentalsAI(
  client: OpenAI,
  args: {
    ticker: string;
    bundle: Awaited<ReturnType<typeof fetchFundamentalsBundle>>;
    operatorNotes: string;
    exposure: "none" | "low" | "elevated" | "high";
  },
): Promise<{ ok: true; note: EquityResearchNote } | { ok: false; reason: string }> {
  try {
    const userPrompt = buildEquityResearchUserPrompt({
      ticker: args.ticker,
      fundamentalsSerialized: serializeFundamentalsForPrompt(args.bundle),
      operatorNotes: args.operatorNotes,
      personalExposureFlag: args.exposure,
    });
    const resp = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EQUITY_RESEARCH_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || "{}");
    if (parsed && typeof parsed === "object") {
      const r = parsed as Record<string, unknown>;
      r.ticker = args.ticker;
      if (!r.personalExposureFlag) r.personalExposureFlag = args.exposure;
      r.evidenceQualityScore = deriveEvidenceQualityScore(args.bundle);
    }
    return validateEquityResearchNote(parsed);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "openai_error",
    };
  }
}

async function runTechnicalAI(
  client: OpenAI,
  args: {
    ticker: string;
    position: "long" | "short" | "watching";
    snapshot: ReturnType<typeof buildTechnicalSnapshot>;
    operatorNotes: string;
    exposure: "none" | "low" | "elevated" | "high";
  },
): Promise<{ ok: true; note: TechnicalNote } | { ok: false; reason: string }> {
  try {
    const userPrompt = buildTechnicalUserPrompt({
      ticker: args.ticker,
      position: args.position,
      technicalSerialized: serializeTechnicalSnapshot(args.snapshot),
      personalExposureFlag: args.exposure,
      operatorNotes: args.operatorNotes,
    });
    const resp = await client.chat.completions.create({
      model: "gpt-4.1",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: TECHNICAL_NOTE_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const parsed = JSON.parse(resp.choices?.[0]?.message?.content || "{}");
    if (parsed && typeof parsed === "object") {
      const r = parsed as Record<string, unknown>;
      r.ticker = args.ticker;
      r.position = args.position;
      if (!r.personalExposureFlag) r.personalExposureFlag = args.exposure;
      r.evidenceQualityScore = deriveTechnicalEvidenceScore({
        status: args.snapshot.status,
        missingCount: args.snapshot.missingFields.length,
        totalIndicators: TOTAL_TECHNICAL_INDICATORS,
      });
    }
    return validateTechnicalNote(parsed);
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : "openai_error",
    };
  }
}

/* ───────────── Synthesis (deterministic, NOT another AI call) ───────────── */

function composeSynthesis(
  f: EquityResearchNote | null,
  t: TechnicalNote | null,
): {
  alignment: "aligned-bullish" | "aligned-bearish" | "conflicting" | "insufficient-data";
  summary: string;
} {
  if (!f && !t) {
    return { alignment: "insufficient-data", summary: "No notes produced." };
  }
  if (!f) {
    return {
      alignment: "insufficient-data",
      summary: `Technical only: ${t?.tradePlanSummary.bias} bias, setup quality ${t?.tradePlanSummary.setupQuality}/5.`,
    };
  }
  if (!t) {
    return {
      alignment: "insufficient-data",
      summary: `Fundamental only: ${f.rating.verdict} verdict, conviction ${f.rating.conviction}/5.`,
    };
  }
  const fBull = f.rating.verdict === "buy";
  const fBear = f.rating.verdict === "avoid";
  const tBull = t.tradePlanSummary.bias === "bullish";
  const tBear = t.tradePlanSummary.bias === "bearish";
  if (fBull && tBull) {
    return {
      alignment: "aligned-bullish",
      summary: `Fundamentals (${f.rating.verdict}/${f.rating.conviction}) and technicals (${t.tradePlanSummary.bias}/${t.tradePlanSummary.setupQuality}) align bullish.`,
    };
  }
  if (fBear && tBear) {
    return {
      alignment: "aligned-bearish",
      summary: `Fundamentals (${f.rating.verdict}/${f.rating.conviction}) and technicals (${t.tradePlanSummary.bias}/${t.tradePlanSummary.setupQuality}) align bearish.`,
    };
  }
  if ((fBull && tBear) || (fBear && tBull)) {
    return {
      alignment: "conflicting",
      summary: `Fundamentals (${f.rating.verdict}) and technicals (${t.tradePlanSummary.bias}) conflict — main risk: ${f.mainRisk}`,
    };
  }
  return {
    alignment: "insufficient-data",
    summary: `Mixed: fundamentals ${f.rating.verdict}, technicals ${t.tradePlanSummary.bias}.`,
  };
}
