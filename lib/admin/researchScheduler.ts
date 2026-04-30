import type { Market } from "@/types/operator";
import { q } from "@/lib/db";
import { getAdminResearchPacketsForSymbols, type AdminResearchPacket } from "@/lib/admin/getAdminResearchPacket";
import { appendResearchEvent, type ResearchEventType } from "@/lib/admin/researchEventTape";
import { snapshotResearchPacket, loadPriorPacketSnapshot } from "@/lib/admin/researchPacketHistory";

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
  alertsEligible: number;
  alertsSuppressed: number;
  alertsDispatched: number;
  alertsFailedDispatch: number;
  runtimeMs: number;
  packets: AdminResearchPacket[];
  perSymbolEvents: number; // count of per-symbol lifecycle events emitted
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
  const perSymbolEvents: Array<{ symbol: string; eventType: ResearchEventType; message: string }> = [];

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

    // Phase 10: Per-symbol event emission and packet snapshotting
    for (const packet of packets) {
      try {
        // Snapshot this packet
        const snapshot = await snapshotResearchPacket({
          workspaceId: input.workspaceId,
          packet,
          schedulerRunId: runId,
          scanMode: input.mode,
        });

        // Load prior packet for delta
        const priorSnapshot = snapshot
          ? await loadPriorPacketSnapshot({
              workspaceId: input.workspaceId,
              symbol: packet.symbol,
              market: packet.market,
              timeframe: packet.timeframe,
              excludeId: snapshot.id,
            })
          : null;

        // Emit per-symbol lifecycle events
        if (priorSnapshot && priorSnapshot.packetJson) {
          const priorScore = priorSnapshot.trustAdjustedScore || 0;
          const currentScore = packet.trustAdjustedScore;
          const scoreDelta = currentScore - priorScore;

          if (scoreDelta > 5) {
            perSymbolEvents.push({
              symbol: packet.symbol,
              eventType: "SCORE_UPGRADED",
              message: `${packet.symbol} score improved: ${priorScore.toFixed(1)} → ${currentScore.toFixed(1)}`,
            });
          } else if (scoreDelta < -5) {
            perSymbolEvents.push({
              symbol: packet.symbol,
              eventType: "SCORE_DOWNGRADED",
              message: `${packet.symbol} score declined: ${priorScore.toFixed(1)} → ${currentScore.toFixed(1)}`,
            });
          }

          if (priorSnapshot.lifecycle !== packet.lifecycle) {
            perSymbolEvents.push({
              symbol: packet.symbol,
              eventType: "LIFECYCLE_CHANGE",
              message: `${packet.symbol} lifecycle: ${priorSnapshot.lifecycle} → ${packet.lifecycle}`,
            });
          }

          if (priorSnapshot.dataTrustStatus !== packet.dataTruth.status) {
            perSymbolEvents.push({
              symbol: packet.symbol,
              eventType: "DATA_TRUST_CHANGED",
              message: `${packet.symbol} data trust: ${priorSnapshot.dataTrustStatus} → ${packet.dataTruth.status}`,
            });
          }

          if ((priorSnapshot.packetJson.trapDetection?.trapRiskScore || 0) < packet.trapDetection.trapRiskScore) {
            if (packet.trapDetection.trapRiskScore > 65) {
              perSymbolEvents.push({
                symbol: packet.symbol,
                eventType: "TRAP_RISK_CHANGED",
                message: `${packet.symbol} trap risk elevated: ${packet.trapDetection.trapRiskScore.toFixed(0)}%`,
              });
            }
          }

          // Options pressure changed
          if (
            (priorSnapshot.packetJson.optionsIntelligence?.optionsPressureScore || 0) !==
            packet.optionsIntelligence.optionsPressureScore
          ) {
            if (packet.optionsIntelligence.optionsPressureScore > 70) {
              perSymbolEvents.push({
                symbol: packet.symbol,
                eventType: "OPTIONS_PRESSURE_CHANGED",
                message: `${packet.symbol} options pressure elevated: ${packet.optionsIntelligence.optionsPressureScore.toFixed(0)}%`,
              });
            }
          }
        } else if (packet.alertEligibility.eligible) {
          // First scan of symbol
          perSymbolEvents.push({
            symbol: packet.symbol,
            eventType: "PACKET_BUILD_NEW",
            message: `${packet.symbol} first scan in this window: score ${packet.trustAdjustedScore.toFixed(1)}, lifecycle ${packet.lifecycle}`,
          });
        }

        // Emit alert eligibility events
        if (packet.alertEligibility.eligible) {
          perSymbolEvents.push({
            symbol: packet.symbol,
            eventType: "ALERT_ELIGIBLE",
            message: `${packet.symbol} eligible for research alert at score ${packet.trustAdjustedScore.toFixed(1)}`,
          });
        } else if (packet.alertEligibility.reasons.length > 0) {
          perSymbolEvents.push({
            symbol: packet.symbol,
            eventType: "ALERT_SUPPRESSED",
            message: `${packet.symbol} suppressed: ${packet.alertEligibility.reasons[0]}`,
          });
        }
      } catch (error) {
        console.error(`[scheduler] Error processing symbol ${packet.symbol}:`, error);
      }
    }
  } catch (error) {
    errors.push({ symbol: "*", error: error instanceof Error ? error.message : "SCHEDULER_FAILED" });
  }

  const staleData = packets.filter((p) => ["STALE", "DEGRADED", "MISSING", "SIMULATED"].includes(p.dataTruth.status)).length;
  const alertsEligible = packets.filter((p) => p.alertEligibility.eligible).length;
  const alertsSuppressed = packets.length - alertsEligible;
  const alertsDispatched = alertsEligible; // In Phase 10+, would be updated when alerts actually dispatch
  const alertsFailedDispatch = 0;
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
      alertsEligible,
      alertsSuppressed,
      runtimeMs,
    ],
  );

  // Append per-symbol events to event tape
  for (const event of perSymbolEvents) {
    await appendResearchEvent({
      workspaceId: input.workspaceId,
      market: input.market,
      eventType: event.eventType,
      severity: event.eventType === "SCORE_UPGRADED" ? "INFO" : event.eventType === "TRAP_RISK_CHANGED" ? "WATCH" : "INFO",
      message: event.message,
      payload: {
        symbol: event.symbol,
        runId,
        mode: input.mode,
      },
    }).catch(() => undefined);
  }

  // Append run-level DATA_HEALTH event
  await appendResearchEvent({
    workspaceId: input.workspaceId,
    market: input.market,
    eventType: "DATA_HEALTH",
    severity: staleData > 0 ? "WATCH" : "INFO",
    message: `Scheduler ${input.mode} completed: ${packets.length} packets, ${staleData} stale/degraded, ${alertsEligible} eligible.`,
    payload: {
      runId,
      mode: input.mode,
      timeframe: input.timeframe,
      staleData,
      alertsEligible,
      alertsSuppressed,
      alertsDispatched,
      errors,
      runtimeMs,
      perSymbolEventsCount: perSymbolEvents.length,
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
    alertsEligible,
    alertsSuppressed,
    alertsDispatched,
    alertsFailedDispatch,
    runtimeMs,
    packets,
    perSymbolEvents: perSymbolEvents.length,
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
