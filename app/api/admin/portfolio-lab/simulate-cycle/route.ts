/**
 * POST /api/admin/portfolio-lab/simulate-cycle
 *
 * Runs one ARCA cycle: mark positions, fill triggered orders, evaluate
 * new candidates, snapshot equity. Returns the SimulateCycleResult.
 *
 * Optional body:
 *   { maxNewIdeas?: number, sinceMinutes?: number }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { simulateArcaCycle } from "@/lib/admin/portfolio-lab/simulateCycle";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  let body: { maxNewIdeas?: number; sinceMinutes?: number } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* empty body ok */
  }
  const result = await simulateArcaCycle({
    workspaceId: admin.workspaceId,
    maxNewIdeas: clampNum(body.maxNewIdeas, 1, 25, 5),
    sinceMinutes: clampNum(body.sinceMinutes, 30, 1440, 240),
  });
  return NextResponse.json(
    wrapTruth(result, {
      source: "arca:simulate-cycle",
      simulated: true,
      freshness: "real-time",
      confidence: "high",
      confidenceReason: "Ledger updated.",
    }),
  );
}

function clampNum(n: unknown, lo: number, hi: number, dflt: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return dflt;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}
