/**
 * app/api/admin/regret-map/route.ts
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { listRegretEntries, recordRegret } from "@/lib/admin/arca-brain/regretMap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const classification = url.searchParams.get("classification") ?? undefined;
  const entries = await listRegretEntries(auth.workspaceId, classification as never);
  return NextResponse.json({ ok: true, entries });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (!body?.symbol || !body?.classification || !body?.observedAt || !body?.arcaReasoning) {
    return NextResponse.json({ error: "symbol, classification, observedAt, arcaReasoning required" }, { status: 400 });
  }
  const entry = await recordRegret({
    workspaceId: auth.workspaceId,
    symbol: String(body.symbol),
    observedAt: String(body.observedAt),
    classification: body.classification,
    arcaTradeId: body.arcaTradeId ?? null,
    bradJournalEntryId: body.bradJournalEntryId ?? null,
    sourceEdgePacketId: body.sourceEdgePacketId ?? null,
    playbookId: body.playbookId ?? null,
    missedR: body.missedR ?? null,
    avoidedRLoss: body.avoidedRLoss ?? null,
    regretCostDollars: body.regretCostDollars ?? null,
    correctAvoidanceValue: body.correctAvoidanceValue ?? null,
    arcaReasoning: String(body.arcaReasoning),
    evidenceJson: body.evidenceJson ?? {},
  });
  return NextResponse.json({ ok: true, entry });
}
