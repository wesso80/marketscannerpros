/**
 * POST /api/cron/evening-packet
 *
 * After-hours job that materialises an Evening Reconciliation Packet
 * for every workspace that had setup activity in the target day window.
 *
 * Persistence: inserts a row into `evening_packets` (workspace_id,
 * date_iso, packet_json, generated_at). Idempotent on (workspace_id, date_iso).
 * If the table does not yet exist the cron still returns the packet
 * summaries so the operator can see them in the response.
 *
 * Auth: x-cron-secret header (CRON_SECRET env), or admin session.
 * Boundary: read-only aggregation + single insert. No execution.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { requireAdmin } from '@/lib/adminAuth';
import { q } from '@/lib/db';
import { buildEveningPacket } from '@/lib/eveningPacket/builder';
import { pruneEdgePackets } from '@/lib/admin/edgePacketSnapshots';
import { notifyAdmin } from '@/lib/admin/notifyAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const cronSecret = process.env.CRON_SECRET || '';
  const adminSecret = process.env.ADMIN_SECRET || '';
  const headerCron = req.headers.get('x-cron-secret') || '';
  const headerAuth = req.headers.get('authorization')?.replace('Bearer ', '') || '';
  if (cronSecret && timingSafeCompare(headerCron, cronSecret)) return true;
  if (adminSecret && timingSafeCompare(headerAuth, adminSecret)) return true;
  const session = await requireAdmin(req);
  return session.ok;
}

interface CronSummary {
  workspaceId: string;
  dateISO: string;
  ok: boolean;
  reconciledCount?: number;
  warnings?: string[];
  persisted?: boolean;
  error?: string;
}

async function activeWorkspaces(dateISO: string): Promise<string[]> {
  // Workspaces with either a setup surfaced that day or an outcome labelled that day.
  const start = `${dateISO} 00:00:00`;
  const end = `${dateISO} 23:59:59.999`;
  try {
    const rows = await q<{ workspace_id: string }>(
      `SELECT DISTINCT s.workspace_id
         FROM edge_ledger_setups s
         LEFT JOIN edge_ledger_outcomes o ON o.setup_id = s.id
        WHERE (s.surfaced_at BETWEEN $1 AND $2)
           OR (o.labelled_at BETWEEN $1 AND $2)`,
      [start, end],
    );
    return rows.map((r) => r.workspace_id).filter(Boolean);
  } catch {
    return [];
  }
}

async function persistPacket(workspaceId: string, dateISO: string, packetJson: unknown): Promise<boolean> {
  try {
    await q(
      `INSERT INTO evening_packets (workspace_id, date_iso, packet_json, generated_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (workspace_id, date_iso)
       DO UPDATE SET packet_json = EXCLUDED.packet_json, generated_at = NOW()`,
      [workspaceId, dateISO, JSON.stringify(packetJson)],
    );
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!(await authorise(req))) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const dateParam = url.searchParams.get('date') ?? undefined;
  const wsOverride = url.searchParams.get('workspaceId');
  const started = Date.now();

  // Resolve date (default yesterday UTC).
  const dateISO = dateParam ?? (() => {
    const d = new Date(Date.now() - 86400_000);
    return d.toISOString().slice(0, 10);
  })();

  const workspaces = wsOverride
    ? [wsOverride]
    : await activeWorkspaces(dateISO);

  if (workspaces.length === 0) {
    return NextResponse.json({
      ok: true,
      dateISO,
      processed: 0,
      summaries: [],
      durationMs: Date.now() - started,
    });
  }

  const summaries: CronSummary[] = await Promise.all(workspaces.map(async (ws): Promise<CronSummary> => {
    try {
      const packet = await buildEveningPacket(ws, { dateISO });
      const persisted = await persistPacket(ws, dateISO, packet);
      return {
        workspaceId: ws,
        dateISO,
        ok: true,
        reconciledCount: (packet.surfacedToday?.length ?? 0) + (packet.invalidatedToday?.length ?? 0),
        warnings: packet.warnings ?? [],
        persisted,
      };
    } catch (e: unknown) {
      return {
        workspaceId: ws,
        dateISO,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }));

  // Tier 1 #2 retention: prune admin_edge_packets rows older than 30
  // days. Best-effort; failure is logged inside pruneEdgePackets and
  // never blocks the evening packet response.
  const edgePacketsPruned = await pruneEdgePackets(30).catch(() => 0);

  // Notify operator with one consolidated email/Discord ping per cron run.
  const ok = summaries.filter((s) => s.ok).length;
  const failed = summaries.filter((s) => !s.ok);
  const totalReconciled = summaries.reduce((a, s) => a + (s.reconciledCount ?? 0), 0);
  const warningCount = summaries.reduce((a, s) => a + (s.warnings?.length ?? 0), 0);
  const severity = failed.length > 0 ? "error" : warningCount > 0 ? "warn" : "info";
  const bodyLines = [
    `Evening reconciliation for ${dateISO} complete.`,
    `Workspaces processed: ${summaries.length} (${ok} ok / ${failed.length} failed)`,
    `Setups + invalidations reconciled: ${totalReconciled}`,
    `Warnings surfaced: ${warningCount}`,
    `Edge-packet snapshots pruned (>30d): ${edgePacketsPruned}`,
    `Duration: ${Date.now() - started}ms`,
  ];
  if (failed.length > 0) {
    bodyLines.push("", "Failed workspaces:");
    for (const f of failed.slice(0, 10)) {
      bodyLines.push(`  - ${f.workspaceId}: ${f.error}`);
    }
  }
  await notifyAdmin({
    subject: `Evening Packet ${dateISO} · ${summaries.length} workspaces`,
    body: bodyLines.join("\n"),
    severity,
    link: { label: "Open Evening Packet", url: "https://app.marketscannerpros.app/admin/evening-packet" },
    context: {
      date: dateISO,
      workspaces: summaries.length,
      ok,
      failed: failed.length,
      reconciled: totalReconciled,
      warnings: warningCount,
      edgePacketsPruned,
    },
  }).catch((e) => console.error("[evening-packet] notify failed:", e));

  return NextResponse.json({
    ok: true,
    dateISO,
    processed: summaries.length,
    summaries,
    edgePacketsPruned,
    durationMs: Date.now() - started,
  });
}
