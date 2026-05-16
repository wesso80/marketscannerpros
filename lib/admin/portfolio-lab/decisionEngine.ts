/**
 * lib/admin/portfolio-lab/decisionEngine.ts
 *
 * ARCA reads recent AdminEdgePackets and picks the best candidates
 * for SIMULATED entry. Conservative gates — only PRIME/TRIGGERED setups
 * with complete entry/stop/TP, acceptable freshness, and adequate
 * evidence quality are turned into planned orders.
 */

import { loadEdgePackets, type EdgePacketRow } from "@/lib/admin/edgePacketSnapshots";
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
const ALLOWED_BIAS_LONG = new Set(["BULL", "LONG", "STRONG_BULL"]);
const ALLOWED_BIAS_SHORT = new Set(["BEAR", "SHORT", "STRONG_BEAR"]);

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

  const rows = await loadEdgePackets({
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
    const sel = projectCandidate(row);
    if (!sel) {
      rejected.push({ packetId: row.packetId, symbol: row.symbol, passed: false, reasons: ["entry_or_stop_missing"] });
      continue;
    }
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

function projectCandidate(row: EdgePacketRow): SelectedCandidate | null {
  const pkt = row.packetJson;
  const entry = pkt.entry?.trigger ?? pkt.entry?.conservativeEntry ?? pkt.entry?.aggressiveEntry ?? null;
  const stop = pkt.stopLoss?.level ?? null;
  if (entry == null || stop == null) return null;

  const side: "LONG" | "SHORT" =
    ALLOWED_BIAS_LONG.has(String(pkt.bias).toUpperCase())
      ? "LONG"
      : ALLOWED_BIAS_SHORT.has(String(pkt.bias).toUpperCase())
      ? "SHORT"
      : entry > stop
      ? "LONG"
      : "SHORT";

  // sanity: long requires stop < entry; short requires stop > entry
  if (side === "LONG" && stop >= entry) return null;
  if (side === "SHORT" && stop <= entry) return null;

  const tp1 = pkt.takeProfit?.tp1 ?? null;
  const tp2 = pkt.takeProfit?.tp2 ?? null;
  const tp3 = pkt.takeProfit?.tp3 ?? null;

  const snapshotAny = (pkt as unknown as { snapshot?: { price?: number } }).snapshot;
  const currentPrice = Number.isFinite(snapshotAny?.price) ? Number(snapshotAny!.price) : entry;

  return {
    row,
    entry,
    stop,
    tp1,
    tp2,
    tp3,
    side,
    currentPrice,
    rrToTp1: pkt.riskReward?.rrToTp1 ?? null,
    assetClass: normaliseAssetClass(row.assetClass),
  };
}

function normaliseAssetClass(s: string): ArcaAssetClass {
  const x = String(s || "").toLowerCase();
  if (x === "crypto") return "crypto";
  if (x === "commodity") return "commodity";
  if (x === "options" || x === "option") return "options";
  if (x === "futures" || x === "future") return "futures";
  return "equity";
}
