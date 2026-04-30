import type { Market } from "@/types/operator";
import { q } from "@/lib/db";
import { getAdminResearchPacketsForSymbols, type AdminResearchPacket } from "@/lib/admin/getAdminResearchPacket";
import { appendResearchEvent } from "@/lib/admin/researchEventTape";

export type SchedulerMode =
  | "CRYPTO_CONTINUOUS"
  | "EQUITIES_MARKET_HOURS"
  | "PRE_MARKET"
  | "POST_MARKET"
  | "EARNINGS"
  | "MACRO_EVENT"
  | "NEWS"
  | "OPTIONS"
  | "WATCHLIST"
  | "HIGH_PRIORITY_RESCAN";

export interface SchedulerRunInput {
  workspaceId: string;
  mode: SchedulerMode;
  market: Market | "CRYPTO" | "EQUITIES";
  timeframe: string;
  symbols: string[];
}

export interface SchedulerRunResult {
  runId: string;
  mode: SchedulerMode;
  market: string;
  timeframe: string;
  startedAt: string;
  completedAt: string;
  symbolsScanned: number;
  errors: Array<{ symbol: string; error: string }>;
  staleData: number;
  alertsFired: number;
  alertsSuppressed: number;
  runtimeMs: number;
  packets: AdminResearchPacket[];
}

let schemaReady = false;

export async function ensureSchedulerTable(): Promise<void> {
  if (schemaReady) return;
  await q(`
    CREATE TABLE IF NOT EXISTS admin_research_scheduler_runs (
      id BIGSERIAL PRIMARY KEY,
      run_id VARCHAR(120) NOT NULL UNIQUE,
      workspace_id VARCHAR(100) NOT NULL,
      mode VARCHAR(40) NOT NULL,
      market VARCHAR(20) NOT NULL,
      timeframe VARCHAR(20) NOT NULL,
      started_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ,
      symbols_scanned INT NOT NULL DEFAULT 0,
      errors JSONB,
      stale_data INT NOT NULL DEFAULT 0,
      alerts_fired INT NOT NULL DEFAULT 0,
      alerts_suppressed INT NOT NULL DEFAULT 0,
      runtime_ms INT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_admin_research_scheduler_workspace ON admin_research_scheduler_runs (workspace_id, created_at DESC)`);
  schemaReady = true;
}

export async function runResearchScheduler(input: SchedulerRunInput): Promise<SchedulerRunResult> {
  await ensureSchedulerTable();

  const startedAtIso = new Date().toISOString();
  const startedAtMs = Date.now();
  const runId = `${input.mode}:${input.market}:${input.timeframe}:${startedAtMs}`;

  await q(
    `INSERT INTO admin_research_scheduler_runs (run_id, workspace_id, mode, market, timeframe, started_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [runId, input.workspaceId, input.mode, input.market, input.timeframe, startedAtIso],
  );

  const errors: Array<{ symbol: string; error: string }> = [];
  let packets: AdminResearchPacket[] = [];

  try {
    packets = await getAdminResearchPacketsForSymbols({
      symbols: input.symbols,
      market: input.market,
      timeframe: input.timeframe,
    });

    const returnedSymbols = new Set(packets.map((p) => p.symbol));
    for (const symbol of input.symbols) {
      if (!returnedSymbols.has(symbol.toUpperCase())) {
        errors.push({ symbol: symbol.toUpperCase(), error: "PACKET_BUILD_FAILED" });
      }
    }
  } catch (error) {
    errors.push({ symbol: "*", error: error instanceof Error ? error.message : "SCHEDULER_FAILED" });
  }

  const staleData = packets.filter((p) => ["STALE", "DEGRADED", "MISSING", "SIMULATED"].includes(p.dataTruth.status)).length;
  const alertsFired = packets.filter((p) => p.alertEligibility.eligible).length;
  const alertsSuppressed = packets.length - alertsFired;
  const completedAtIso = new Date().toISOString();
  const runtimeMs = Date.now() - startedAtMs;

  await q(
    `UPDATE admin_research_scheduler_runs
        SET completed_at = $2,
            symbols_scanned = $3,
            errors = $4,
            stale_data = $5,
            alerts_fired = $6,
            alerts_suppressed = $7,
            runtime_ms = $8
      WHERE run_id = $1`,
    [
      runId,
      completedAtIso,
      packets.length,
      JSON.stringify(errors),
      staleData,
      alertsFired,
      alertsSuppressed,
      runtimeMs,
    ],
  );

  await appendResearchEvent({
    workspaceId: input.workspaceId,
    market: input.market,
    eventType: "DATA_HEALTH",
    severity: staleData > 0 ? "WATCH" : "INFO",
    message: `Scheduler ${input.mode} completed: ${packets.length} packets, ${staleData} stale/degraded.`,
    payload: {
      runId,
      mode: input.mode,
      timeframe: input.timeframe,
      staleData,
      alertsFired,
      alertsSuppressed,
      errors,
      runtimeMs,
    },
  }).catch(() => undefined);

  return {
    runId,
    mode: input.mode,
    market: input.market,
    timeframe: input.timeframe,
    startedAt: startedAtIso,
    completedAt: completedAtIso,
    symbolsScanned: packets.length,
    errors,
    staleData,
    alertsFired,
    alertsSuppressed,
    runtimeMs,
    packets,
  };
}

export async function listSchedulerRuns(workspaceId: string, limit = 50) {
  await ensureSchedulerTable();
  const rows = await q(
    `SELECT run_id, mode, market, timeframe, started_at, completed_at, symbols_scanned, errors, stale_data, alerts_fired, alerts_suppressed, runtime_ms
       FROM admin_research_scheduler_runs
      WHERE workspace_id = $1
      ORDER BY created_at DESC
      LIMIT $2`,
    [workspaceId, Math.max(1, Math.min(200, limit))],
  );
  return rows;
}
