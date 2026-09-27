import { listOpenPositions, updatePortfolioBalances } from './portfolioStore';
import { paperEquity } from './paperEquity';
import type { ArcaPortfolio } from './types';

export async function refreshPaperBalances(portfolio: ArcaPortfolio, cash: number, realisedPnl: number): Promise<void> {
  const positions = await listOpenPositions(portfolio.workspaceId, portfolio.id);
  await updatePortfolioBalances({
    portfolioId: portfolio.id, currentCash: cash, realisedPnl,
    unrealisedPnl: Math.round(positions.reduce((sum, p) => sum + p.unrealisedPnl, 0) * 100) / 100,
    totalEquity: paperEquity(cash, positions),
  });
}
