import type { AdminResearchPacket } from "@/lib/admin/getAdminResearchPacket";

export interface OperatorBiasSignal {
  code:
    | "CHASING_LATE_MOVES"
    | "IGNORING_STALE_DATA"
    | "IGNORING_CONTRADICTIONS"
    | "ASSET_CONCENTRATION"
    | "BULLISH_CONCENTRATION"
    | "WEAK_CASE_SAVING"
    | "REPEATED_JOURNAL_MISTAKES";
  severity: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
}

export interface OperatorBiasCheckResult {
  biasScore: number;
  signals: OperatorBiasSignal[];
}

export function runOperatorBiasCheck(input: {
  recentPackets: AdminResearchPacket[];
  savedCaseScores?: number[];
  repeatedMistakeCount?: number;
}): OperatorBiasCheckResult {
  const signals: OperatorBiasSignal[] = [];
  const packets = input.recentPackets ?? [];

  const lateMoves = packets.filter((p) => p.lifecycle === "EXHAUSTED" || p.trapDetection.trapType.includes("LATE_MOVE")).length;
  if (lateMoves >= 3) {
    signals.push({
      code: "CHASING_LATE_MOVES",
      severity: "MEDIUM",
      reason: "Multiple recent focus symbols were already in late/exhausted states.",
    });
  }

  const staleFocus = packets.filter((p) => ["STALE", "SIMULATED", "DEGRADED", "MISSING"].includes(p.dataTruth.status)).length;
  if (staleFocus >= 2) {
    signals.push({
      code: "IGNORING_STALE_DATA",
      severity: "HIGH",
      reason: "Recent focus set includes stale or degraded data packets.",
    });
  }

  const contradictionHeavy = packets.filter((p) => p.contradictionFlags.length >= 3).length;
  if (contradictionHeavy >= 2) {
    signals.push({
      code: "IGNORING_CONTRADICTIONS",
      severity: "MEDIUM",
      reason: "Several high-priority packets carry unresolved contradiction flags.",
    });
  }

  const assetCounts = packets.reduce<Record<string, number>>((acc, p) => {
    acc[p.assetClass] = (acc[p.assetClass] || 0) + 1;
    return acc;
  }, {});
  const topAsset = Object.entries(assetCounts).sort((a, b) => b[1] - a[1])[0];
  if (topAsset && packets.length > 0 && topAsset[1] / packets.length >= 0.8) {
    signals.push({
      code: "ASSET_CONCENTRATION",
      severity: "MEDIUM",
      reason: `Recent focus is concentrated in ${topAsset[0]} (${topAsset[1]}/${packets.length}).`,
    });
  }

  const bullishCount = packets.filter((p) => p.bias === "LONG").length;
  if (packets.length >= 5 && bullishCount / packets.length >= 0.85) {
    signals.push({
      code: "BULLISH_CONCENTRATION",
      severity: "LOW",
      reason: "Most recent packets are bullish; consider balanced counter-thesis review.",
    });
  }

  const weakCases = (input.savedCaseScores ?? []).filter((s) => s < 55).length;
  if ((input.savedCaseScores ?? []).length > 0 && weakCases / (input.savedCaseScores ?? []).length >= 0.5) {
    signals.push({
      code: "WEAK_CASE_SAVING",
      severity: "MEDIUM",
      reason: "A high share of saved research cases are below quality threshold.",
    });
  }

  if ((input.repeatedMistakeCount ?? 0) >= 3) {
    signals.push({
      code: "REPEATED_JOURNAL_MISTAKES",
      severity: "HIGH",
      reason: "Journal feedback indicates repeating avoidable mistake patterns.",
    });
  }

  const biasScore = Math.max(0, 100 - signals.reduce((sum, s) => sum + (s.severity === "HIGH" ? 25 : s.severity === "MEDIUM" ? 15 : 8), 0));

  return { biasScore, signals };
}
