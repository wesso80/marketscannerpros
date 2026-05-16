/**
 * lib/admin/portfolio-lab/constants.ts
 *
 * ARCA Portfolio Lab defaults. All values are conservative and
 * apply only to SIMULATED paper trading. No real-money execution.
 */

import type { ArcaPortfolioSettings } from "./types";

export const ARCA_DEFAULT_PORTFOLIO_NAME = "ARCA Internal Fund";
export const ARCA_DEFAULT_STARTING_BALANCE = 200_000;
export const ARCA_BASE_CURRENCY = "USD";

export const ARCA_DEFAULT_SETTINGS: ArcaPortfolioSettings = {
  riskPerTradePct: 0.75,
  maxSingleTradeRiskPct: 1.0,
  maxOpenPortfolioRiskPct: 5.0,
  maxAssetClassExposurePct: {
    equity: 50,
    crypto: 25,
    commodity: 20,
    options: 10,
    futures: 20,
  },
  maxCorrelatedThemeExposurePct: 20,
  maxTradesPerDay: 10,
  losingStreakWarn: 3,
  dailyDrawdownWarnPct: 2,
  hardDrawdownWarnPct: 5,
  feesPctEstimate: 0.05,
  slippagePctEstimate: 0.05,
  enabledAssetClasses: ["equity", "crypto", "commodity", "options", "futures"],
  enabledPlaybooks: null,
  minEdgePacketRankScore: 65,
  minEvidenceQualityScore: 60,
  benchmarkSymbol: "SPY",
};

/** Mandatory disclaimer attached to every ARCA output. */
export const ARCA_DISCLAIMER =
  "ARCA Autonomous Portfolio Lab is an admin-only SIMULATED paper trading environment. It does not place, route, or auto-execute real orders. All positions, P&L, and equity values are calculated from AdminEdgePacket decision levels and AdminMarketPacket prices. No broker integration exists.";
