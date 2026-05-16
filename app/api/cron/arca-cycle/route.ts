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
    let rows: Array<{ workspace_id: string }> = [];
    try {
      rows = await q<{ workspace_id: string }>(
        `SELECT DISTINCT workspace_id FROM arca_portfolios WHERE status='ACTIVE'`,
      );
    } catch (selectErr) {
      const msg = selectErr instanceof Error ? selectErr.message : String(selectErr);
      // Common case: migration 095 not deployed → table missing.
      // Don't fail the cron; surface clearly and return 200 with skipped=true.
      const isMissingTable = /relation .* does not exist|arca_portfolios/i.test(msg);
      notifyAdmin({
        subject: isMissingTable
          ? "arca-cycle skipped — arca_portfolios table missing"
          : "arca-cycle: portfolio lookup failed",
        body: `arca-cycle SELECT failed: ${msg}${isMissingTable ? "\n\nLikely cause: migrations/095_arca_portfolio_lab.sql not applied on this environment." : ""}`,
        severity: isMissingTable ? "warn" : "error",
        context: { durationMs: Date.now() - started },
      }).catch(() => {});
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: isMissingTable ? "arca_portfolios_table_missing" : "portfolio_lookup_failed",
        message: msg,
        durationMs: Date.now() - started,
      });
    }

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        workspacesProcessed: 0,
        results: [],
        durationMs: Date.now() - started,
      });
    }

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
