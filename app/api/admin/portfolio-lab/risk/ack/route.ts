/**
 * POST /api/admin/portfolio-lab/risk/ack
 *   body: { eventId: string, note?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { acknowledgeRiskEvent } from "@/lib/admin/portfolio-lab/portfolioStore";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { eventId?: string; note?: string };
  if (!body.eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });
  await acknowledgeRiskEvent(admin.workspaceId, body.eventId);
  return NextResponse.json(
    wrapTruth({ ok: true, eventId: body.eventId }, { source: "arca:risk:ack", simulated: true, freshness: "real-time", confidence: "high" }),
  );
}
