/**
 * lib/admin/portfolio-lab/decisionEngine.ts
 *
 * ARCA reads recent AdminEdgePackets and picks the best candidates
 * for SIMULATED entry. Conservative gates — only PRIME/TRIGGERED setups
 * with complete entry/stop/TP, acceptable freshness, and adequate
 * evidence quality are turned into planned orders.
 */

import { loadEdgePackets, type EdgePacketRow } from "@/lib/admin/edgePacketSnapshots";
import { biasToDirection, POSITION_LEVEL_DEFAULTS } from "@/lib/admin/positionLevels";
import type { ArcaAssetClass, ArcaPortfolio } from "./types";

export interface CandidateGate {
  packetId: string;
  symbol: string;
  passed: boolean;
  reasons: string[];        // why rejected (if any)
}

export interface SelectedCandidate {
  row: EdgePacketRow;
  entry: number;
  stop: number;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  side: "LONG" | "SHORT";
  currentPrice: number;
  rrToTp1: number | null;
  assetClass: ArcaAssetClass;
}

export interface DecisionEngineResult {
  selected: SelectedCandidate[];
  rejected: CandidateGate[];
  scannedPackets: number;
}

export interface DecisionEngineOptions {
  portfolio: ArcaPortfolio;
  maxNewIdeas?: number;
  sinceMinutes?: number;
  /** Reuse the cycle snapshot instead of loading a second copy. */
  rows?: EdgePacketRow[];
}

// `thesisStatus` is the lowercase enum emitted by `deriveThesisStatus` in
// `lib/admin/edgePacket.ts`. Valid pass-through values are the ones that
// represent a thesis still worth scoring; everything else (invalidated,
// reversed, stale, paid, no_edge) is a hard reject because the underlying
// thesis is broken or already-played.
//
// Prior to 2026-05-16 this set held lifecycle-state names
// ("PRIME"/"TRIGGERED"/"CONFIRMED"/"DEVELOPING") which were the wrong
// vocabulary entirely — the result was a 100% rejection rate on the gate.
const ALLOWED_THESIS = new Set(["alive", "weakening", "crowded"]);


export async function runDecisionEngine(opts: DecisionEngineOptions): Promise<DecisionEngineResult> {
  const { portfolio } = opts;
  // Load a much larger window so the engine actually sees the whole
  // universe each cycle. Without this, a small set of stale mega-cap
  // packets monopolise the dedupe slots and the engine appears to
  // "do nothing different" cycle after cycle.
  const maxIdeas = opts.maxNewIdeas ?? 10;
  const limit = Math.max(100, Math.min(500, maxIdeas * 30));
  const sinceMs = (opts.sinceMinutes ?? 720) * 60_000;
  const since = new Date(Date.now() - sinceMs).toISOString();

  const rows = opts.rows?.slice(0, limit) ?? await loadEdgePackets({
    workspaceId: portfolio.workspaceId,
    since,
    limit,
  });

  // Two-pass:
  //  1. Gate every row (so the inspector / journal sees the full
  //     rejection picture across the whole universe, not just the
  //     first 10 unique symbols).
  //  2. Dedupe at SELECTION time only — keep the highest-scoring
  //     passing packet per symbol.
  const selectedBySymbol = new Map<string, SelectedCandidate>();
  const rejected: CandidateGate[] = [];

  for (const row of rows) {
    const gateReasons = gateRow(row, portfolio);
    if (gateReasons.length > 0) {
      rejected.push({ packetId: row.packetId, symbol: row.symbol, passed: false, reasons: gateReasons });
      continue;
    }
    const projection = projectCandidate(row);
    if (!projection.ok) {
      rejected.push({ packetId: row.packetId, symbol: row.symbol, passed: false, reasons: [projection.reason] });
      continue;
    }
    const sel = projection.candidate;
    const existing = selectedBySymbol.get(row.symbol);
    if (!existing || row.opportunityRankScore > existing.row.opportunityRankScore) {
      selectedBySymbol.set(row.symbol, sel);
    }
  }

  // Rank passing candidates by opportunityRankScore desc, cap at maxNewIdeas.
  const selected = Array.from(selectedBySymbol.values())
    .sort((a, b) => b.row.opportunityRankScore - a.row.opportunityRankScore)
    .slice(0, maxIdeas);

  return { selected, rejected, scannedPackets: rows.length };
}


export function gateRow(row: EdgePacketRow, portfolio: ArcaPortfolio): string[] {
  const reasons: string[] = [];
  const s = portfolio.settings;

  if (row.doNothing) reasons.push("do_nothing_flag");
  if (row.adminState === "INVALIDATED" || row.adminState === "EXPIRED" || row.adminState === "IGNORE") {
    reasons.push(`admin_state_${row.adminState}`);
  }
  if (!ALLOWED_THESIS.has(row.thesisStatus)) reasons.push(`thesis_status_${row.thesisStatus}`);
  if (row.freshness === "stale" || row.freshness === "unknown") reasons.push(`freshness_${row.freshness}`);
  if (row.opportunityRankScore < s.minEdgePacketRankScore) {
    reasons.push(`rank_score_${row.opportunityRankScore.toFixed(1)}_lt_${s.minEdgePacketRankScore}`);
  }
  if (row.evidenceQualityScore < s.minEvidenceQualityScore) {
    reasons.push(`evidence_${row.evidenceQualityScore.toFixed(1)}_lt_${s.minEvidenceQualityScore}`);
  }
  if (row.trapRiskScore > 70) reasons.push(`trap_risk_${row.trapRiskScore.toFixed(1)}_gt_70`);

  const assetClass = normaliseAssetClass(row.assetClass);
  if (!s.enabledAssetClasses.includes(assetClass)) reasons.push(`asset_class_${assetClass}_disabled`);

  if (s.enabledPlaybooks && row.setupType && !s.enabledPlaybooks.includes(row.setupType)) {
    reasons.push(`playbook_${row.setupType}_disabled`);
  }
  return reasons;
}

/** Never substitute intraday levels or a planned entry for observed price evidence. */
export function projectCandidate(row: EdgePacketRow, nowMs = Date.now()):
  { ok: true; candidate: SelectedCandidate } | { ok: false; reason: string } {
  const pkt = row.packetJson;
  const levels = pkt?.positionLevels;
  const reject = (reason: string) => ({ ok: false as const, reason });
  const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  const side = biasToDirection(pkt?.bias);
  if (!side || levels?.status !== "ok" || levels.timeframe !== "1W/1D" || levels.direction !== side) {
    return reject("position_levels_unavailable_or_direction_mismatch");
  }
  const generated = Date.parse(pkt.generatedAt);
  const expires = Date.parse(pkt.staleAfter);
  const priceAt = Date.parse(pkt.priceAt ?? "");
  // Apply the packet TTL to quote age too: republishing an old quote is not fresh evidence.
  const ttl = expires - generated;
  if (!Number.isFinite(generated) || !Number.isFinite(expires) || ttl <= 0 || generated > nowMs || expires <= nowMs) {
    return reject("packet_expired_or_timestamp_unavailable");
  }
  if (!positive(pkt.price) || !Number.isFinite(priceAt) || priceAt > nowMs || nowMs - priceAt >= ttl) {
    return reject("current_price_missing_or_stale");
  }
  const dailyAt = Date.parse(levels.dailyAsOf ?? "");
  if (!Number.isFinite(dailyAt) || dailyAt > nowMs || nowMs - dailyAt > POSITION_LEVEL_DEFAULTS.maxDailyAgeDays * 86_400_000) {
    return reject("position_daily_history_stale_or_missing");
  }
  if (levels.entryStatus !== "in_zone") return reject("daily_entry_not_confirmed_in_zone");
  const entry = levels.entryTrigger, stop = levels.stop, tp1 = levels.tp1;
  const low = levels.entryZoneLow, high = levels.entryZoneHigh;
  if (!positive(entry) || !positive(stop) || !positive(tp1) || !positive(low) || !positive(high) || low > high) {
    return reject("invalid_position_levels");
  }
  const currentPrice = pkt.price;
  if (currentPrice < low || currentPrice > high) return reject("current_price_outside_entry_zone");
  const sign = side === "LONG" ? 1 : -1;
  const plannedRisk = sign * (entry - stop), currentRisk = sign * (currentPrice - stop);
  const plannedReward = sign * (tp1 - entry), currentReward = sign * (tp1 - currentPrice);
  const minR = Math.max(1.5, Number.isFinite(levels.minRewardR) ? levels.minRewardR : 1.5);
  if (plannedRisk <= 0 || currentRisk <= 0 || plannedReward <= 0 || currentReward <= 0 ||
      plannedReward / plannedRisk < minR || currentReward / currentRisk < minR || levels.belowMinR) {
    return reject("position_reward_risk_invalid_or_below_minimum");
  }
  // Optional targets must remain beyond TP1, in the trade's direction.
  const tp2 = positive(levels.tp2) && sign * (levels.tp2 - tp1) > 0 ? levels.tp2 : null;
  const tp3 = positive(levels.tp3) && sign * (levels.tp3 - (tp2 ?? tp1)) > 0 ? levels.tp3 : null;
  return { ok: true, candidate: {
    row, entry, stop, tp1, tp2, tp3, side, currentPrice,
    rrToTp1: currentReward / currentRisk,
    assetClass: normaliseAssetClass(row.assetClass),
  } };
}

function normaliseAssetClass(s: string): ArcaAssetClass {
  const x = String(s || "").toLowerCase();
  if (x === "crypto") return "crypto";
  if (x === "commodity") return "commodity";
  if (x === "options" || x === "option") return "options";
  if (x === "futures" || x === "future") return "futures";
  return "equity";
}
