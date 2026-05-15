/**
 * GET /api/admin/change-tape
 *
 * Workspace-scoped change feed for the Admin Edge Layer home screen.
 * Returns the most recent ChangeTapeEvent rows wrapped in a TruthEnvelope.
 *
 * Query params:
 *   ?since=<ISO timestamp>     filter to events at or after
 *   ?symbol=<TICKER>           filter to one symbol
 *   ?types=GAMMA_FLIP,...      comma-separated event_type filter
 *   ?limit=<n>                 default 100, max 500
 *
 * Boundary: research/decision-support only. No execution semantics.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin";
import { loadChangeTape, type ChangeTapeEventType } from "@/lib/admin/changeTape";
import { getSessionFromCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const session = await getSessionFromCookie();
  if (!session?.workspaceId) {
    return NextResponse.json({ error: "Missing workspace" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const since = searchParams.get("since") ?? undefined;
    const symbol = searchParams.get("symbol")?.toUpperCase() ?? undefined;
    const typesParam = searchParams.get("types");
    const types = typesParam
      ? typesParam.split(",").map((s) => s.trim()).filter(Boolean) as ChangeTapeEventType[]
      : undefined;
    const limit = Number(searchParams.get("limit") ?? "100");

    const events = await loadChangeTape({
      workspaceId: session.workspaceId,
      since, symbol, types, limit,
    });

    return NextResponse.json({
      events,
      count: events.length,
      truth: wrapTruth({ events }, {
        source: "admin:change-tape",
        freshness: "real-time",
        confidence: events.length === 0 ? "low" : "high",
        confidenceReason: events.length === 0 ? "No events in window" : "DB-backed audit",
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
