/**
 * GET /api/admin/portfolio-lab/edge-packets
 *
 * Inspector endpoint for ARCA. Returns the most recent
 * AdminEdgePackets for this workspace with the SAME gate logic
 * the decision engine uses, so operators can see exactly why each
 * packet is or isn't being selected for SIMULATED entry.
 *
 * Admin-only. Workspace-isolated. No broker data.
 *
 * Query params:
 *   sinceMinutes  default 720 (12h)
 *   limit         default 200, capped 500
 *   passOnly      "1" → only return packets that pass all gates
 *   rejectedOnly  "1" → only return packets that fail at least one gate
 *   assetClass    optional filter (equity|crypto|commodity|options|futures)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { wrapTruth } from "@/lib/admin/truthLayer";
import { loadEdgePackets, type EdgePacketRow } from "@/lib/admin/edgePacketSnapshots";
import { gateRow, projectCandidate } from "@/lib/admin/portfolio-lab/decisionEngine";
import { getDefaultPortfolio } from "@/lib/admin/portfolio-lab/portfolioStore";
import {
  ARCA_DEFAULT_PORTFOLIO_NAME,
  ARCA_DEFAULT_SETTINGS,
  ARCA_BASE_CURRENCY,
  ARCA_DEFAULT_STARTING_BALANCE,
  ARCA_DISCLAIMER,
} from "@/lib/admin/portfolio-lab/constants";
import type { ArcaPortfolio } from "@/lib/admin/portfolio-lab/types";

import { reviewPositionSetup, rankPositionReviews } from '@/lib/admin/portfolio-lab/positionReview';

export const runtime = "nodejs";

interface InspectedPacket {
  positionReview: ReturnType<typeof reviewPositionSetup>;
  levelsTimeframe: string;
  packetId: string;
  symbol: string;
  market: string;
  timeframe: string;
  assetClass: string;
  adminState: string;
  thesisStatus: string;
  setupType: string;
  bias: string;
  freshness: string;
  doNothing: boolean;
  simulated: boolean;
  opportunityRankScore: number;
  evidenceQualityScore: number;
  trapRiskScore: number;
  trustAdjustedScore: number;
  entry: number | null;
  stop: number | null;
  tp1: number | null;
  tp2: number | null;
  tp3: number | null;
  currentPrice: number | null;
  rrToTp1: number | null;
  gatePassed: boolean;
  gateReasons: string[];
  generatedAt: string;
  ageMinutes: number;
}

function shapeRow(row: EdgePacketRow, portfolio: ArcaPortfolio): InspectedPacket {
  const reasons = gateRow(row, portfolio);
  const pkt = row.packetJson;
  const projection = projectCandidate(row);
  if (!projection.ok) reasons.push(projection.reason);
  const levels = pkt?.positionLevels;
  const entry = levels?.entryTrigger ?? null;
  const stop = levels?.stop ?? null;
  const currentPrice = typeof pkt?.price === 'number' && Number.isFinite(pkt.price) ? pkt.price : null;
  const ageMs = Date.now() - new Date(row.generatedAt).getTime();

  return {
    positionReview: reviewPositionSetup(row),
    levelsTimeframe: "1W/1D",
    packetId: row.packetId,
    symbol: row.symbol,
    market: row.market,
    timeframe: row.timeframe,
    assetClass: row.assetClass,
    adminState: row.adminState,
    thesisStatus: row.thesisStatus,
    setupType: row.setupType,
    bias: row.bias,
    freshness: row.freshness,
    doNothing: row.doNothing,
    simulated: row.simulated,
    opportunityRankScore: row.opportunityRankScore,
    evidenceQualityScore: row.evidenceQualityScore,
    trapRiskScore: row.trapRiskScore,
    trustAdjustedScore: row.trustAdjustedScore,
    entry,
    stop,
    tp1: levels?.tp1 ?? null,
    tp2: levels?.tp2 ?? null,
    tp3: levels?.tp3 ?? null,
    currentPrice,
    rrToTp1: projection.ok ? projection.candidate.rrToTp1 : null,
    gatePassed: reasons.length === 0,
    gateReasons: reasons,
    generatedAt: row.generatedAt,
    ageMinutes: Math.round(ageMs / 60_000),
  };
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin.ok || !admin.workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const wsid = admin.workspaceId;
  const url = new URL(req.url);
  const sinceMinutes = Math.max(15, Math.min(7 * 24 * 60, Number(url.searchParams.get("sinceMinutes") ?? 720)));
  const limit = Math.max(10, Math.min(500, Number(url.searchParams.get("limit") ?? 200)));
  const passOnly = url.searchParams.get("passOnly") === "1";
  const rejectedOnly = url.searchParams.get("rejectedOnly") === "1";
  const assetClassFilter = url.searchParams.get("assetClass") || null;

  // Use stored portfolio settings if one exists; otherwise the
  // defaults — gating is identical either way unless the operator
  // has changed thresholds.
  const portfolio = (await getDefaultPortfolio(wsid, ARCA_DEFAULT_PORTFOLIO_NAME)) ?? {
    id: "default-placeholder",
    workspaceId: wsid,
    name: ARCA_DEFAULT_PORTFOLIO_NAME,
    mode: "SIMULATED" as const,
    startingBalance: ARCA_DEFAULT_STARTING_BALANCE,
    currentCash: ARCA_DEFAULT_STARTING_BALANCE,
    realisedPnl: 0,
    unrealisedPnl: 0,
    totalEquity: ARCA_DEFAULT_STARTING_BALANCE,
    baseCurrency: ARCA_BASE_CURRENCY,
    status: "ACTIVE" as const,
    settings: ARCA_DEFAULT_SETTINGS,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const since = new Date(Date.now() - sinceMinutes * 60_000).toISOString();
  const rows = await loadEdgePackets({ workspaceId: wsid, since, limit, latestPerSymbol: true });

  let inspected = rows.map((r) => shapeRow(r, portfolio));
  if (assetClassFilter) {
    inspected = inspected.filter((p) => p.assetClass.toLowerCase() === assetClassFilter.toLowerCase());
  }

  rankPositionReviews(inspected);

  // Summaries computed BEFORE pass/reject filter so KPIs reflect
  // the full scan, not the visible subset.
  const summary = {
    scanned: inspected.length,
    positionReview: {
      mode: 'COMPARISON_ONLY',
      ready: inspected.filter(p => p.positionReview.status === 'RESEARCH_READY').length,
      blocked: inspected.filter(p => p.positionReview.status !== 'RESEARCH_READY').length,
      readyButCurrentGateBlocked: inspected.filter(p => p.positionReview.status === 'RESEARCH_READY' && !p.gatePassed).length,
      rankingBasis: 'Ready research only: current TP1 reward/risk descending, then entry-zone progress ascending. Not a probability or proven edge.',
    },
    passing: inspected.filter((p) => p.gatePassed).length,
    gated: inspected.filter((p) => !p.gatePassed).length,
    byAssetClass: aggregate(inspected, (p) => p.assetClass || "unknown"),
    byThesisStatus: aggregate(inspected, (p) => p.thesisStatus || "unknown"),
    byFreshness: aggregate(inspected, (p) => p.freshness || "unknown"),
    topRejectionReasons: topRejections(inspected),
    sinceMinutes,
    thresholds: {
      minEdgePacketRankScore: portfolio.settings.minEdgePacketRankScore,
      minEvidenceQualityScore: portfolio.settings.minEvidenceQualityScore,
      maxTrapRiskScore: 70,
      allowedThesis: ["alive", "weakening", "crowded"],
    },
  };

  if (passOnly) inspected = inspected.filter((p) => p.gatePassed);
  if (rejectedOnly) inspected = inspected.filter((p) => !p.gatePassed);

  return NextResponse.json(
    wrapTruth(
      {
        packets: inspected,
        summary,
        disclaimer: ARCA_DISCLAIMER,
      },
      {
        source: "arca:edge-packets:inspector",
        simulated: true,
        freshness: "real-time",
        confidence: "high",
        confidenceReason: "Candidate gates and position projection match selection. Regime, account sizing and later checks still apply; six-week review is comparison only.",
      },
    ),
  );
}

function aggregate(rows: InspectedPacket[], key: (p: InspectedPacket) => string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function topRejections(rows: InspectedPacket[]): Array<{ reason: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (r.gatePassed) continue;
    for (const reason of r.gateReasons) {
      // bucket numeric variants together (e.g. rank_score_*_lt_65 → rank_score_lt)
      const bucket = reason
        .replace(/_\d+(\.\d+)?_lt_\d+(\.\d+)?/, "_lt_threshold")
        .replace(/_\d+(\.\d+)?_gt_\d+(\.\d+)?/, "_gt_threshold")
        .replace(/_\d+(\.\d+)?/g, "");
      counts[bucket] = (counts[bucket] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}
