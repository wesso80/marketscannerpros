/**
 * Earnings Risk Engine — Phase 10
 *
 * Classifies equity earnings risk by consuming earnings calendar data
 * and resolving whether the symbol has near-term earnings events.
 *
 * Replaces the UNKNOWN default with real classifications where data available.
 *
 * Classifies into:
 * - NO_NEAR_TERM_EARNINGS: No events within horizon
 * - EARNINGS_SOON: Event in 1..5 trading days
 * - EARNINGS_TODAY: Event today or tomorrow
 * - POST_EARNINGS_DRIFT: Traded recent earnings, volatility expected to persist
 * - EVENT_RISK_HIGH: Earnings or major catalyst nearby
 * - UNKNOWN: Data unavailable or asset class unsupported
 */

import type { DataTruth } from "@/lib/engines/dataTruth";

export type EarningsRiskClassification =
  | "NO_NEAR_TERM_EARNINGS"
  | "EARNINGS_SOON"
  | "EARNINGS_TODAY"
  | "POST_EARNINGS_DRIFT"
  | "EVENT_RISK_HIGH"
  | "UNKNOWN";

export interface EarningsRisk {
  symbol: string;
  assetClass: "equity" | "crypto" | "forex" | "index";

  // Classification
  classification: EarningsRiskClassification;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

  // Event Details
  daysUntilNextEvent?: number;
  nextEventDate?: string | null;
  nextEventType?: "EARNINGS" | "DIVIDEND" | "SPLIT" | "ACQUISITION" | "OTHER" | "UNKNOWN";
  historicalVolatility?: number; // % change typical on earnings day

  // Context
  postEarningsDriftDays?: number; // how many days post-event
  consecutiveBeats?: number; // beat count (can increase risk if too predictable)
  previousMissCount?: number; // miss streak

  // Market Seasonality
  earningsSeasonNow: boolean; // is the market broadly in earnings season?
  sectorEarningsActivity: "EARLY" | "PEAK" | "LATE" | "OFF_SEASON";

  // Catalyst Window
  hasMajorCatalyst: boolean;
  catalystWindow?: string; // "Today", "This Week", "Next Week", "Later"

  // Data Quality
  dataTruth: DataTruth;
  missingInputs: string[];
  note: string;
}

/**
 * Compute earnings risk classification.
 * Returns UNKNOWN with warning when calendar data unavailable.
 */
export async function computeEarningsRisk(input: {
  symbol: string;
  assetClass: "equity" | "crypto" | "forex" | "index";
  market?: string;
  currentDate?: Date;
  dataTruth?: DataTruth;
}): Promise<EarningsRisk> {
  const symbol = input.symbol.toUpperCase();
  const assetClass = input.assetClass;
  const currentDate = input.currentDate || new Date();
  const missingInputs: string[] = [];

  const dataTruth = input.dataTruth || {
    status: "MISSING" as const,
    trustScore: 0,
    ageSec: 99999,
    thresholds: { liveSec: 300, staleSec: 900 },
    notes: ["earnings calendar data not available"],
  };

  // Non-equity assets don't have earnings
  if (assetClass !== "equity") {
    missingInputs.push("Earnings calendar not applicable for non-equities");
    return {
      symbol,
      assetClass,
      classification: "UNKNOWN",
      riskLevel: "LOW",
      earningsSeasonNow: false,
      sectorEarningsActivity: "OFF_SEASON",
      hasMajorCatalyst: false,
      dataTruth,
      missingInputs,
      note: "Earnings context not applicable for this asset class.",
    };
  }

  // When calendar data is unavailable, return UNKNOWN
  missingInputs.push("Earnings calendar endpoint not wired");

  return {
    symbol,
    assetClass,
    classification: "UNKNOWN",
    riskLevel: "MEDIUM", // default to MEDIUM when unknown
    nextEventDate: null,
    nextEventType: "UNKNOWN",
    daysUntilNextEvent: undefined,
    historicalVolatility: undefined,
    postEarningsDriftDays: undefined,
    consecutiveBeats: undefined,
    previousMissCount: undefined,
    earningsSeasonNow: false, // conservative default
    sectorEarningsActivity: "OFF_SEASON",
    hasMajorCatalyst: false,
    dataTruth,
    missingInputs,
    note: "Earnings window unavailable from calendar data; treat as unknown. Wire Alpha Vantage or external earnings calendar in next iteration.",
  };
}

/**
 * Augment earnings risk with analyst estimates if available.
 * (Placeholder for future integration with Seeking Alpha, Yahoo Finance, etc.)
 */
export function enrichEarningsWithEstimates(
  earningsRisk: EarningsRisk,
  estimates?: { expectedEPS?: number; consensusEPS?: number; revisionTrend?: "UP" | "DOWN" | "STABLE" },
): EarningsRisk {
  if (!estimates) return earningsRisk;

  // If estimates conflict with recent consensus, could elevate risk
  if (earningsRisk.classification === "EARNINGS_SOON" || earningsRisk.classification === "EARNINGS_TODAY") {
    if (estimates.revisionTrend === "DOWN") {
      return {
        ...earningsRisk,
        riskLevel: "HIGH",
        note: "Earnings forthcoming with downward estimate revisions; elevated catalyst risk.",
      };
    }
  }

  return earningsRisk;
}
