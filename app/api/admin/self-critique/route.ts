/**
 * app/api/admin/self-critique/route.ts
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { listSelfCritiques, recordSelfCritique } from "@/lib/admin/arca-brain/selfCritique";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const kind = new URL(req.url).searchParams.get("kind") ?? undefined;
  const reports = await listSelfCritiques(auth.workspaceId, kind as never);
  return NextResponse.json({ ok: true, reports });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body?.reportKind || !body?.periodStart || !body?.periodEnd) {
    return NextResponse.json({ error: "reportKind, periodStart, periodEnd required" }, { status: 400 });
  }
  const report = await recordSelfCritique({
    workspaceId: auth.workspaceId,
    portfolioId: body.portfolioId ?? null,
    reportKind: body.reportKind,
    periodStart: String(body.periodStart),
    periodEnd: String(body.periodEnd),
    mostOverconfidentBadCall: body.mostOverconfidentBadCall ?? null,
    bestRejectedTrade: body.bestRejectedTrade ?? null,
    worstAcceptedTrade: body.worstAcceptedTrade ?? null,
    mostUsefulDataSource: body.mostUsefulDataSource ?? null,
    leastUsefulDataSource: body.leastUsefulDataSource ?? null,
    ruleToPromoteId: body.ruleToPromoteId ?? null,
    ruleToDowngradeId: body.ruleToDowngradeId ?? null,
    setupToBanNextWeek: body.setupToBanNextWeek ?? null,
    setupToIncreaseNextWeek: body.setupToIncreaseNextWeek ?? null,
    behaviouralWarning: body.behaviouralWarning ?? null,
    dataQualityWarning: body.dataQualityWarning ?? null,
    fullReportJson: body.fullReportJson ?? {},
  });
  return NextResponse.json({ ok: true, report });
}
