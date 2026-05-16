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

const ALLOWED_THESIS = new Set(["PRIME", "TRIGGERED", "CONFIRMED", "DEVELOPING"]);
const ALLOWED_BIAS_LONG = new Set(["BULL", "LONG", "STRONG_BULL"]);
const ALLOWED_BIAS_SHORT = new Set(["BEAR", "SHORT", "STRONG_BEAR"]);

export async function runDecisionEngine(opts: DecisionEngineOptions): Promise<DecisionEngineResult> {
  const { portfolio } = opts;
  const limit = Math.max(20, Math.min(200, opts.maxNewIdeas ?? 10) * 8);
  const sinceMs = (opts.sinceMinutes ?? 240) * 60_000;
  const since = new Date(Date.now() - sinceMs).toISOString();

  const rows = await loadEdgePackets({
    workspaceId: portfolio.workspaceId,
    since,
    limit,
  });

  const seen = new Set<string>();      // dedupe by symbol (latest packet wins)
  const selected: SelectedCandidate[] = [];
  const rejected: CandidateGate[] = [];

  for (const row of rows) {
    if (selected.length >= (opts.maxNewIdeas ?? 10)) break;
    if (seen.has(row.symbol)) continue;
    seen.add(row.symbol);

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
    selected.push(sel);
  }

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
