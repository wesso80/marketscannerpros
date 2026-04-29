/**
 * Research Readiness Engine
 *
 * Hosts the "is this setup research-ready?" computation extracted from
 * lib/admin/truth-layer.ts as part of Phase 2 of the admin terminal upgrade.
 *
 * Research readiness ≠ execution readiness. This module declares whether a
 * setup is strong enough to **flag for the operator's research workflow**.
 * It does not authorize, route, or imply any broker action.
 *
 * The original truth-layer.ts continues to use these primitives via
 * re-export so existing imports keep working.
 */

import {
  CONFIDENCE_HIGH_MIN,
  CONFIDENCE_MODERATE_MIN,
  CONFIDENCE_WEAK_MIN,
  RESEARCH_READY_CONFIDENCE_MIN,
  THESIS_DEGRADED_CONFIDENCE_MIN,
  THESIS_STRONG_CONFIDENCE_MIN,
  THESIS_STRONG_STRUCTURE_MIN,
} from "../admin/constants";

export type ConfidenceClass = "HIGH" | "MODERATE" | "WEAK" | "INVALID";

export type ThesisState = "STRONG" | "DEGRADED" | "INVALID" | "UNKNOWN";

export interface ReadinessInput {
  finalPermission: "ALLOW" | "ALLOW_REDUCED" | "WAIT" | "BLOCK";
  confidenceScore: number;
  setupValid: boolean;
  triggerHit: boolean;
  structureQuality: number;
}

export interface Readiness {
  setupValid: boolean;
  researchReady: boolean;
  triggerHit: boolean;
  thesisState: ThesisState;
}

/** Confidence band classification. */
export function classifyConfidence(score: number): ConfidenceClass {
  if (score >= CONFIDENCE_HIGH_MIN) return "HIGH";
  if (score >= CONFIDENCE_MODERATE_MIN) return "MODERATE";
  if (score >= CONFIDENCE_WEAK_MIN) return "WEAK";
  return "INVALID";
}

/** Research-ready gating. */
export function isResearchReady(input: Pick<ReadinessInput, "finalPermission" | "confidenceScore">): boolean {
  return (
    (input.finalPermission === "ALLOW" || input.finalPermission === "ALLOW_REDUCED") &&
    input.confidenceScore >= RESEARCH_READY_CONFIDENCE_MIN
  );
}

/** Thesis state from confidence + structure. */
export function classifyThesis(confidenceScore: number, structureQuality: number): ThesisState {
  if (confidenceScore >= THESIS_STRONG_CONFIDENCE_MIN && structureQuality >= THESIS_STRONG_STRUCTURE_MIN) {
    return "STRONG";
  }
  if (confidenceScore >= THESIS_DEGRADED_CONFIDENCE_MIN) return "DEGRADED";
  return "INVALID";
}

/** Compose all readiness signals in one call. */
export function computeReadiness(input: ReadinessInput): Readiness {
  return {
    setupValid: input.setupValid,
    researchReady: isResearchReady(input),
    triggerHit: input.triggerHit,
    thesisState: classifyThesis(input.confidenceScore, input.structureQuality),
  };
}
