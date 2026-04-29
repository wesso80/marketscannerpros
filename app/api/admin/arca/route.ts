/**
 * Phase 6 — ARCA Admin Research Copilot API
 *
 * POST /api/admin/arca
 *
 * Body: { mode: ArcaAdminMode, context: ArcaAdminContext }
 *
 * Server prompt explicitly forbids execution verbs and instructs the
 * model to refuse + reframe execution-style requests. The response is
 * validated against `ArcaAdminResearchOutput` and rejected if it
 * contains any forbidden execution phrasing.
 *
 * Boundary: this route NEVER returns an order, NEVER returns a
 * position size, NEVER returns a "buy now" / "sell now" instruction.
 */

import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import {
  ARCA_ADMIN_MODES,
  validateArcaOutput,
  type ArcaAdminContext,
  type ArcaAdminMode,
  type ArcaAdminResearchOutput,
} from "@/lib/admin/arcaTypes";
import { buildArcaSystemPrompt, buildArcaUserPrompt } from "@/lib/admin/arcaPrompt";

export const runtime = "nodejs";
export const maxDuration = 30;

interface RequestBody {
  mode: ArcaAdminMode;
  context: ArcaAdminContext;
}

function fallbackOutput(mode: ArcaAdminMode, ctx: ArcaAdminContext, reason: string): ArcaAdminResearchOutput {
  return {
    mode,
    symbol: ctx.symbol.toUpperCase(),
    headline: `ARCA unavailable — research-only fallback (${reason}).`,
    reasoning: [
      `Mode: ${mode}.`,
      `Score ${ctx.score.score} (lifecycle ${ctx.score.lifecycle}).`,
      `Dominant axis: ${ctx.score.dominantAxis ?? "none"}.`,
      `Data truth: ${ctx.dataTruth.status} (trustScore ${ctx.dataTruth.trustScore}).`,
    ],
    evidence: Object.entries(ctx.score.axes).map(([k, v]) => `${k}=${Math.round(v)}`),
    risks: [
      "Copilot text generation unavailable; treat this as raw cockpit data only.",
      ctx.dataTruth.status === "DEGRADED" || ctx.dataTruth.status === "MISSING" || ctx.dataTruth.status === "ERROR"
        ? "Data truth is degraded — research conclusions are not reliable."
        : "Operator must form the research verdict manually.",
    ],
    classification: "ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION",
  };
}

export async function POST(req: NextRequest) {
  // Auth — admin secret OR operator session
  const adminAuth = (await requireAdmin(req)).ok;
  if (!adminAuth) {
    const session = await getSessionFromCookie();
    if (!session || !isOperator(session.cid, session.workspaceId)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.mode || !ARCA_ADMIN_MODES.includes(body.mode)) {
    return NextResponse.json({ error: `mode must be one of ${ARCA_ADMIN_MODES.join(", ")}` }, { status: 400 });
  }
  const ctx = body.context;
  if (!ctx?.symbol || !ctx?.score?.axes || !ctx?.dataTruth) {
    return NextResponse.json({ error: "context.symbol, context.score.axes, context.dataTruth are required" }, { status: 400 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: true, output: fallbackOutput(body.mode, ctx, "OPENAI_API_KEY missing") });
  }

  const client = new OpenAI({ apiKey });
  const system = buildArcaSystemPrompt();
  const user = buildArcaUserPrompt(body.mode, ctx);

  try {
    const resp = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 700,
    });
    const text = resp.choices[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ ok: true, output: fallbackOutput(body.mode, ctx, "model returned non-JSON") });
    }

    // Force-correct fields the model is required to echo so validation focuses on substance.
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;
      p.mode = body.mode;
      p.symbol = ctx.symbol.toUpperCase();
      p.classification = "ADMIN_RESEARCH_COPILOT_NOT_BROKER_EXECUTION";
    }

    const validation = validateArcaOutput(parsed, body.mode, ctx.symbol);
    if (!validation.ok || !validation.output) {
      return NextResponse.json({
        ok: true,
        output: fallbackOutput(body.mode, ctx, `output validation failed: ${validation.errors.join("; ")}`),
        validation: { ok: false, errors: validation.errors },
      });
    }

    return NextResponse.json({ ok: true, output: validation.output });
  } catch (err) {
    return NextResponse.json({
      ok: true,
      output: fallbackOutput(body.mode, ctx, err instanceof Error ? err.message : "openai_error"),
    });
  }
}
