import { beforeEach, afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/admin/portfolio-lab/portfolioStore', () => ({
  insertSimOrder: vi.fn(), updateSimOrderStatus: vi.fn(), insertPosition: vi.fn(),
  listOpenPositions: vi.fn(), updatePortfolioBalances: vi.fn(), closePositionRow: vi.fn(),
  insertTrade: vi.fn(), markPosition: vi.fn(),
}));
vi.mock('@/lib/admin/portfolio-lab/journalEngine', () => ({ writeJournal: vi.fn() }));
vi.mock('@/lib/admin/arca-brain/recordTradeClosureLearning', () => ({ recordTradeClosureLearning: vi.fn(async () => {}) }));
import * as store from '@/lib/admin/portfolio-lab/portfolioStore';
import { writeJournal } from '@/lib/admin/portfolio-lab/journalEngine';
import { recordTradeClosureLearning } from '@/lib/admin/arca-brain/recordTradeClosureLearning';
import { createSimulatedOrder, fillOrderAndOpenPosition, shouldFill } from '@/lib/admin/portfolio-lab/simulatedOrderEngine';
import { markAndMaybeExit, manualSimClose } from '@/lib/admin/portfolio-lab/positionEngine';
import { ARCA_DEFAULT_SETTINGS } from '@/lib/admin/portfolio-lab/constants';
import type { ArcaPortfolio, ArcaPosition, ArcaSimOrder } from '@/lib/admin/portfolio-lab/types';
const start = Date.parse('2026-09-28T00:00:00Z');
let portfolio: ArcaPortfolio, positions: ArcaPosition[];
beforeEach(() => {
  vi.clearAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(start + 3600000);
  portfolio = { id: 'p', workspaceId: 'w', mode: 'SIMULATED', status: 'ACTIVE', startingBalance: 10000,
    currentCash: 10000, totalEquity: 10000, realisedPnl: 0, unrealisedPnl: 0,
    settings: { ...ARCA_DEFAULT_SETTINGS, slippagePctEstimate: 0.1, feesPctEstimate: 0.1 } } as ArcaPortfolio;
  positions = [];
  vi.mocked(store.insertSimOrder).mockImplementation(async input => ({ ...input, id: 'o' } as ArcaSimOrder));
  vi.mocked(store.insertPosition).mockImplementation(async input => {
    const p = { ...input, id: 'pos', openedAt: new Date(start).toISOString(), currentPrice: input.averageEntry,
      unrealisedPnl: 0, initialRiskDollars: Math.abs(input.averageEntry - input.stopLoss!) * input.quantity,
      initialStopLoss: input.stopLoss } as ArcaPosition;
    positions.push(p); return p;
  });
  vi.mocked(store.listOpenPositions).mockImplementation(async () => [...positions]);
  vi.mocked(store.updatePortfolioBalances).mockImplementation(async update => { Object.assign(portfolio, update); });
  vi.mocked(store.closePositionRow).mockImplementation(async () => { positions = []; });
  vi.mocked(store.insertTrade).mockImplementation(async input => ({ ...input, id: 'trade' } as never));
});
afterEach(() => vi.restoreAllMocks());
async function enter(side: 'LONG' | 'SHORT' = 'LONG') {
  const order = await createSimulatedOrder({ portfolio, symbol: 'BTC', assetClass: 'crypto', side,
    orderType: 'MARKET_SIM', plannedEntry: 100, triggerPrice: 100, quantity: 10, notional: 1000,
    stopLoss: side === 'LONG' ? 90 : 110, takeProfit1: side === 'LONG' ? 120 : 80,
    takeProfit2: null, takeProfit3: null, sourceEdgePacketId: 'fixture', playbookId: 'test',
    createdReason: 'Isolated mechanical validation', arcaConfidence: null });
  expect(shouldFill(order, 100)).toBe(true);
  const position = await fillOrderAndOpenPosition({ portfolio: { ...portfolio }, order, currentPrice: 100 });
  expect(portfolio.totalEquity).toBe(9999);
  expect(portfolio.realisedPnl).toBe(-1);
  expect(writeJournal).toHaveBeenCalledWith(expect.objectContaining({ positionId: 'pos',
    evidence: expect.arrayContaining([JSON.stringify({ version: 'paper-fill-accounting.v1', entryFee: 1 })]) }));
  return position;
}
it.each([
  { side: 'LONG' as const, price: 125, net: 195.60, fee: 2.20, fill: 119.88, reason: 'TAKE_PROFIT' },
  { side: 'LONG' as const, price: 85, net: -153.70, fee: 1.85, fill: 84.915, reason: 'STOP_LOSS' },
  { side: 'SHORT' as const, price: 75, net: 196.40, fee: 1.80, fill: 80.08, reason: 'TAKE_PROFIT' },
  { side: 'SHORT' as const, price: 115, net: -154.30, fee: 2.15, fill: 115.115, reason: 'STOP_LOSS' },
])('reconciles $side $reason through production fill/exit/balance/journal functions', async c => {
  const position = await enter(c.side);
  const result = await markAndMaybeExit({ portfolio: { ...portfolio }, position, currentPrice: c.price });
  expect(result.exit?.exitPrice).toBeCloseTo(c.fill, 6);
  expect(result.exit?.trade).toMatchObject({ realisedPnl: c.net, feesEstimate: c.fee, exitReason: c.reason });
  expect(portfolio.currentCash).toBeCloseTo(10000 + c.net, 2);
  expect(portfolio.totalEquity).toBe(portfolio.currentCash);
  expect(portfolio.realisedPnl).toBe(c.net);
  expect(positions).toHaveLength(0);
  expect(recordTradeClosureLearning).toHaveBeenCalledWith(expect.objectContaining({ trade: expect.objectContaining({ realisedPnl: c.net }) }));
});
it('a flat manual round trip loses both entry/exit fees and both slippage charges', async () => {
  const position = await enter();
  const trade = await manualSimClose({ portfolio: { ...portfolio }, position, exitPrice: 100, reason: 'replay' });
  expect(trade.realisedPnl).toBe(-4);
  expect(trade.feesEstimate).toBe(2);
  expect(portfolio.currentCash).toBe(9996);
  expect(portfolio.realisedPnl).toBe(-4);
});
it('settles an intrabar target followed by a reversal using the earlier candle evidence', async () => {
  const position = await enter();
  const result = await markAndMaybeExit({ portfolio: { ...portfolio }, position, currentPrice: 99,
    candlePath: { symbol: 'BTC', market: 'CRYPTO', timeframe: '15m', source: 'admin_scan_bars',
      candles: [{ openAt: start, closeAt: start + 900000, open: 100, high: 121, low: 99, close: 99 }] } });
  expect(result.exit?.trade).toMatchObject({ exitReason: 'TAKE_PROFIT', realisedPnl: 195.6,
    exitTime: new Date(start + 900000).toISOString() });
  expect(portfolio.currentCash).toBe(10195.6);
});
it('does not create a position when cash covers notional but not the fee', async () => {
  portfolio.currentCash = 1001;
  await expect(enter()).rejects.toThrow('including entry fee');
  expect(store.insertPosition).not.toHaveBeenCalled();
  expect(store.updateSimOrderStatus).not.toHaveBeenCalled();
});
it('crypto paper exit reconciles fees without restarting legacy learning jobs',async()=>{
 const position=await enter();
 await markAndMaybeExit({portfolio:{...portfolio},position,currentPrice:125,skipLearning:true});
 expect(portfolio.currentCash).toBe(10195.6);
 expect(recordTradeClosureLearning).not.toHaveBeenCalled();
});
