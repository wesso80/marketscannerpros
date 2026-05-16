/**
 * POST /api/cron/arca-cycle
 *
 * Runs one ARCA simulation cycle for every workspace that has an
 * ACTIVE arca_portfolios row. Designed to be hit on a 15-minute Render
 * cron (24/7 because the portfolio holds crypto).
 *
 * Auth: x-cron-secret header (CRON_SECRET env), or admin session.
 *
 * SIMULATED ONLY. No broker integration. No order routing.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { requireAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/db";
import { simulateArcaCycle } from "@/lib/admin/portfolio-lab/simulateCycle";
import { notifyAdmin } from "@/lib/admin/notifyAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function timingSafeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

async function authorise(req: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET || "";
  const adminSecret = process.env.ADMIN_SECRET || "";
  const headerCron = req.headers.get("x-cron-secret") || "";
  const headerAuth = req.headers.get("authorization")?.replace("Bearer ", "") || "";
  const cronOk = !!cronSecret && timingSafeCompare(headerCron, cronSecret);
  const adminOk = !!adminSecret && timingSafeCompare(headerAuth, adminSecret);
  if (cronOk || adminOk) return true;
  const session = await requireAdmin(req);
  return session.ok;
}

export async function POST(req: NextRequest) {
  if (!(await authorise(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const started = Date.now();
  try {
    const rows = await q<{ workspace_id: string }>(
      `SELECT DISTINCT workspace_id FROM arca_portfolios WHERE status='ACTIVE'`,
    );
    const results: Array<{ workspaceId: string; ok: boolean; result?: unknown; error?: string }> = [];
    for (const r of rows) {
      try {
        const result = await simulateArcaCycle({ workspaceId: r.workspace_id });
        results.push({ workspaceId: r.workspace_id, ok: true, result });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ workspaceId: r.workspace_id, ok: false, error: msg });
        notifyAdmin({
          subject: "arca-cycle workspace failed",
          body: `ARCA cycle failed for workspace ${r.workspace_id}: ${msg}`,
          severity: "error",
          context: { workspaceId: r.workspace_id, durationMs: Date.now() - started },
        }).catch(() => {});
      }
    }
    return NextResponse.json({
      ok: true,
      workspacesProcessed: rows.length,
      results,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notifyAdmin({
      subject: "arca-cycle cron failed",
      body: `arca-cycle cron crashed: ${msg}`,
      severity: "error",
      context: { durationMs: Date.now() - started },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
