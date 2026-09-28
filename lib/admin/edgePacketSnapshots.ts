import { adminEquitiesPaused } from './adminEquities';
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
import { recordAdminCalls, type AdminCallInput } from "@/lib/admin/adminCallLog";
import { nyDateTime } from "@/lib/time/usSession";

/* ────────────── one direction per symbol per day ────────────── */

export type PacketDirection = "LONG" | "SHORT";

/** LONG / SHORT for a directional bias (incl. BULLISH_RESEARCH / BEARISH_RESEARCH); null for NEUTRAL / unknown. */
export function packetDirection(bias: string | null | undefined): PacketDirection | null {
  const b = String(bias ?? "").toUpperCase();
  if (b === "LONG" || b.startsWith("BULL")) return "LONG";
  if (b === "SHORT" || b.startsWith("BEAR")) return "SHORT";
  return null;
}

/** Key for "this symbol on this New York trading day" (same day definition as the admin call log). */
export function symbolDayKey(symbol: string, market: string, at: string | number | Date): string | null {
  const ms = new Date(at).getTime();
  if (!Number.isFinite(ms)) return null;
  return `${String(symbol).toUpperCase()}|${String(market).toUpperCase()}|${nyDateTime(ms).ymd}`;
}

/**
 * Keep one direction per symbol per New York day. `lockedToday` holds the direction already stored for a
 * symbol-day (its first directional packet that day). A packet in the other direction is dropped; within one
 * batch, conflicting directions for a new symbol-day go to the higher opportunityRankScore (ties: the first
 * packet). NEUTRAL packets are never dropped. Before this, a coin whose 15-minute bias flipped during the day
 * got both a LONG and a SHORT packet (and both were logged as calls).
 */
export function oneDirectionPerDay<T extends Pick<AdminEdgePacket, "symbol" | "market" | "bias" | "generatedAt" | "opportunityRankScore">>(
  packets: T[],
  lockedToday: Map<string, PacketDirection> = new Map(),
): { kept: T[]; dropped: T[] } {
  const locks = new Map(lockedToday);
  const best = new Map<string, T>();
  for (const p of packets) {
    const dir = packetDirection(p.bias);
    const key = symbolDayKey(p.symbol, p.market, p.generatedAt);
    if (!dir || !key || locks.has(key)) continue;
    const current = best.get(key);
    if (!current || p.opportunityRankScore > current.opportunityRankScore) best.set(key, p);
  }
  for (const [key, p] of best) locks.set(key, packetDirection(p.bias)!);
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const p of packets) {
    const dir = packetDirection(p.bias);
    const key = dir ? symbolDayKey(p.symbol, p.market, p.generatedAt) : null;
    if (!dir || !key) { kept.push(p); continue; }
    (locks.get(key) === dir ? kept : dropped).push(p);
  }
  return { kept, dropped };
}

/** First recorded evidence direction today. On failure suppress new calls, not evidence publication. */
async function loadDirectionLocks(workspaceId: string, packets: AdminEdgePacket[]): Promise<Map<string, PacketDirection> | null> {
  const locks = new Map<string, PacketDirection>();
  const symbols = [...new Set(packets.filter((p) => packetDirection(p.bias)).map((p) => p.symbol))];
  if (!symbols.length) return locks;
  try {
    const rows = await q<{ symbol: string; market: string; bias: string; generated_at: string }>(
      `SELECT symbol, market, bias, generated_at
         FROM admin_edge_packets
        WHERE workspace_id = $1 AND symbol = ANY($2)
          AND generated_at >= NOW() - INTERVAL '2 days'
        ORDER BY generated_at ASC`,
      [workspaceId, symbols],
    );
    for (const r of rows) {
      const dir = packetDirection(r.bias);
      const key = dir ? symbolDayKey(r.symbol, r.market, r.generated_at) : null;
      if (dir && key && !locks.has(key)) locks.set(key, dir);
    }
  } catch (err) {
    console.error("[admin-edge-packets] direction lookup failed:", err);
    return null;
  }
  return locks;
}

/** trust_adjusted_score column value: the packet's real trustAdjustedScore (0 when a hand-built packet has none). */
export function edgeTrustScore(packet: AdminEdgePacket): number {
  const t = Number(packet.trustAdjustedScore);
  return Number.isFinite(t) ? Math.max(0, Math.min(100, t)) : 0;
}

/**
 * The packet as an admin call for outcome labelling (admin-call:edge-packet). Simulated and do-nothing packets are
 * not calls; NEUTRAL bias and packets without a price are skipped by recordAdminCalls.
 */
export function edgePacketCall(packet: AdminEdgePacket, nowMs: number = Date.now()): AdminCallInput | null {
  if (packet.simulated || packet.doNothing) return null;
  return {
    source: "edge-packet",
    symbol: packet.symbol,
    market: packet.assetClass,
    direction: packet.bias,
    score: packet.opportunityRankScore,
    secondaryScore: packet.trustAdjustedScore ?? null,
    price: packet.price ?? null,
    priceAt: packet.priceAt ?? null,
    priceSource: "edge-packet",
    timeframe: packet.timeframe,
    entry: packet.entry?.trigger ?? packet.entry?.aggressiveEntry ?? null,
    stop: packet.stopLoss?.level ?? null,
    target1: packet.takeProfit?.tp1 ?? null,
    target2: packet.takeProfit?.tp2 ?? null,
    verdict: packet.adminState,
    trace: {
      packetId: packet.packetId,
      setupType: packet.setupType,
      thesisStatus: packet.thesisStatus,
      opportunityRank: packet.opportunityRank,
      opportunityRankScore: packet.opportunityRankScore,
      trustAdjustedScore: packet.trustAdjustedScore ?? null,
      evidenceQualityScore: packet.evidenceQualityScore,
      trapRiskScore: packet.trapRiskScore,
      generatedAt: packet.generatedAt,
    },
    calledAtMs: nowMs,
  };
}

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

  // A later reversal is evidence, not a second position. Never hide it from latest-evidence readers.
  // Preserve the daily direction restriction only for new outcome calls.
  const locks = await loadDirectionLocks(input.workspaceId, input.packets);
  const persisted: AdminEdgePacket[] = [];
  let failed = 0;
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
          // The source packet's real trustAdjustedScore (projectEdgePacket carries it). This column used to
          // store opportunityRankScore. Hand-built packets without one store 0 rather than the rank score.
          edgeTrustScore(packet),
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
      persisted.push(packet);
    } catch (err) {
      failed++;
      console.error("[admin-edge-packets] insert failed for", packet.symbol, err);
    }
  }
  // Log the new packets' LONG/SHORT calls for outcome labelling. Every workspace persists the same saved-scan
  // packets; the per symbol + direction + NY-day dedupe keeps one call.
  const callEligible = locks === null ? [] : oneDirectionPerDay(persisted, locks).kept;
  const calls = callEligible.map((p) => edgePacketCall(p)).filter((c): c is AdminCallInput => c !== null);
  if (calls.length) await recordAdminCalls(calls).catch(() => undefined);
  console.log('[admin-edge-packets] publication', { received: input.packets.length, written, failed,
    callDirectionSuppressed: persisted.length - callEligible.length });
  if (failed) throw new Error(`Edge packet publication incomplete: ${failed} insert(s) failed; ${written} saved.`);
  return written;
}

/**
 * Drop packets this workspace already has (same packet_id). Saved shared-scan packets keep their id until
 * the symbol is re-scanned, so re-reading them must not insert duplicate snapshot rows. Best-effort: on a
 * lookup error every packet is returned (old behaviour).
 */
export async function filterNewEdgePackets(workspaceId: string, packets: AdminEdgePacket[]): Promise<AdminEdgePacket[]> {
  if (!packets.length) return packets;
  try {
    await ensureTable();
    const rows = await q<{ packet_id: string }>(
      `SELECT packet_id FROM admin_edge_packets WHERE workspace_id = $1 AND packet_id = ANY($2)`,
      [workspaceId, packets.map((p) => p.packetId)],
    );
    const seen = new Set(rows.map((r) => r.packet_id));
    return packets.filter((p) => !seen.has(p.packetId));
  } catch {
    return packets;
  }
}

export interface LoadEdgePacketsInput {
  /** Deduplicate within the workspace before applying the limit. Paper decisions only. */
  latestPerSymbol?: boolean;
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
  // Reads must not acquire schema/index locks inside a paper-ledger transaction.
  // The table and indexes are provisioned by migrations / the ingestion writer.
  const limit = Math.min(500, input.limit ?? 100);
  const params: unknown[] = [input.workspaceId];
  let where = "workspace_id = $1";
  if (adminEquitiesPaused()) where += " AND asset_class <> 'equity' AND asset_class <> 'options'";
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
            CASE WHEN packet_json #>> '{liquidityTargets,integrity}' = 'symbol_local_v1'
              THEN packet_json
              ELSE (packet_json - 'liquidityTargets') || jsonb_build_object(
                'liquidityTargets', jsonb_build_object(
                  'integrity', 'unavailable_legacy',
                  'unavailableReason', 'Legacy map could contain other symbols; regenerate from symbol research.',
                  'buyStops', '[]'::jsonb, 'sellStops', '[]'::jsonb,
                  'priorHigh', NULL, 'priorLow', NULL,
                  'vwapMagnets', '[]'::jsonb, 'gammaWalls', '[]'::jsonb, 'maxPain', NULL,
                  'failedBreakouts', '[]'::jsonb, 'failedReclaims', '[]'::jsonb,
                  'forcedBuyerZones', '[]'::jsonb, 'forcedSellerZones', '[]'::jsonb,
                  'optionsDataMissing', true),
                'missingFields', COALESCE(packet_json->'missingFields', '[]'::jsonb)
                  || '["liquidityTargets: legacy map unavailable"]'::jsonb)
            END AS packet_json, generated_at
       FROM ${input.latestPerSymbol ? `(SELECT DISTINCT ON (market, symbol) *
         FROM admin_edge_packets WHERE ${where}
         ORDER BY market, symbol, generated_at DESC, id DESC) latest_packets` : `admin_edge_packets WHERE ${where}`}
      ORDER BY generated_at DESC, id DESC
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
