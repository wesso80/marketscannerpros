/**
 * lib/admin/portfolio-lab/createPortfolio.ts
 *
 * Creates the default ARCA Internal Fund with $200k starting balance.
 * Idempotent: returns the existing portfolio if one already exists.
 */

import {
  ARCA_BASE_CURRENCY,
  ARCA_DEFAULT_PORTFOLIO_NAME,
  ARCA_DEFAULT_SETTINGS,
  ARCA_DEFAULT_STARTING_BALANCE,
} from "./constants";
import { getDefaultPortfolio, insertPortfolio, insertJournal } from "./portfolioStore";
import type { ArcaPortfolio } from "./types";

export async function createDefaultArcaPortfolio(
  workspaceId: string,
): Promise<{ portfolio: ArcaPortfolio; created: boolean }> {
  const existing = await getDefaultPortfolio(workspaceId, ARCA_DEFAULT_PORTFOLIO_NAME);
  if (existing) return { portfolio: existing, created: false };

  const portfolio = await insertPortfolio({
    workspaceId,
    name: ARCA_DEFAULT_PORTFOLIO_NAME,
    startingBalance: ARCA_DEFAULT_STARTING_BALANCE,
    baseCurrency: ARCA_BASE_CURRENCY,
    settings: ARCA_DEFAULT_SETTINGS,
  });

  await insertJournal({
    workspaceId,
    portfolioId: portfolio.id,
    journalType: "REVIEW",
    title: `ARCA Internal Fund initialised at ${ARCA_BASE_CURRENCY} ${ARCA_DEFAULT_STARTING_BALANCE.toLocaleString()}`,
    arcaReasoning:
      "Simulated paper portfolio created. No broker connection. Sizing rules: 0.75% risk per trade, 5% max open portfolio risk, asset-class caps enforced. All fills are calculated from AdminEdgePacket levels and AdminMarketPacket prices.",
    evidence: [
      `starting_balance=${ARCA_DEFAULT_STARTING_BALANCE}`,
      `risk_per_trade_pct=${ARCA_DEFAULT_SETTINGS.riskPerTradePct}`,
      `max_open_portfolio_risk_pct=${ARCA_DEFAULT_SETTINGS.maxOpenPortfolioRiskPct}`,
    ],
  });

  return { portfolio, created: true };
}
