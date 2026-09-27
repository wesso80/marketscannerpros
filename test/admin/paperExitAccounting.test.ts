import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/admin/portfolio-lab/portfolioStore', () => ({
  closePositionRow: vi.fn(), insertTrade: vi.fn(), markPosition: vi.fn(),
  updatePortfolioBalances: vi.fn(), listOpenPositions: vi.fn(),
}));
vi.mock('@/lib/admin/portfolio-lab/journalEngine', () => ({ writeJournal: vi.fn() }));
vi.mock('@/lib/admin/arca-brain/recordTradeClosureLearning', () => ({ recordTradeClosureLearning: vi.fn(async () => {}) }));
import * as store from '@/lib/admin/portfolio-lab/portfolioStore';
import { markAndMaybeExit, manualSimClose } from '@/lib/admin/portfolio-lab/positionEngine';
import { ARCA_DEFAULT_SETTINGS } from '@/lib/admin/portfolio-lab/constants';
import type { ArcaPortfolio, ArcaPosition } from '@/lib/admin/portfolio-lab/types';

const portfolio = { id: 'p', workspaceId: 'w', currentCash: 190000, realisedPnl: 0, unrealisedPnl: 0,
  settings: { ...ARCA_DEFAULT_SETTINGS, slippagePctEstimate: 0, feesPctEstimate: 1 } } as ArcaPortfolio;
const position = { id: 'pos', side: 'LONG', symbol: 'TEST', quantity: 100, averageEntry: 100,
  currentPrice: 100, stopLoss: 95, takeProfit1: 120, takeProfit2: null, takeProfit3: null,
  unrealisedPnl: 0 } as ArcaPosition;
beforeEach(() => { vi.clearAllMocks(); vi.mocked(store.listOpenPositions).mockResolvedValue([]); vi.mocked(store.insertTrade).mockResolvedValue({ id: 't' } as never); });

describe('paper exits reconcile the cash ledger', () => {
  it('charges a long stop gap at the observed price and subtracts fees from cash', async () => {
    await markAndMaybeExit({ portfolio, position, currentPrice: 90 });
    expect(store.insertTrade).toHaveBeenCalledWith(expect.objectContaining({ exitPrice: 90, realisedPnl: -1090, feesEstimate: 90 }));
    expect(store.updatePortfolioBalances).toHaveBeenCalledWith(expect.objectContaining({ currentCash: 198910, totalEquity: 198910, realisedPnl: -1090 }));
  });
  it('charges a short stop gap and removes its liability', async () => {
    await markAndMaybeExit({ portfolio: { ...portfolio, currentCash: 210000 }, position: { ...position, side: 'SHORT', stopLoss: 105, takeProfit1: 80 }, currentPrice: 110 });
    expect(store.updatePortfolioBalances).toHaveBeenCalledWith(expect.objectContaining({ currentCash: 198890, totalEquity: 198890, realisedPnl: -1110 }));
  });
  it('reconciles a manual paper close using the same fee treatment', async () => {
    await manualSimClose({ portfolio, position, exitPrice: 110, reason: 'test' });
    expect(store.updatePortfolioBalances).toHaveBeenCalledWith(expect.objectContaining({ currentCash: 200890, totalEquity: 200890, realisedPnl: 890, unrealisedPnl: 0 }));
  });
});
