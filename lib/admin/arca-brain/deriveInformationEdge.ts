/**
 * lib/admin/arca-brain/deriveInformationEdge.ts
 *
 * Adapter that turns an AdminEdgePacket into InformationEdgeInputs so
 * the live simulateCycle path can call computeInformationEdge without
 * each call site re-implementing the mapping.
 *
 * Hard rule: where a packet field is missing, the input is filled with
 * a neutral default (50) AND the field name is added to missingInputs.
 * Confidence in the resulting score is degraded proportionally.
 *
 * Admin-only.
 */

import type { AdminEdgePacket } from "@/lib/admin/edgePacket";
import type { InformationEdgeInputs } from "./types";

export interface DerivedInformationEdgeInputs {
  inputs: InformationEdgeInputs;
  missingInputs: string[];
  /** 0..100 confidence in the derivation. 100 = every field present. */
  confidence: number;
}

const NEUTRAL = 50;

function present(n: unknown, missing: string[], name: string): number {
  if (typeof n === "number" && Number.isFinite(n)) return Math.max(0, Math.min(100, n));
  missing.push(name);
  return NEUTRAL;
}

/**
 * Derive the 9 InformationEdgeInputs from the packet's existing
 * AdminEdgePacket fields. Each mapping is documented inline.
 */
export function deriveInformationEdge(
  packet: AdminEdgePacket | null | undefined,
): DerivedInformationEdgeInputs {
  const missing: string[] = [];

  if (!packet) {
    // Nothing to read — every input is missing.
    return {
      inputs: {
        uniqueness: NEUTRAL,
        earliness: NEUTRAL,
        crowdingRisk: NEUTRAL,
        obviousness: NEUTRAL,
        hiddenPressure: NEUTRAL,
        rewardRemaining: NEUTRAL,
        signalRarity: NEUTRAL,
        crossAssetConfirmation: NEUTRAL,
        personalHistoricalEdge: NEUTRAL,
      },
      missingInputs: [
        "uniqueness", "earliness", "crowdingRisk", "obviousness",
        "hiddenPressure", "rewardRemaining", "signalRarity",
        "crossAssetConfirmation", "personalHistoricalEdge",
      ],
      confidence: 0,
    };
  }

  // uniqueness ≈ asymmetryScore (higher asymmetry = rarer payoff structure)
  const uniqueness = present(packet.asymmetryScore, missing, "uniqueness");

  // earliness ≈ timingScore (higher timing = earlier in the move)
  const earliness = present(packet.timingScore, missing, "earliness");

  // crowdingRisk: when the packet is at the top of the queue it is by
  // definition visible to anyone running the same scanner — high rank
  // → higher crowding. opportunityRankScore is 0..100; we use it
  // directly (high score → high crowding).
  const crowdingRisk = present(packet.opportunityRankScore, missing, "crowdingRisk");

  // obviousness ≈ trapRiskScore inverse? Actually trap-risk is "this looks
  // like a setup but isn't" — that is high obviousness with bad payoff.
  // We use trapRiskScore directly (high trap = high obviousness).
  const obviousness = present(packet.trapRiskScore, missing, "obviousness");

  // hiddenPressure: best proxy is volatilityScore (breakout-readiness)
  // combined with structureScore (clean structure on a stretched move).
  const volScore = typeof packet.volatilityScore === "number" ? packet.volatilityScore : null;
  const structScore = typeof packet.structureScore === "number" ? packet.structureScore : null;
  let hiddenPressure: number;
  if (volScore == null && structScore == null) {
    missing.push("hiddenPressure");
    hiddenPressure = NEUTRAL;
  } else {
    hiddenPressure = Math.round(((volScore ?? NEUTRAL) + (structScore ?? NEUTRAL)) / 2);
  }

  // rewardRemaining: best proxy is invalidationClarityScore + rrToTp2
  // (clear invalidation + plenty of R left to TP2).
  const invClarity = typeof packet.invalidationClarityScore === "number" ? packet.invalidationClarityScore : null;
  const rrTp2 = packet.riskReward?.rrToTp2 ?? null;
  let rewardRemaining: number;
  if (invClarity == null && rrTp2 == null) {
    missing.push("rewardRemaining");
    rewardRemaining = NEUTRAL;
  } else {
    const rrComponent = rrTp2 == null ? NEUTRAL : Math.max(0, Math.min(100, rrTp2 * 25));
    rewardRemaining = Math.round(((invClarity ?? NEUTRAL) + rrComponent) / 2);
  }

  // signalRarity: setupType-level proxy via optionsScore (options edge is
  // typically rarer than pure-price patterns). When options data is
  // unavailable, neutral and recorded as missing.
  const signalRarity = present(packet.optionsScore, missing, "signalRarity");

  // crossAssetConfirmation: prefer the explicit summary when present;
  // otherwise fall back to neutral and record as missing.
  const cross = packet.crossAssetConfluence;
  let crossAssetConfirmation: number;
  if (cross && typeof (cross as { score?: number }).score === "number") {
    crossAssetConfirmation = Math.max(0, Math.min(100, (cross as { score: number }).score));
  } else {
    missing.push("crossAssetConfirmation");
    crossAssetConfirmation = NEUTRAL;
  }

  // personalHistoricalEdge: no per-packet field exists yet — leave as
  // missing so the score is honest about what it does and does not know.
  missing.push("personalHistoricalEdge");
  const personalHistoricalEdge = NEUTRAL;

  const inputs: InformationEdgeInputs = {
    uniqueness,
    earliness,
    crowdingRisk,
    obviousness,
    hiddenPressure,
    rewardRemaining,
    signalRarity,
    crossAssetConfirmation,
    personalHistoricalEdge,
  };

  const TOTAL_FIELDS = 9;
  const confidence = Math.round(((TOTAL_FIELDS - missing.length) / TOTAL_FIELDS) * 100);

  return { inputs, missingInputs: missing, confidence };
}
