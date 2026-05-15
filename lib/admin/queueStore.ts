/**
 * Admin Command Queue — server-side state store.
 *
 * Persists per-(workspace, symbol, market, timeframe) lifecycle state
 * for the Admin Edge Layer queue. Writes go through the lifecycle
 * transition validator; manual overrides are audit-logged.
 *
 * Boundary: research/decision-support only.
 */

import { q } from "../db";
import {
  ADMIN_LIFECYCLE_STATES,
  isValidTransition,
  TERMINAL_STATES,
  type AdminLifecycleState,
} from "./lifecycle";
import type { AdminEdgePacket, ThesisStatus } from "./edgePacket";

export interface QueueStateRow {
  workspaceId: string;
  symbol: string;
  market: string;
  timeframe: string;
  adminState: AdminLifecycleState;
  thesisStatus: ThesisStatus;
  manualOverride: boolean;
  overrideReason: string | null;
  overrideBy: string | null;
  stateEnteredAt: string;
  staleAfter: string;
  lastPacketId: string | null;
}

export interface QueueAuditRow {
  id?: number;
  workspaceId: string;
  symbol: string;
  market: string;
  timeframe: string;
  prevState: AdminLifecycleState | null;
  nextState: AdminLifecycleState;
  reason: string | null;
  actor: string | null;
  createdAt?: string;
}

const VALID_STATES: ReadonlySet<string> = new Set(ADMIN_LIFECYCLE_STATES);

export function isAdminLifecycleState(v: unknown): v is AdminLifecycleState {
  return typeof v === "string" && VALID_STATES.has(v);
}

/** Upsert lifecycle from a freshly projected edge packet (engine-driven). */
export async function syncQueueFromPacket(input: {
  workspaceId: string;
  packet: AdminEdgePacket;
}): Promise<QueueStateRow> {
  const { workspaceId, packet } = input;
  const prior = await loadQueueState(workspaceId, packet.symbol, packet.market, packet.timeframe);

  // If a manual override is in effect AND the override hasn't expired,
  // do NOT overwrite admin_state from the engine. Refresh stale_after only.
  if (prior?.manualOverride) {
    await q(
      `UPDATE admin_queue_state
          SET stale_after = $5, last_packet_id = $6, thesis_status = $7
        WHERE workspace_id = $1 AND symbol = $2 AND market = $3 AND timeframe = $4`,
      [workspaceId, packet.symbol, packet.market, packet.timeframe,
       packet.staleAfter, packet.packetId, packet.thesisStatus],
    );
    return { ...prior, staleAfter: packet.staleAfter, lastPacketId: packet.packetId, thesisStatus: packet.thesisStatus };
  }

  await q(
    `INSERT INTO admin_queue_state
       (workspace_id, symbol, market, timeframe,
        admin_state, thesis_status, manual_override,
        state_entered_at, stale_after, last_packet_id)
     VALUES ($1, $2, $3, $4, $5, $6, FALSE, NOW(), $7, $8)
     ON CONFLICT (workspace_id, symbol, market, timeframe)
     DO UPDATE SET
       admin_state      = EXCLUDED.admin_state,
       thesis_status    = EXCLUDED.thesis_status,
       state_entered_at = CASE
         WHEN admin_queue_state.admin_state IS DISTINCT FROM EXCLUDED.admin_state
         THEN NOW() ELSE admin_queue_state.state_entered_at END,
       stale_after      = EXCLUDED.stale_after,
       last_packet_id   = EXCLUDED.last_packet_id`,
    [workspaceId, packet.symbol, packet.market, packet.timeframe,
     packet.adminState, packet.thesisStatus, packet.staleAfter, packet.packetId],
  );

  return (await loadQueueState(workspaceId, packet.symbol, packet.market, packet.timeframe))!;
}

/** Manual override — validated against the transition table. */
export async function applyManualOverride(input: {
  workspaceId: string;
  symbol: string;
  market: string;
  timeframe: string;
  nextState: AdminLifecycleState;
  reason: string;
  actor: string;
}): Promise<{ ok: true; row: QueueStateRow } | { ok: false; error: string }> {
  if (!isAdminLifecycleState(input.nextState)) {
    return { ok: false, error: `Invalid lifecycle state: ${input.nextState}` };
  }
  const prior = await loadQueueState(input.workspaceId, input.symbol, input.market, input.timeframe);
  const prev = prior?.adminState ?? "IGNORE";
  if (!isValidTransition(prev, input.nextState)) {
    return { ok: false, error: `Illegal transition ${prev} → ${input.nextState}` };
  }

  await q(
    `INSERT INTO admin_queue_state
       (workspace_id, symbol, market, timeframe,
        admin_state, thesis_status, manual_override,
        override_reason, override_by, state_entered_at, stale_after)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8, NOW(), NOW() + INTERVAL '60 minutes')
     ON CONFLICT (workspace_id, symbol, market, timeframe)
     DO UPDATE SET
       admin_state      = EXCLUDED.admin_state,
       manual_override  = TRUE,
       override_reason  = EXCLUDED.override_reason,
       override_by      = EXCLUDED.override_by,
       state_entered_at = NOW(),
       stale_after      = EXCLUDED.stale_after`,
    [input.workspaceId, input.symbol, input.market, input.timeframe,
     input.nextState, prior?.thesisStatus ?? "alive",
     input.reason, input.actor],
  );

  await q(
    `INSERT INTO admin_queue_audit
       (workspace_id, symbol, market, timeframe, prev_state, next_state, reason, actor)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [input.workspaceId, input.symbol, input.market, input.timeframe,
     prev, input.nextState, input.reason, input.actor],
  );

  const row = (await loadQueueState(input.workspaceId, input.symbol, input.market, input.timeframe))!;
  return { ok: true, row };
}

export async function loadQueueState(
  workspaceId: string, symbol: string, market: string, timeframe: string,
): Promise<QueueStateRow | null> {
  const rows = await q<QueueStateRow & { state_entered_at: string; stale_after: string; last_packet_id: string | null }>(
    `SELECT workspace_id   AS "workspaceId",
            symbol, market, timeframe,
            admin_state    AS "adminState",
            thesis_status  AS "thesisStatus",
            manual_override AS "manualOverride",
            override_reason AS "overrideReason",
            override_by    AS "overrideBy",
            state_entered_at AS "stateEnteredAt",
            stale_after    AS "staleAfter",
            last_packet_id AS "lastPacketId"
       FROM admin_queue_state
      WHERE workspace_id = $1 AND symbol = $2 AND market = $3 AND timeframe = $4`,
    [workspaceId, symbol, market, timeframe],
  );
  return rows[0] ?? null;
}

export async function loadActiveQueue(input: {
  workspaceId: string;
  market?: string;
  timeframe?: string;
  includeTerminal?: boolean;
  limit?: number;
}): Promise<QueueStateRow[]> {
  const params: unknown[] = [input.workspaceId];
  let where = "workspace_id = $1";
  if (input.market) { params.push(input.market); where += ` AND market = $${params.length}`; }
  if (input.timeframe) { params.push(input.timeframe); where += ` AND timeframe = $${params.length}`; }
  if (!input.includeTerminal) {
    const terminal = [...TERMINAL_STATES];
    params.push(terminal); where += ` AND admin_state <> ALL($${params.length}::varchar[])`;
  }
  params.push(Math.min(500, input.limit ?? 200));
  return q<QueueStateRow>(
    `SELECT workspace_id   AS "workspaceId",
            symbol, market, timeframe,
            admin_state    AS "adminState",
            thesis_status  AS "thesisStatus",
            manual_override AS "manualOverride",
            override_reason AS "overrideReason",
            override_by    AS "overrideBy",
            state_entered_at AS "stateEnteredAt",
            stale_after    AS "staleAfter",
            last_packet_id AS "lastPacketId"
       FROM admin_queue_state
      WHERE ${where}
      ORDER BY admin_state ASC, state_entered_at DESC
      LIMIT $${params.length}`,
    params,
  );
}
