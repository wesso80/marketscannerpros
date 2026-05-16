/**
 * Admin Change Tape — workspace-scoped event log of "what changed"
 * since the prior scan for each symbol. Built on top of the existing
 * `researchPacketHistory` snapshots and the extended `researchDelta`.
 *
 * Boundary: research/decision-support only. Event types describe
 * market-state transitions; they never authorize execution.
 */

import { q } from "../db";
import type { AdminResearchPacket } from "./getAdminResearchPacket";
import { computeResearchDelta, type ResearchDelta } from "./researchDelta";
import { loadPriorPacketSnapshot } from "./researchPacketHistory";

export type ChangeTapeEventType =
  | "GAMMA_FLIP"
  | "UOA_SPIKE"
  | "STRUCTURE_BREAK"
  | "RECLAIM"
  | "LIFECYCLE"
  | "INVALIDATION"
  | "ARCA_VERDICT"
  | "SCORE_JUMP"
  | "TIME_CLUSTER"
  | "VOLATILITY_REGIME"
  | "TRAP_FIRED"
  | "FRESHNESS_DOWNGRADE";

/** Three-tier severity for UI grouping. Derived from event type + magnitude. */
export type ChangeTapeSeverity = "critical" | "notable" | "info";

/**
 * Map event type + magnitude to a severity bucket.
 * INVALIDATION and TRAP_FIRED are always critical (decision-altering).
 * Magnitude >= 75 promotes to critical; 40-74 is notable; below is info.
 */
export function severityOf(eventType: ChangeTapeEventType, magnitude: number): ChangeTapeSeverity {
  if (eventType === "INVALIDATION" || eventType === "TRAP_FIRED") return "critical";
  if (eventType === "FRESHNESS_DOWNGRADE" && magnitude >= 30) return "critical";
  if (magnitude >= 75) return "critical";
  if (magnitude >= 40) return "notable";
  return "info";
}

export interface ChangeTapeEvent {
  id?: number;
  workspaceId: string;
  symbol: string;
  market: string;
  timeframe: string;
  eventType: ChangeTapeEventType;
  prevValue: unknown;
  nextValue: unknown;
  /** 0..100 normalized severity. */
  magnitude: number;
  packetId: string | null;
  source: string;
  evidenceQuality: number | null;
  observedAt?: string;
}

/** Threshold at which a score change becomes a SCORE_JUMP event. */
const SCORE_JUMP_THRESHOLD = 15;

/**
 * Compare a freshly produced packet to its prior snapshot and return
 * the list of change events. Caller is responsible for persistence
 * (use `persistChangeTapeEvents`).
 */
export async function detectChangeTapeEvents(input: {
  workspaceId: string;
  packet: AdminResearchPacket;
}): Promise<ChangeTapeEvent[]> {
  const { workspaceId, packet } = input;
  const prior = await loadPriorPacketSnapshot({
    workspaceId,
    symbol: packet.symbol,
    market: packet.market,
    timeframe: packet.timeframe,
  });

  const prev = prior?.packetJson;
  if (!prev) return [];

  const delta = computeResearchDelta({ previous: prev as unknown as Record<string, unknown>, current: packet as unknown as Record<string, unknown> });
  const events: ChangeTapeEvent[] = [];
  const base = {
    workspaceId,
    symbol: packet.symbol,
    market: packet.market,
    timeframe: packet.timeframe,
    packetId: packet.packetId ?? null,
    source: "admin:change-tape",
    evidenceQuality: packet.dataTruth?.trustScore ?? null,
  } as const;

  // 1. SCORE_JUMP
  if (Math.abs(delta.scoreDelta) >= SCORE_JUMP_THRESHOLD) {
    events.push({
      ...base,
      eventType: "SCORE_JUMP",
      prevValue: prev.trustAdjustedScore ?? prev.internalResearchScore?.trustAdjustedScore,
      nextValue: packet.trustAdjustedScore,
      magnitude: clamp(Math.abs(delta.scoreDelta), 0, 100),
    });
  }

  // 2. LIFECYCLE
  if (delta.lifecycleDelta !== "UNCHANGED") {
    events.push({
      ...base,
      eventType: "LIFECYCLE",
      prevValue: prev.lifecycle,
      nextValue: packet.lifecycle,
      magnitude: 60,
    });
  }

  // 3. INVALIDATION
  if (delta.newRisks.length > 0 || packet.lifecycle === "INVALIDATED") {
    events.push({
      ...base,
      eventType: "INVALIDATION",
      prevValue: prev.invalidationConditions ?? [],
      nextValue: packet.invalidationConditions ?? [],
      magnitude: 80,
    });
  }

  // 4. VOLATILITY_REGIME
  if (
    prev.volatilityState?.state &&
    packet.volatilityState?.state &&
    prev.volatilityState.state !== packet.volatilityState.state
  ) {
    events.push({
      ...base,
      eventType: "VOLATILITY_REGIME",
      prevValue: prev.volatilityState.state,
      nextValue: packet.volatilityState.state,
      magnitude: 55,
    });
  }

  // 5. TRAP_FIRED
  if (!prev.volatilityState?.trap && packet.volatilityState?.trap) {
    events.push({
      ...base,
      eventType: "TRAP_FIRED",
      prevValue: false,
      nextValue: true,
      magnitude: 70,
    });
  }

  // 6. TIME_CLUSTER — score crossed 0.7 threshold either direction.
  const prevTime = num(prev.timeConfluence?.score);
  const currTime = num(packet.timeConfluence?.score);
  if ((prevTime < 0.7) !== (currTime < 0.7)) {
    events.push({
      ...base,
      eventType: "TIME_CLUSTER",
      prevValue: prevTime,
      nextValue: currTime,
      magnitude: clamp(Math.abs(currTime - prevTime) * 100, 0, 100),
    });
  }

  // 7. FRESHNESS_DOWNGRADE — trustScore dropped meaningfully between scans.
  // Per data-integrity rule: stale data must be visibly degraded, not silently used.
  const prevTrust = num(prev.dataTruth?.trustScore ?? prev.trustAdjustedScore);
  const currTrust = num(packet.dataTruth?.trustScore ?? packet.trustAdjustedScore);
  if (prevTrust > 0 && currTrust > 0 && prevTrust - currTrust >= 15) {
    events.push({
      ...base,
      eventType: "FRESHNESS_DOWNGRADE",
      prevValue: prevTrust,
      nextValue: currTrust,
      magnitude: clamp(prevTrust - currTrust, 0, 100),
    });
  }

  // 8. GAMMA_FLIP / UOA_SPIKE — only if optionsIntelligence has the
  // relevant fields. Per options-data-rules, missing data is recorded
  // as a NULL prev/next, never substituted.
  const prevOpts = prev.optionsIntelligence as { gammaFlip?: number; uoaScore?: number } | undefined;
  const currOpts = packet.optionsIntelligence as { gammaFlip?: number; uoaScore?: number } | undefined;
  if (prevOpts && currOpts) {
    if (typeof prevOpts.gammaFlip === "number" && typeof currOpts.gammaFlip === "number") {
      const flipDelta = Math.sign(currOpts.gammaFlip) - Math.sign(prevOpts.gammaFlip);
      if (flipDelta !== 0) {
        events.push({
          ...base,
          eventType: "GAMMA_FLIP",
          prevValue: prevOpts.gammaFlip,
          nextValue: currOpts.gammaFlip,
          magnitude: 75,
        });
      }
    }
    if (typeof prevOpts.uoaScore === "number" && typeof currOpts.uoaScore === "number") {
      const spike = currOpts.uoaScore - prevOpts.uoaScore;
      if (spike >= 25) {
        events.push({
          ...base,
          eventType: "UOA_SPIKE",
          prevValue: prevOpts.uoaScore,
          nextValue: currOpts.uoaScore,
          magnitude: clamp(spike, 0, 100),
        });
      }
    }
  }

  return events;
}

export async function persistChangeTapeEvents(events: ChangeTapeEvent[]): Promise<number> {
  if (events.length === 0) return 0;
  let written = 0;
  for (const ev of events) {
    try {
      await q(
        `INSERT INTO admin_change_tape
           (workspace_id, symbol, market, timeframe, event_type,
            prev_value, next_value, magnitude, packet_id, source, evidence_quality)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          ev.workspaceId, ev.symbol, ev.market, ev.timeframe, ev.eventType,
          ev.prevValue == null ? null : JSON.stringify(ev.prevValue),
          ev.nextValue == null ? null : JSON.stringify(ev.nextValue),
          ev.magnitude, ev.packetId, ev.source, ev.evidenceQuality,
        ],
      );
      written += 1;
    } catch (err) {
      console.error("[change-tape] insert failed:", err);
    }
  }
  return written;
}

export async function loadChangeTape(input: {
  workspaceId: string;
  since?: string;
  symbol?: string;
  types?: ChangeTapeEventType[];
  limit?: number;
}): Promise<ChangeTapeEvent[]> {
  const limit = Math.min(500, input.limit ?? 100);
  const params: unknown[] = [input.workspaceId];
  let where = "workspace_id = $1";
  if (input.since) { params.push(input.since); where += ` AND observed_at >= $${params.length}`; }
  if (input.symbol) { params.push(input.symbol); where += ` AND symbol = $${params.length}`; }
  if (input.types?.length) { params.push(input.types); where += ` AND event_type = ANY($${params.length})`; }
  params.push(limit);
  const rows = await q<{
    id: number; workspace_id: string; symbol: string; market: string; timeframe: string;
    event_type: ChangeTapeEventType; prev_value: unknown; next_value: unknown;
    magnitude: number | string; packet_id: string | null; source: string;
    evidence_quality: number | string | null; observed_at: string;
  }>(
    `SELECT id, workspace_id, symbol, market, timeframe, event_type,
            prev_value, next_value, magnitude, packet_id, source,
            evidence_quality, observed_at
       FROM admin_change_tape
      WHERE ${where}
      ORDER BY observed_at DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    symbol: r.symbol,
    market: r.market,
    timeframe: r.timeframe,
    eventType: r.event_type,
    prevValue: r.prev_value,
    nextValue: r.next_value,
    magnitude: Number(r.magnitude),
    packetId: r.packet_id,
    source: r.source,
    evidenceQuality: r.evidence_quality == null ? null : Number(r.evidence_quality),
    observedAt: r.observed_at,
  }));
}

function num(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}
