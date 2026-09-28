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
  unrealisedPnl: 0, initialRiskDollars: 500 } as ArcaPosition;
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

describe('paper exit risk and resting targets', () => {
  it('keeps original R after moving the stop to breakeven', async () => {
    const result = await markAndMaybeExit({ portfolio, position: { ...position, stopLoss: 100 }, currentPrice: 110 });
    expect(result.rMultiple).toBe(2);
  });
  it('keeps original R on manual close after tightening the stop', async () => {
    await manualSimClose({ portfolio, position: { ...position, stopLoss: 105 }, exitPrice: 110, reason: 'test' });
    expect(store.insertTrade).toHaveBeenCalledWith(expect.objectContaining({ rMultiple: 1.78 }));
  });
  it.each([null, undefined, 0, -1, NaN])('does not invent original risk when unavailable: %s', async risk => {
    await manualSimClose({ portfolio, position: { ...position, initialRiskDollars: risk }, exitPrice: 110, reason: 'test' });
    expect(store.insertTrade).toHaveBeenCalledWith(expect.objectContaining({ rMultiple: null }));
  });
  it.each(['LONG', 'SHORT'] as const)('fills nearest target when a %s quote crosses all targets', async side => {
    const short = side === 'SHORT';
    await markAndMaybeExit({ portfolio, position: { ...position, side,
      stopLoss: short ? 105 : 95, takeProfit1: short ? 70 : 130,
      takeProfit2: short ? 90 : 110, takeProfit3: short ? 80 : 120 },
      currentPrice: short ? 60 : 140 });
    expect(store.insertTrade).toHaveBeenCalledWith(expect.objectContaining({
      exitPrice: short ? 90 : 110, exitReason: 'TAKE_PROFIT',
    }));
  });
  it('ignores invalid targets instead of realizing a fake profit exit', async () => {
    const result = await markAndMaybeExit({ portfolio, position: { ...position,
      takeProfit1: 90, takeProfit2: NaN, takeProfit3: Infinity }, currentPrice: 110 });
    expect(result.exit).toBeNull();
  });
});

it('persists the candle exit, timestamp and fees after a reversal', async () => {
  const t = Date.parse('2026-09-27T00:00:00Z');
  const result = await markAndMaybeExit({ portfolio, position: { ...position,
    symbol: 'BTC', assetClass: 'crypto', openedAt: new Date(t).toISOString(), initialStopLoss: 95 },
    currentPrice: 99, candlePath: { symbol: 'BTC', market: 'CRYPTO', timeframe: '15m', source: 'admin_scan_bars',
      candles: [{ openAt: t, closeAt: t + 900000, open: 100, high: 125, low: 98, close: 99 }] } });
  expect(result.exit?.reason).toBe('TAKE_PROFIT');
  expect(store.insertTrade).toHaveBeenCalledWith(expect.objectContaining({
    exitPrice: 120, realisedPnl: 1880, rMultiple: 3.76, exitTime: new Date(t + 900000).toISOString(),
  }));
  expect(store.closePositionRow).toHaveBeenCalledWith(expect.objectContaining({ closedAt: new Date(t + 900000).toISOString() }));
});

it('journals a checkpoint only after a completed no-exit candle check', async () => {
  const { writeJournal } = await import('@/lib/admin/portfolio-lab/journalEngine');
  const t = Date.parse('2026-09-27T00:00:00Z');
  await markAndMaybeExit({ portfolio, position: { ...position, symbol: 'BTC',
    assetClass: 'crypto', openedAt: new Date(t).toISOString(), initialStopLoss: 95 },
    currentPrice: 101, candlePath: { symbol: 'BTC', market: 'CRYPTO', timeframe: '15m', source: 'admin_scan_bars',
      candles: [{ openAt: t, closeAt: t + 900000, open: 100, high: 105, low: 98, close: 101 }] } });
  expect(writeJournal).toHaveBeenCalledWith(expect.objectContaining({
    title: 'Paper candle checkpoint v1', positionId: 'pos', portfolioId: 'p', workspaceId: 'w',
    evidence: [JSON.stringify({ version: 1, through: new Date(t + 900000).toISOString(),
      entryAt: new Date(t).toISOString(), side: 'LONG', stop: 95, target: 120 })],
  }));
});
