/**
 * Persistence for canonical AdminEdgePacket emitted by the Opportunity
 * Board on every admin scan. See migrations/094_admin_edge_packets.sql.
 *
 * Two callers:
 *   - /api/admin/opportunities (fire-and-forget after response prep)
 *   - cron evening-packet retention (TRUNCATE rows older than 30d)
 *
 * Boundary: persistence only — no inference, no scoring, no leakage to
 * public surfaces. Per data-integrity rule we record exactly what the
 * board produced; we never re-derive fields here.
 */

import { q } from "@/lib/db";
import type { AdminEdgePacket } from "@/lib/admin/edgePacket";

let tableReady = false;

async function ensureTable(): Promise<void> {
  if (tableReady) return;
  try {
    await q(
      `CREATE TABLE IF NOT EXISTS admin_edge_packets (
        id                       BIGSERIAL PRIMARY KEY,
        workspace_id             UUID         NOT NULL,
        packet_id                TEXT         NOT NULL,
        symbol                   TEXT         NOT NULL,
        market                   TEXT         NOT NULL,
        timeframe                TEXT         NOT NULL,
        asset_class              TEXT         NOT NULL,
        opportunity_rank         INTEGER      NOT NULL DEFAULT 0,
        opportunity_rank_score   NUMERIC(6,2) NOT NULL DEFAULT 0,
        admin_state              TEXT         NOT NULL,
        thesis_status            TEXT         NOT NULL,
        setup_type               TEXT         NOT NULL,
        bias                     TEXT         NOT NULL,
        trust_adjusted_score     NUMERIC(6,2) NOT NULL DEFAULT 0,
        evidence_quality_score   NUMERIC(6,2) NOT NULL DEFAULT 0,
        trap_risk_score          NUMERIC(6,2) NOT NULL DEFAULT 0,
        freshness                TEXT         NOT NULL,
        simulated                BOOLEAN      NOT NULL DEFAULT FALSE,
        do_nothing               BOOLEAN      NOT NULL DEFAULT FALSE,
        scheduler_run_id         TEXT,
        packet_json              JSONB        NOT NULL,
        generated_at             TIMESTAMPTZ  NOT NULL,
        created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )`,
    );
    await q(
      `CREATE INDEX IF NOT EXISTS admin_edge_packets_symbol_idx
        ON admin_edge_packets (workspace_id, symbol, market, timeframe, generated_at DESC)`,
    );
    await q(
      `CREATE INDEX IF NOT EXISTS admin_edge_packets_recent_idx
        ON admin_edge_packets (workspace_id, generated_at DESC)`,
    );
    tableReady = true;
  } catch (err) {
    console.error("[admin-edge-packets] ensureTable failed:", err);
  }
}

export interface PersistEdgePacketsInput {
  workspaceId: string;
  packets: AdminEdgePacket[];
  schedulerRunId?: string;
}

/**
 * Bulk-insert edge packets for a single scan. Best-effort: failures
 * are logged and swallowed so they never block the board response.
 * Returns count of rows successfully written.
 */
export async function persistEdgePackets(input: PersistEdgePacketsInput): Promise<number> {
  if (!input.packets.length) return 0;
  await ensureTable();

  let written = 0;
  for (const packet of input.packets) {
    try {
      await q(
        `INSERT INTO admin_edge_packets (
          workspace_id, packet_id, symbol, market, timeframe, asset_class,
          opportunity_rank, opportunity_rank_score, admin_state, thesis_status,
          setup_type, bias, trust_adjusted_score, evidence_quality_score,
          trap_risk_score, freshness, simulated, do_nothing, scheduler_run_id,
          packet_json, generated_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
        [
          input.workspaceId,
          packet.packetId,
          packet.symbol,
          packet.market,
          packet.timeframe,
          packet.assetClass,
          packet.opportunityRank,
          packet.opportunityRankScore,
          packet.adminState,
          packet.thesisStatus,
          packet.setupType,
          packet.bias,
          // trustAdjustedScore lives on the source AdminResearchPacket, not
          // AdminEdgePacket directly — caller-side projection copied it
          // into the underlying packet. Use evidenceQualityScore (which IS
          // dataTruth.trustScore) and the rank score as a fallback.
          packet.opportunityRankScore,
          packet.evidenceQualityScore,
          packet.trapRiskScore,
          packet.freshness,
          packet.simulated,
          packet.doNothing != null,
          input.schedulerRunId ?? null,
          JSON.stringify(packet),
          packet.generatedAt,
        ],
      );
      written += 1;
    } catch (err) {
      console.error("[admin-edge-packets] insert failed for", packet.symbol, err);
    }
  }
  return written;
}

export interface LoadEdgePacketsInput {
  workspaceId: string;
  symbol?: string;
  market?: string;
  timeframe?: string;
  since?: string;
  limit?: number;
}

export interface EdgePacketRow {
  id: number;
  packetId: string;
  symbol: string;
  market: string;
  timeframe: string;
  assetClass: string;
  opportunityRank: number;
  opportunityRankScore: number;
  adminState: string;
  thesisStatus: string;
  setupType: string;
  bias: string;
  trustAdjustedScore: number;
  evidenceQualityScore: number;
  trapRiskScore: number;
  freshness: string;
  simulated: boolean;
  doNothing: boolean;
  schedulerRunId: string | null;
  packetJson: AdminEdgePacket;
  generatedAt: string;
}

export async function loadEdgePackets(input: LoadEdgePacketsInput): Promise<EdgePacketRow[]> {
  await ensureTable();
  const limit = Math.min(500, input.limit ?? 100);
  const params: unknown[] = [input.workspaceId];
  let where = "workspace_id = $1";
  if (input.symbol) { params.push(input.symbol); where += ` AND symbol = $${params.length}`; }
  if (input.market) { params.push(input.market); where += ` AND market = $${params.length}`; }
  if (input.timeframe) { params.push(input.timeframe); where += ` AND timeframe = $${params.length}`; }
  if (input.since) { params.push(input.since); where += ` AND generated_at >= $${params.length}`; }
  params.push(limit);

  const rows = await q<{
    id: number; packet_id: string; symbol: string; market: string; timeframe: string;
    asset_class: string; opportunity_rank: number; opportunity_rank_score: number | string;
    admin_state: string; thesis_status: string; setup_type: string; bias: string;
    trust_adjusted_score: number | string; evidence_quality_score: number | string;
    trap_risk_score: number | string; freshness: string; simulated: boolean; do_nothing: boolean;
    scheduler_run_id: string | null; packet_json: AdminEdgePacket; generated_at: string;
  }>(
    `SELECT id, packet_id, symbol, market, timeframe, asset_class,
            opportunity_rank, opportunity_rank_score, admin_state, thesis_status,
            setup_type, bias, trust_adjusted_score, evidence_quality_score,
            trap_risk_score, freshness, simulated, do_nothing, scheduler_run_id,
            packet_json, generated_at
       FROM admin_edge_packets
      WHERE ${where}
      ORDER BY generated_at DESC
      LIMIT $${params.length}`,
    params,
  );

  return rows.map((r) => ({
    id: r.id,
    packetId: r.packet_id,
    symbol: r.symbol,
    market: r.market,
    timeframe: r.timeframe,
    assetClass: r.asset_class,
    opportunityRank: r.opportunity_rank,
    opportunityRankScore: Number(r.opportunity_rank_score),
    adminState: r.admin_state,
    thesisStatus: r.thesis_status,
    setupType: r.setup_type,
    bias: r.bias,
    trustAdjustedScore: Number(r.trust_adjusted_score),
    evidenceQualityScore: Number(r.evidence_quality_score),
    trapRiskScore: Number(r.trap_risk_score),
    freshness: r.freshness,
    simulated: r.simulated,
    doNothing: r.do_nothing,
    schedulerRunId: r.scheduler_run_id,
    packetJson: r.packet_json,
    generatedAt: r.generated_at,
  }));
}

/**
 * Prune edge packet rows older than the retention window. Called by
 * the evening-packet cron. Returns count of rows deleted.
 */
export async function pruneEdgePackets(retentionDays = 30): Promise<number> {
  await ensureTable();
  try {
    const res = await q<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM admin_edge_packets
          WHERE generated_at < NOW() - ($1 || ' days')::interval
        RETURNING 1
      ) SELECT COUNT(*)::text AS count FROM deleted`,
      [String(retentionDays)],
    );
    return Number(res[0]?.count ?? 0);
  } catch (err) {
    console.error("[admin-edge-packets] prune failed:", err);
    return 0;
  }
}
