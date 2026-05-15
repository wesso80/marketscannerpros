/**
 * /api/admin/queue
 *
 * GET  — return the active Admin Command Queue rows for the current workspace.
 *        ?market=CRYPTO|EQUITIES   filter
 *        ?timeframe=15m            filter
 *        ?includeTerminal=1        also return PAID/EXHAUSTED/INVALIDATED/IGNORE
 *
 * POST — apply a manual lifecycle override.
 *        body: { symbol, market, timeframe, nextState, reason }
 *        Validated against the transition table. Audit-logged.
 *
 * Boundary: research/decision-support only.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { wrapTruth } from "@/lib/admin";
import {
  applyManualOverride,
  isAdminLifecycleState,
  loadActiveQueue,
} from "@/lib/admin/queueStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: "Missing workspace" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const market = searchParams.get("market") ?? undefined;
  const timeframe = searchParams.get("timeframe") ?? undefined;
  const includeTerminal = searchParams.get("includeTerminal") === "1";

  try {
    const rows = await loadActiveQueue({
      workspaceId: session.workspaceId,
      market, timeframe, includeTerminal,
    });
    return NextResponse.json({
      rows,
      count: rows.length,
      truth: wrapTruth({ rows }, {
        source: "admin:queue-store",
        freshness: "real-time",
        confidence: "high",
        confidenceReason: "DB-backed lifecycle store",
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const session = await getSessionFromCookie();
  if (!session?.workspaceId) return NextResponse.json({ error: "Missing workspace" }, { status: 401 });

  let body: { symbol?: string; market?: string; timeframe?: string; nextState?: string; reason?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const symbol = body.symbol?.toUpperCase();
  const market = body.market?.toUpperCase();
  const timeframe = body.timeframe;
  const nextState = body.nextState;
  const reason = (body.reason ?? "").trim();

  if (!symbol || !market || !timeframe || !nextState) {
    return NextResponse.json({ error: "symbol, market, timeframe, nextState required" }, { status: 400 });
  }
  if (!isAdminLifecycleState(nextState)) {
    return NextResponse.json({ error: `Invalid nextState: ${nextState}` }, { status: 400 });
  }
  if (reason.length < 4) {
    return NextResponse.json({ error: "reason required (min 4 chars) for audit log" }, { status: 400 });
  }

  const result = await applyManualOverride({
    workspaceId: session.workspaceId,
    symbol, market, timeframe, nextState,
    reason,
    actor: String(session.cid ?? "admin"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json({ row: result.row });
}
