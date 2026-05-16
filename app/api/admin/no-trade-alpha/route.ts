/**
 * app/api/admin/no-trade-alpha/route.ts
 * Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import {
  evaluateNoTradeOutcome,
  pendingNoTradeEvaluations,
  recordNoTradeRejection,
} from "@/lib/admin/arca-brain/noTradeAlpha";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const entries = await pendingNoTradeEvaluations(auth.workspaceId);
  return NextResponse.json({ ok: true, entries });
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok || !auth.workspaceId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));

  if (body?.action === "evaluate") {
    if (!body?.entryId || !body?.outcomeClass) {
      return NextResponse.json({ error: "entryId and outcomeClass required" }, { status: 400 });
    }
    const entry = await evaluateNoTradeOutcome({
      workspaceId: auth.workspaceId,
      entryId: String(body.entryId),
      outcomeClass: body.outcomeClass,
      realisedRIfTaken: body.realisedRIfTaken ?? null,
      realisedPnlIfTaken: body.realisedPnlIfTaken ?? null,
    });
    return NextResponse.json({ ok: true, entry });
  }

  if (!body?.symbol || !body?.rejectionSource || !body?.rejectionReason) {
    return NextResponse.json({ error: "symbol, rejectionSource, rejectionReason required" }, { status: 400 });
  }
  const entry = await recordNoTradeRejection({
    workspaceId: auth.workspaceId,
    symbol: String(body.symbol),
    rejectionSource: body.rejectionSource,
    rejectionReason: String(body.rejectionReason),
    debateId: body.debateId ?? null,
    hypotheticalEntry: body.hypotheticalEntry ?? null,
    hypotheticalStop: body.hypotheticalStop ?? null,
    hypotheticalTarget: body.hypotheticalTarget ?? null,
    hypotheticalSizeDollars: body.hypotheticalSizeDollars ?? null,
  });
  return NextResponse.json({ ok: true, entry });
}
