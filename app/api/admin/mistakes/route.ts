/**
 * app/api/admin/mistakes/route.ts — list / record mistake labels.
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { listMistakeLabels, recordMistakeLabel } from "@/lib/admin/arca-brain/mistakeLabeler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const mistakeType = url.searchParams.get("mistakeType") ?? undefined;
  const sinceDays = Number(url.searchParams.get("sinceDays") ?? "30");
  const labels = await listMistakeLabels({
    workspaceId: auth.workspaceId,
    mistakeType: mistakeType as never,
    sinceDays: Number.isFinite(sinceDays) ? sinceDays : 30,
  });
  return NextResponse.json({ ok: true, labels });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  if (!body?.tradeId || !body?.portfolioId) {
    return NextResponse.json({ error: "tradeId and portfolioId required" }, { status: 400 });
  }
  const label = await recordMistakeLabel({
    workspaceId: auth.workspaceId,
    id: String(body.tradeId),
    portfolioId: String(body.portfolioId),
    symbol: String(body.symbol ?? ""),
    side: body.side === "SHORT" ? "SHORT" : "LONG",
    entryPrice: Number(body.entryPrice ?? 0),
    exitPrice: Number(body.exitPrice ?? 0),
    stopLoss: body.stopLoss != null ? Number(body.stopLoss) : null,
    takeProfit: body.takeProfit != null ? Number(body.takeProfit) : null,
    rRealised: body.rRealised != null ? Number(body.rRealised) : null,
    pnlDollars: Number(body.pnlDollars ?? 0),
    exitReason: body.exitReason ?? null,
    playbookId: body.playbookId ?? null,
    holdMinutes: body.holdMinutes != null ? Number(body.holdMinutes) : null,
    dataStaleAtEntry: !!body.dataStaleAtEntry,
    regimeContraindicated: !!body.regimeContraindicated,
    lateEntry: !!body.lateEntry,
    stopInsideNoise: !!body.stopInsideNoise,
    positionTooLarge: !!body.positionTooLarge,
    brokeRule: !!body.brokeRule,
    ruleViolatedId: body.ruleViolatedId ?? null,
    arcaReasoningPrefix: body.arcaReasoningPrefix ?? undefined,
  });
  return NextResponse.json({ ok: true, label });
}
