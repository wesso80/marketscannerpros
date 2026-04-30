import type { AdminSymbolIntelligence } from "@/lib/admin/types";
import type { DataTruth } from "@/lib/engines/dataTruth";

export type TrapType =
  | "LATE_MOVE"
  | "LOW_LIQUIDITY"
  | "VOLATILITY_TRAP"
  | "NEWS_TRAP"
  | "EARNINGS_TRAP"
  | "CROWDED_OPTIONS"
  | "FALSE_BREAKOUT"
  | "OVEREXTENSION"
  | "CONFLICTING_TIMEFRAMES"
  | "STALE_DATA_FALSE_CONFIDENCE";

export interface TrapDetectionResult {
  trapRiskScore: number;
  trapType: TrapType[];
  reasons: string[];
  evidence: string[];
  whatWouldReduceTrapRisk: string[];
}

export interface TrapDetectionInput {
  snapshot: AdminSymbolIntelligence;
  dataTruth: DataTruth;
  hasNewsShock?: boolean;
  earningsWindowHours?: number | null;
  optionsCrowdingScore?: number | null;
  higherTimeframeConflict?: boolean;
}

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value));

export function detectTrapRisk(input: TrapDetectionInput): TrapDetectionResult {
  const reasons: string[] = [];
  const evidence: string[] = [];
  const reduceRisk: string[] = [];
  const trapType: TrapType[] = [];
  let risk = 0;

  if (input.snapshot.setupState === "TRIGGERED" && input.snapshot.triggerDistancePct != null && Math.abs(input.snapshot.triggerDistancePct) > 2.8) {
    trapType.push("LATE_MOVE");
    reasons.push("Setup appears extended from trigger distance.");
    evidence.push(`triggerDistancePct=${input.snapshot.triggerDistancePct.toFixed(2)}%`);
    reduceRisk.push("Wait for structure reset before escalating research priority.");
    risk += 12;
  }

  if ((input.snapshot.indicators.rvol ?? 0) < 0.7) {
    trapType.push("LOW_LIQUIDITY");
    reasons.push("Relative volume is below baseline.");
    evidence.push(`rvol=${(input.snapshot.indicators.rvol ?? 0).toFixed(2)}`);
    reduceRisk.push("Require stronger participation flow before alerting.");
    risk += 10;
  }

  if (input.snapshot.dve.trap) {
    trapType.push("FALSE_BREAKOUT");
    reasons.push("DVE trap flag is active.");
    evidence.push("dve.trap=true");
    reduceRisk.push("Wait for confirmation candle beyond invalidation zone.");
    risk += 14;
  }

  if (input.snapshot.dve.exhaustion) {
    trapType.push("OVEREXTENSION");
    reasons.push("DVE exhaustion flag is active.");
    evidence.push("dve.exhaustion=true");
    reduceRisk.push("Wait for volatility normalization and pullback confirmation.");
    risk += 11;
  }

  if ((input.snapshot.indicators.bbwpPercentile ?? 50) > 92) {
    trapType.push("VOLATILITY_TRAP");
    reasons.push("Volatility percentile is elevated.");
    evidence.push(`bbwpPercentile=${(input.snapshot.indicators.bbwpPercentile ?? 0).toFixed(1)}`);
    reduceRisk.push("Require cleaner structure after volatility expansion.");
    risk += 8;
  }

  if (input.hasNewsShock) {
    trapType.push("NEWS_TRAP");
    reasons.push("Recent news shock may distort short-horizon structure.");
    evidence.push("newsShock=true");
    reduceRisk.push("Recheck after news impact settles.");
    risk += 8;
  }

  if (input.earningsWindowHours != null && input.earningsWindowHours <= 48) {
    trapType.push("EARNINGS_TRAP");
    reasons.push("Earnings event proximity raises regime uncertainty.");
    evidence.push(`earningsWindowHours=${Math.round(input.earningsWindowHours)}`);
    reduceRisk.push("Wait for earnings event clarity or reduce alert urgency.");
    risk += 10;
  }

  if ((input.optionsCrowdingScore ?? 0) >= 70) {
    trapType.push("CROWDED_OPTIONS");
    reasons.push("Options positioning looks crowded.");
    evidence.push(`optionsCrowdingScore=${Math.round(input.optionsCrowdingScore ?? 0)}`);
    reduceRisk.push("Require confirming liquidity and trend persistence.");
    risk += 8;
  }

  if (input.higherTimeframeConflict) {
    trapType.push("CONFLICTING_TIMEFRAMES");
    reasons.push("Lower and higher timeframe structure are misaligned.");
    evidence.push("higherTimeframeConflict=true");
    reduceRisk.push("Require multi-timeframe alignment before high-priority ranking.");
    risk += 9;
  }

  if (input.dataTruth.status === "STALE" || input.dataTruth.status === "SIMULATED") {
    trapType.push("STALE_DATA_FALSE_CONFIDENCE");
    reasons.push("Data freshness is insufficient for high-confidence escalation.");
    evidence.push(`dataTruth=${input.dataTruth.status}`);
    reduceRisk.push("Refresh data feed before issuing alerts.");
    risk += 16;
  }

  return {
    trapRiskScore: clamp(Math.round(risk)),
    trapType,
    reasons,
    evidence,
    whatWouldReduceTrapRisk: Array.from(new Set(reduceRisk)),
  };
}
