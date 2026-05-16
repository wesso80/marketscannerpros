/**
 * GET /api/admin/time-to-decision
 *
 * Tier 1 #5 — measures latency between a setup being surfaced as READY
 * (edge_ledger_setups.surfaced_at) and the operator acting on it
 * (taken_at). Honest in two ways:
 *   1. Only setups with taken_at IS NOT NULL contribute (no inference).
 *   2. Skipped setups are reported separately as a count, not folded
 *      into the latency distribution.
 *
 * No fabrication: when the sample is < 5 the response reports status
 * "insufficient" instead of percentile noise.
 *
 * Query params:
 *   ?days=30   (default 30, clamped 1..365)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getSessionFromCookie } from "@/lib/auth";
import { isOperator } from "@/lib/quant/operatorAuth";
import { q } from "@/lib/db";
import { wrapTruth } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_SAMPLE = 5;

async function authorize(req: NextRequest): Promise<{ ok: boolean; workspaceId: string }> {
  const adminAuth = await requireAdmin(req);
  if (adminAuth.ok) return { ok: true, workspaceId: adminAuth.workspaceId || "admin" };
  const session = await getSessionFromCookie();
  if (!session || !isOperator(session.cid, session.workspaceId)) {
    return { ok: false, workspaceId: "" };
  }
  return { ok: true, workspaceId: session.workspaceId };
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx];
}

export async function GET(req: NextRequest) {
  const auth = await authorize(req);
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const url = new URL(req.url);
  const raw = Number(url.searchParams.get("days") ?? 30);
  const days = Number.isFinite(raw) ? Math.max(1, Math.min(365, Math.round(raw))) : 30;

  let takenRows: Array<{ surfaced_at: string; taken_at: string }> = [];
  let skippedCount = 0;
  let surfacedCount = 0;
  let queryError: string | null = null;

  try {
    takenRows = await q<{ surfaced_at: string; taken_at: string }>(
      `SELECT surfaced_at, taken_at
         FROM edge_ledger_setups
        WHERE workspace_id = $1
          AND status = 'taken'
          AND taken_at IS NOT NULL
          AND surfaced_at >= NOW() - ($2 || ' days')::interval`,
      [auth.workspaceId, String(days)],
    );

    const [skipped] = await q<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM edge_ledger_setups
        WHERE workspace_id = $1
          AND status = 'skipped'
          AND surfaced_at >= NOW() - ($2 || ' days')::interval`,
      [auth.workspaceId, String(days)],
    );
    skippedCount = Number(skipped?.count ?? 0);

    const [surfaced] = await q<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM edge_ledger_setups
        WHERE workspace_id = $1
          AND surfaced_at >= NOW() - ($2 || ' days')::interval`,
      [auth.workspaceId, String(days)],
    );
    surfacedCount = Number(surfaced?.count ?? 0);
  } catch (err) {
    queryError = err instanceof Error ? err.message : String(err);
  }

  const latenciesMin: number[] = [];
  for (const r of takenRows) {
    const surf = new Date(r.surfaced_at).getTime();
    const took = new Date(r.taken_at).getTime();
    if (!Number.isFinite(surf) || !Number.isFinite(took)) continue;
    const deltaMin = (took - surf) / 60000;
    if (deltaMin < 0) continue;
    latenciesMin.push(deltaMin);
  }
  latenciesMin.sort((a, b) => a - b);

  const status: "ok" | "insufficient" | "error" = queryError
    ? "error"
    : latenciesMin.length >= MIN_SAMPLE
      ? "ok"
      : "insufficient";

  const report = {
    status,
    workspaceId: auth.workspaceId,
    windowDays: days,
    sampleSize: latenciesMin.length,
    minRequired: MIN_SAMPLE,
    surfacedCount,
    takenCount: latenciesMin.length,
    skippedCount,
    actionRate: surfacedCount > 0 ? Math.round((latenciesMin.length / surfacedCount) * 1000) / 1000 : null,
    skipRate: surfacedCount > 0 ? Math.round((skippedCount / surfacedCount) * 1000) / 1000 : null,
    latencyMinutes:
      status === "ok"
        ? {
            p50: round1(percentile(latenciesMin, 50)),
            p75: round1(percentile(latenciesMin, 75)),
            p90: round1(percentile(latenciesMin, 90)),
            max: round1(latenciesMin[latenciesMin.length - 1] ?? null),
            mean: round1(latenciesMin.reduce((a, b) => a + b, 0) / latenciesMin.length),
          }
        : null,
    notes: queryError
      ? [`Query failed: ${queryError}`]
      : status === "insufficient"
        ? [`Sample ${latenciesMin.length} < ${MIN_SAMPLE} taken setups in last ${days}d. Percentiles withheld.`]
        : [],
    computedAt: new Date().toISOString(),
  };

  return NextResponse.json({
    ok: true,
    report,
    truth: wrapTruth(
      { source: "admin:time-to-decision", workspaceId: auth.workspaceId },
      {
        source: "admin:time-to-decision",
        freshness: status === "ok" ? "real-time" : "delayed",
        simulated: false,
        confidence: status === "ok" ? "high" : status === "insufficient" ? "low" : "low",
        confidenceReason:
          status === "ok"
            ? `${latenciesMin.length} taken-setup latencies in last ${days}d.`
            : status === "insufficient"
              ? `Insufficient sample (${latenciesMin.length} < ${MIN_SAMPLE}).`
              : "Query failed; see notes.",
      },
    ),
  });
}

function round1(v: number | null): number | null {
  if (v == null || !Number.isFinite(v)) return null;
  return Math.round(v * 10) / 10;
}
