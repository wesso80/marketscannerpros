/**
 * POST /api/cron/arca-daily-report
 *
 * Persists DAILY_OPERATOR and EVENING_RECONCILIATION reports for every
 * workspace with an ACTIVE ARCA portfolio. Designed for a single daily
 * post-close Render cron (22:30 UTC).
 *
 * Auth: x-cron-secret header (CRON_SECRET env), or admin session.
 *
 * SIMULATED only.
 */
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { requireAdmin } from "@/lib/adminAuth";
import { q } from "@/lib/db";
import { generateReport } from "@/lib/admin/portfolio-lab/reportEngine";
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
  // Allow override: ?type=DAILY_OPERATOR|EVENING_RECONCILIATION|WEEKLY_REVIEW
  const url = new URL(req.url);
  const typeParam = url.searchParams.get("type");
  const types = typeParam
    ? [typeParam as "DAILY_OPERATOR" | "EVENING_RECONCILIATION" | "WEEKLY_REVIEW"]
    : (["DAILY_OPERATOR", "EVENING_RECONCILIATION"] as const);

  try {
    const rows = await q<{ workspace_id: string }>(
      `SELECT DISTINCT workspace_id FROM arca_portfolios WHERE status='ACTIVE'`,
    );
    const results: Array<{ workspaceId: string; type: string; ok: boolean; error?: string }> = [];
    for (const r of rows) {
      for (const t of types) {
        try {
          await generateReport({ workspaceId: r.workspace_id, reportType: t });
          results.push({ workspaceId: r.workspace_id, type: t, ok: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          results.push({ workspaceId: r.workspace_id, type: t, ok: false, error: msg });
          notifyAdmin({
            subject: "arca-daily-report workspace failed",
            body: `${t} failed for ${r.workspace_id}: ${msg}`,
            severity: "error",
            context: { workspaceId: r.workspace_id, type: t },
          }).catch(() => {});
        }
      }
    }
    return NextResponse.json({
      ok: true,
      workspacesProcessed: rows.length,
      reportsAttempted: rows.length * types.length,
      results,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    notifyAdmin({
      subject: "arca-daily-report cron failed",
      body: `arca-daily-report crashed: ${msg}`,
      severity: "error",
      context: { durationMs: Date.now() - started },
    }).catch(() => {});
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
