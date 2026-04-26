import type { CandidatePipeline } from "@/lib/operator/orchestrator";
import type { Bar } from "@/types/operator";

export type EliteGrade = "A+" | "A" | "B" | "C" | "D";

export type EliteSignalScore = {
  score: number;
  grade: EliteGrade;
  edgeScore: number;
  timingScore: number;
  liquidityScore: number;
  asymmetryScore: number;
  cleanlinessScore: number;
  riskPermissionScore: number;
  triggerDistancePct: number | null;
  setupState: "DISCOVERED" | "WATCHING" | "TRIGGERED" | "INVALIDATED" | "EXPIRED";
  featureImportance: { factor: string; score: number; weight: number; contribution: number; note: string }[];
  notes: string[];
};

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function roundPct(value: number) {
  return Math.round(value * 1000) / 10;
}

function grade(score: number): EliteGrade {
  if (score >= 90) return "A+";
  if (score >= 80) return "A";
  if (score >= 68) return "B";
  if (score >= 55) return "C";
  return "D";
}

function priceInsideEntry(pipeline: CandidatePipeline, price: number) {
  const zone = pipeline.candidate.entryZone;
  return price >= Math.min(zone.min, zone.max) && price <= Math.max(zone.min, zone.max);
}

function triggerDistance(pipeline: CandidatePipeline, price: number): number | null {
  const trigger = pipeline.candidate.triggerPrice ?? (pipeline.candidate.entryZone.min + pipeline.candidate.entryZone.max) / 2;
  if (!price || !trigger) return null;
  return Math.abs(price - trigger) / price;
}

function resolveSetupState(pipeline: CandidatePipeline, price: number): EliteSignalScore["setupState"] {
  const candidate = pipeline.candidate;
  if (!price) return "DISCOVERED";
  if (candidate.direction === "LONG" && candidate.invalidationPrice > 0 && price <= candidate.invalidationPrice) return "INVALIDATED";
  if (candidate.direction === "SHORT" && candidate.invalidationPrice > 0 && price >= candidate.invalidationPrice) return "INVALIDATED";
  if (priceInsideEntry(pipeline, price)) return "TRIGGERED";
  return pipeline.governance.finalPermission === "ALLOW" || pipeline.governance.finalPermission === "ALLOW_REDUCED" ? "WATCHING" : "DISCOVERED";
}

function componentWeights(pipeline: CandidatePipeline) {
  if (pipeline.candidate.market === "CRYPTO") {
    return {
      edgeScore: 0.23,
      timingScore: 0.19,
      liquidityScore: 0.19,
      asymmetryScore: 0.15,
      cleanlinessScore: 0.12,
      riskPermissionScore: 0.12,
    };
  }

  return {
    edgeScore: 0.27,
    timingScore: 0.18,
    liquidityScore: 0.15,
    asymmetryScore: 0.16,
    cleanlinessScore: 0.14,
    riskPermissionScore: 0.10,
  };
}

function importanceRow(factor: string, score: number, weight: number, note: string) {
  return {
    factor,
    score: roundPct(score),
    weight: Math.round(weight * 1000) / 10,
    contribution: Math.round(score * weight * 1000) / 10,
    note,
  };
}

export function computeEliteSignalScore(pipeline: CandidatePipeline, bars: Bar[] = []): EliteSignalScore {
  const ev = pipeline.verdict.evidence;
  const price = pipeline.lastPrice ?? bars[bars.length - 1]?.close ?? 0;
  const distance = triggerDistance(pipeline, price);
  const riskPermissionScore = pipeline.governance.finalPermission === "ALLOW"
    ? 1
    : pipeline.governance.finalPermission === "ALLOW_REDUCED"
      ? 0.72
      : pipeline.governance.finalPermission === "WAIT"
        ? 0.35
        : 0;
  const edgeScore = clamp((ev.regimeFit * 0.3) + (ev.structureQuality * 0.25) + (ev.symbolTrust * 0.25) + (ev.modelHealth * 0.2));
  const timingScore = clamp((ev.timeConfluence * 0.55) + (ev.volatilityAlignment * 0.3) + (distance == null ? 0.1 : clamp(1 - distance / 0.02, 0, 1) * 0.15));
  const liquidityScore = clamp((ev.participationFlow * 0.7) + (ev.crossMarketConfirmation * 0.3));
  const entry = (pipeline.candidate.entryZone.min + pipeline.candidate.entryZone.max) / 2;
  const stop = pipeline.candidate.invalidationPrice;
  const target = pipeline.candidate.targets?.[0] ?? 0;
  const stopDistance = entry && stop ? Math.abs(entry - stop) : 0;
  const targetDistance = entry && target ? Math.abs(target - entry) : 0;
  const rr = stopDistance > 0 ? targetDistance / stopDistance : 0;
  const asymmetryScore = clamp(rr / 2.5);
  const cleanlinessScore = clamp((ev.eventSafety * 0.35) + (ev.extensionSafety * 0.3) + (ev.crossMarketConfirmation * 0.2) + (pipeline.verdict.penalties.length ? 0.05 : 0.15));
  const weights = componentWeights(pipeline);

  const raw = (
    edgeScore * weights.edgeScore +
    timingScore * weights.timingScore +
    liquidityScore * weights.liquidityScore +
    asymmetryScore * weights.asymmetryScore +
    cleanlinessScore * weights.cleanlinessScore +
    riskPermissionScore * weights.riskPermissionScore
  ) * 100;
  const score = Math.round(raw * 10) / 10;
  const notes: string[] = [];
  if (riskPermissionScore < 0.7) notes.push("Risk permission is not fully clear.");
  if (asymmetryScore < 0.5) notes.push("Reward-to-risk asymmetry is below elite threshold.");
  if (liquidityScore < 0.5) notes.push("Participation or cross-market confirmation is weak.");
  if (cleanlinessScore < 0.6) notes.push("Setup has event, extension, or contradiction risk.");
  if (distance != null && distance > 0.02) notes.push("Trigger is not close enough yet.");

  return {
    score,
    grade: grade(score),
    edgeScore: roundPct(edgeScore),
    timingScore: roundPct(timingScore),
    liquidityScore: roundPct(liquidityScore),
    asymmetryScore: roundPct(asymmetryScore),
    cleanlinessScore: roundPct(cleanlinessScore),
    riskPermissionScore: roundPct(riskPermissionScore),
    triggerDistancePct: distance == null ? null : Math.round(distance * 10000) / 100,
    setupState: resolveSetupState(pipeline, price),
    featureImportance: [
      importanceRow("Edge", edgeScore, weights.edgeScore, "Regime fit, structure quality, symbol trust, and model health."),
      importanceRow("Timing", timingScore, weights.timingScore, "Time confluence, volatility alignment, and trigger proximity."),
      importanceRow("Liquidity", liquidityScore, weights.liquidityScore, pipeline.candidate.market === "CRYPTO" ? "Participation flow and cross-market confirmation carry higher crypto weight." : "Participation flow and cross-market confirmation."),
      importanceRow("Asymmetry", asymmetryScore, weights.asymmetryScore, "Reward-to-risk profile into the first target."),
      importanceRow("Cleanliness", cleanlinessScore, weights.cleanlinessScore, "Event safety, extension safety, and contradiction penalties."),
      importanceRow("Risk Permission", riskPermissionScore, weights.riskPermissionScore, "Risk governor permission after account, environment, and policy checks."),
    ].sort((a, b) => b.contribution - a.contribution),
    notes,
  };
}
