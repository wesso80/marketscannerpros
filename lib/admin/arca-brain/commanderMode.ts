/**
 * lib/admin/arca-brain/commanderMode.ts
 *
 * Aggregates the meta-brain output into the single Commander Mode panel.
 *
 * The Commander screen must answer only ten questions. No charts, no
 * decoration, no tier-talk — only decisions.
 *
 * 1.  Best trade right now
 * 2.  Best long right now
 * 3.  Best short right now
 * 4.  Strongest no-trade warning
 * 5.  Highest-risk open position
 * 6.  Biggest change since last cycle
 * 7.  What ARCA is waiting for
 * 8.  What ARCA refuses to touch
 * 9.  Data freshness status
 * 10. Today's doctrine warning
 *
 * Admin-only. Direct buy/sell/long/short language allowed.
 */

import { q } from "@/lib/db";
import { mapDebateRecord } from "./rowMappers";
import { todaysDoctrineWarning } from "./doctrineEngine";
import type {
  CommanderCandidate,
  CommanderModeSnapshot,
  DataFreshnessStatus,
  DebateRecord,
  InformationEdgeBand,
} from "./types";

function pickCandidate(debate: DebateRecord): CommanderCandidate {
  return {
    symbol: debate.symbol,
    side: debate.side,
    playbook: debate.playbookId,
    entry: Number(debate.traderEvidenceJson?.entry ?? 0),
    stop: Number(debate.traderEvidenceJson?.stop ?? 0),
    takeProfit: debate.traderEvidenceJson?.takeProfit != null
      ? Number(debate.traderEvidenceJson.takeProfit)
      : null,
    confidence: debate.confidenceAfterDebate,
    informationEdgeScore: debate.informationEdgeScore,
    informationEdgeBand: bandFor(debate.informationEdgeScore),
    debateDecision: debate.finalDecision,
    debateId: debate.id,
    evidenceQualityScore: clamp01to100(
      0.5 * debate.confidenceAfterDebate +
        0.5 * (debate.informationEdgeScore ?? 50) -
        debate.prosecutorScore * 0.3,
    ),
    personalExposureFlag: "ok",
    reasoning: debate.traderCase,
    whatConfirms: `Order fills near ${debate.traderEvidenceJson?.entry ?? "planned entry"} with rising participation and no fresh contradicting catalyst.`,
    whatInvalidates: debate.rejectedReason
      ? debate.rejectedReason
      : `Move through ${debate.side === "LONG" ? "stop below" : "stop above"} ${debate.traderEvidenceJson?.stop ?? "planned stop"} invalidates the thesis.`,
    mainRisk: debate.riskBlocks[0] ?? "data quality and crowding remain primary risks.",
  };
}

function bandFor(score: number | null): InformationEdgeBand | null {
  if (score == null) return null;
  if (score > 75) return "RARE_ASYMMETRIC";
  if (score > 50) return "STRONG";
  if (score > 25) return "MODERATE";
  return "OBVIOUS_NOISE";
}

function clamp01to100(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export interface BuildCommanderInput {
  workspaceId: string;
}

export async function buildCommanderSnapshot(input: BuildCommanderInput): Promise<CommanderModeSnapshot> {
  const { workspaceId } = input;

  // 1-3. Best trade / long / short — most recent TAKE/SIZE_DOWN debates.
  const debateRows = await q<Record<string, unknown>>(
    `SELECT * FROM arca_trade_debates
     WHERE workspace_id = $1
       AND decided_at > NOW() - INTERVAL '24 hours'
     ORDER BY decided_at DESC LIMIT 50`,
    [workspaceId],
  );
  const debates = debateRows.map(mapDebateRecord);
  const actionable = debates.filter((d) => d.finalDecision === "TAKE" || d.finalDecision === "SIZE_DOWN");
  const bestTrade = actionable.length ? pickCandidate(actionable[0]) : null;
  const bestLong = actionable.find((d) => d.side === "LONG") ?? null;
  const bestShort = actionable.find((d) => d.side === "SHORT") ?? null;

  // 4. Strongest no-trade warning — recent SKIP with highest prosecutor score.
  const noTradeWarning = debates
    .filter((d) => d.finalDecision === "SKIP")
    .sort((a, b) => b.prosecutorScore - a.prosecutorScore)[0] ?? null;

  // 5. Highest-risk open position.
  const riskRows = await q<{ symbol: string; open_r: string; reason: string }>(
    `SELECT symbol,
            COALESCE(unrealised_r,0)::TEXT AS open_r,
            COALESCE(risk_reason,'open position') AS reason
       FROM arca_positions
      WHERE workspace_id = $1 AND status = 'OPEN'
      ORDER BY COALESCE(unrealised_r,0) ASC LIMIT 1`,
    [workspaceId],
  ).catch(() => []);
  const highestRiskOpen = riskRows.length
    ? { symbol: riskRows[0].symbol, openR: Number(riskRows[0].open_r), reason: riskRows[0].reason }
    : null;

  // 6. Biggest change — placeholder: derived from most recent risk event.
  const changeRows = await q<{ message: string; affected_symbol: string | null }>(
    `SELECT message, affected_symbol FROM arca_risk_events
      WHERE workspace_id = $1
      ORDER BY created_at DESC LIMIT 1`,
    [workspaceId],
  ).catch(() => []);
  const biggestChange = changeRows.length
    ? {
        symbol: changeRows[0].affected_symbol ?? "—",
        what: changeRows[0].message,
        magnitude: "see risk event",
      }
    : null;

  // 7-8. Pending fills / refusals.
  const pendingRows = await q<{ symbol: string; trigger_price: string }>(
    `SELECT symbol, COALESCE(trigger_price,0)::TEXT AS trigger_price
       FROM arca_simulated_orders
      WHERE workspace_id = $1 AND status = 'WAITING'
      ORDER BY created_at DESC LIMIT 5`,
    [workspaceId],
  ).catch(() => []);
  const waitingFor = pendingRows.map((r) => ({ symbol: r.symbol, trigger: `price tag at ${r.trigger_price}` }));

  const willNotTouch = debates
    .filter((d) => d.finalDecision === "SKIP")
    .slice(0, 5)
    .map((d) => ({ symbol: d.symbol, reason: d.rejectedReason ?? "prosecutor objection" }));

  // 9. Data freshness — basic snapshot from edge packets.
  const freshnessRows = await q<{ generated_at: string }>(
    `SELECT MAX(generated_at) AS generated_at FROM admin_edge_packets WHERE workspace_id = $1`,
    [workspaceId],
  ).catch(() => []);
  const lastPacket = freshnessRows[0]?.generated_at ? new Date(freshnessRows[0].generated_at) : null;
  const ageSec = lastPacket ? Math.round((Date.now() - lastPacket.getTime()) / 1000) : null;
  let overall: DataFreshnessStatus = "unknown";
  if (ageSec != null) {
    if (ageSec < 300) overall = "fresh";
    else if (ageSec < 1800) overall = "delayed";
    else overall = "stale";
  }

  // 10. Today's doctrine warning.
  const warningRule = await todaysDoctrineWarning(workspaceId);

  // Aggregate evidence quality + personal exposure (admin scoring).
  const eqs = bestTrade?.evidenceQualityScore ?? 50;

  return {
    generatedAt: new Date().toISOString(),
    workspaceId,
    freshness: {
      overall,
      sources: [
        { name: "admin_edge_packets", status: overall, ageSeconds: ageSec },
      ],
    },
    bestTradeNow: bestTrade,
    bestLongNow: bestLong ? pickCandidate(bestLong) : null,
    bestShortNow: bestShort ? pickCandidate(bestShort) : null,
    strongestNoTradeWarning: noTradeWarning
      ? {
          symbol: noTradeWarning.symbol,
          reason: noTradeWarning.rejectedReason ?? noTradeWarning.prosecutorCase,
          severity: noTradeWarning.prosecutorScore >= 80 ? "critical" : noTradeWarning.prosecutorScore >= 65 ? "high" : "medium",
        }
      : null,
    highestRiskOpenPosition: highestRiskOpen,
    biggestChange,
    arcaIsWaitingFor: waitingFor,
    arcaWillNotTouch: willNotTouch,
    doctrineWarningToday: warningRule
      ? {
          ruleId: warningRule.id,
          ruleName: warningRule.name,
          warning: warningRule.proposedChange ?? warningRule.ruleText,
        }
      : null,
    evidenceQualityScore: Math.round(eqs),
    personalExposureFlag: "ok",
    confidence: overall === "fresh" ? "moderate-to-high" : overall === "delayed" ? "moderate" : "low — data not fresh",
    whatConfirms: "Live ARCA cycle producing TAKE-grade debates with positive Information Edge.",
    whatInvalidates: overall === "stale"
      ? "Data is stale — treat all decisions as advisory until cycle refreshes."
      : "Sudden regime flip or doctrine rule downgrade invalidates current ranking.",
    mainRisk: warningRule?.name ? `Doctrine flag: ${warningRule.name}` : "Crowded participation and intraday volatility expansion.",
  };
}
