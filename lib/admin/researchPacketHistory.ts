/**
 * Admin Research Packet History — Phase 10
 *
 * Manages server-side packet snapshots for true research delta computation.
 * Replaces client-side localStorage delta with authoritative server-side tracking.
 */

import { q } from "../db";
import type { AdminResearchPacket } from "./getAdminResearchPacket";

export interface PacketSnapshot {
  id: number;
  workspaceId: string;
  symbol: string;
  market: string;
  timeframe: string;
  assetClass: string;
  packetJson: AdminResearchPacket;
  rawResearchScore: number;
  trustAdjustedScore: number;
  lifecycle: string;
  dataTrustStatus: string;
  schedulerRunId?: string;
  scanMode?: string;
  createdAt: string;
}

/**
 * Ensure packet snapshot table exists (idempotent).
 */
export async function ensurePacketSnapshotTable(): Promise<void> {
  try {
    await q(
      `SELECT 1 FROM admin_research_packet_snapshots LIMIT 1`,
    );
  } catch {
    // Table doesn't exist; will be created by migration 071
    console.log("[packet-history] Packet snapshot table not ready; run migrations");
  }
}

/**
 * Snapshot a packet after research run.
 * Called by scheduler on each packet to enable delta computation.
 */
export async function snapshotResearchPacket(input: {
  workspaceId: string;
  packet: AdminResearchPacket;
  schedulerRunId?: string;
  scanMode?: string;
}): Promise<PacketSnapshot | null> {
  try {
    await ensurePacketSnapshotTable();
    
    const result = await q<{ id: number }>(
      `INSERT INTO admin_research_packet_snapshots (
        workspace_id, symbol, market, timeframe, asset_class, packet_json,
        raw_research_score, trust_adjusted_score, lifecycle, data_trust_status,
        scheduler_run_id, scan_mode, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING id`,
      [
        input.workspaceId,
        input.packet.symbol,
        input.packet.market,
        input.packet.timeframe,
        input.packet.assetClass,
        JSON.stringify(input.packet),
        input.packet.rawResearchScore,
        input.packet.trustAdjustedScore,
        input.packet.lifecycle,
        input.packet.dataTruth.status,
        input.schedulerRunId,
        input.scanMode,
      ],
    );

    return {
      id: result[0].id,
      workspaceId: input.workspaceId,
      symbol: input.packet.symbol,
      market: input.packet.market,
      timeframe: input.packet.timeframe,
      assetClass: input.packet.assetClass,
      packetJson: input.packet,
      rawResearchScore: input.packet.rawResearchScore,
      trustAdjustedScore: input.packet.trustAdjustedScore,
      lifecycle: input.packet.lifecycle,
      dataTrustStatus: input.packet.dataTruth.status,
      schedulerRunId: input.schedulerRunId,
      scanMode: input.scanMode,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    console.error("[packet-history] Failed to snapshot packet:", error);
    return null;
  }
}

/**
 * Load the prior packet for a given symbol/market/timeframe.
 * Used by researchDelta.ts to compute what changed.
 */
export async function loadPriorPacketSnapshot(input: {
  workspaceId: string;
  symbol: string;
  market: string;
  timeframe: string;
  excludeId?: number; // skip the latest snapshot (if just created)
}): Promise<PacketSnapshot | null> {
  try {
    await ensurePacketSnapshotTable();
    
    const results = await q<PacketSnapshot>(
      `SELECT id, workspace_id AS "workspaceId", symbol, market, timeframe, asset_class AS "assetClass",
              packet_json AS "packetJson", raw_research_score AS "rawResearchScore",
              trust_adjusted_score AS "trustAdjustedScore", lifecycle, data_trust_status AS "dataTrustStatus",
              scheduler_run_id AS "schedulerRunId", scan_mode AS "scanMode", created_at AS "createdAt"
         FROM admin_research_packet_snapshots
        WHERE workspace_id = $1 AND symbol = $2 AND market = $3 AND timeframe = $4
              ${input.excludeId ? "AND id != $5" : ""}
        ORDER BY created_at DESC
        LIMIT 1`,
      input.excludeId
        ? [input.workspaceId, input.symbol, input.market, input.timeframe, input.excludeId]
        : [input.workspaceId, input.symbol, input.market, input.timeframe],
    );

    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error("[packet-history] Failed to load prior packet:", error);
    return null;
  }
}

/**
 * List recent packet snapshots for a symbol (for admin inspection).
 */
export async function listPacketHistory(input: {
  workspaceId: string;
  symbol: string;
  market: string;
  timeframe: string;
  limit?: number;
}): Promise<PacketSnapshot[]> {
  try {
    await ensurePacketSnapshotTable();
    
    const limit = Math.min(100, input.limit || 20);
    const results = await q<PacketSnapshot>(
      `SELECT id, workspace_id AS "workspaceId", symbol, market, timeframe, asset_class AS "assetClass",
              packet_json AS "packetJson", raw_research_score AS "rawResearchScore",
              trust_adjusted_score AS "trustAdjustedScore", lifecycle, data_trust_status AS "dataTrustStatus",
              scheduler_run_id AS "schedulerRunId", scan_mode AS "scanMode", created_at AS "createdAt"
         FROM admin_research_packet_snapshots
        WHERE workspace_id = $1 AND symbol = $2 AND market = $3 AND timeframe = $4
        ORDER BY created_at DESC
        LIMIT $5`,
      [input.workspaceId, input.symbol, input.market, input.timeframe, limit],
    );

    return results;
  } catch (error) {
    console.error("[packet-history] Failed to list history:", error);
    return [];
  }
}

/**
 * Cleanup old packet snapshots (optional TTL management).
 * Called by cron job or manual maintenance.
 */
export async function cleanupOldPacketSnapshots(retentionDays = 90): Promise<number> {
  try {
    await ensurePacketSnapshotTable();
    
    const result = await q<{ count: number }>(
      `DELETE FROM admin_research_packet_snapshots
       WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
       RETURNING COUNT(*) as count`,
    );

    const deleted = result[0]?.count || 0;
    console.log(`[packet-history] Cleaned up ${deleted} old snapshots (>${retentionDays}d old)`);
    return deleted;
  } catch (error) {
    console.error("[packet-history] Failed to cleanup old snapshots:", error);
    return 0;
  }
}
