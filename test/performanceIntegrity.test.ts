import { describe, expect, it } from 'vitest';
import { computeKpis } from '@/lib/journal/computeKpis';
import { mapJournalResponseToPayload } from '@/lib/journal/mapPayload';
import { enrichTradesWithLivePrices, journalQuoteRequest, parseJournalQuote } from '@/lib/journal/markToMarket';
import { computePortfolioRisk } from '@/lib/portfolio/riskAnalytics';
import { splitPosition } from '@/lib/portfolio/closePosition';
import { runStrategy } from '@/lib/backtest/runStrategy';
import type { TradeRowModel } from '@/types/journal';
import type { PriceData } from '@/lib/backtest/providers';

const now = Date.parse('2026-09-22T12:00:00Z');
const trade = (id: string, pnlUsd: number, exitTs: string, extra: Partial<TradeRowModel> = {}): TradeRowModel => ({
  id, symbol: 'KITE', assetClass: 'equity', side: 'long', status: 'closed',
  entry: { price: 100, ts: '2026-01-01T00:00:00Z' }, exit: { price: 110, ts: exitTs }, qty: 10, pnlUsd, ...extra,
});

describe('Journal outcome periods and basis', () => {
  it('uses close time, excludes old/future/undated outcomes and preserves real zero', () => {
    const rows = [trade('old', 500, '2026-06-01'), trade('win', 100, '2026-09-20'),
      trade('loss', -50, '2026-09-21'), trade('zero', 0, '2026-09-21'),
      trade('future', 999, '2027-01-01'), trade('missing', 999, '')];
    const k = computeKpis(rows, null, now);
    expect(k.realizedPnl30d).toBe(50);
    expect(k.realizedPnlTotal).toBe(550);
    expect(k.winRate30d).toBeCloseTo(1 / 3);
    expect(k.profitFactor30d).toBe(2);
    expect(k.excludedClosedTrades).toBe(2);
    expect(k.equity).toBeNull();
  });
  it('includes a first loss in dollar drawdown and uses capital for percentage drawdown', () => {
    const rows = [trade('later', 200, '2026-09-21'), trade('first', -100, '2026-09-20')];
    expect(computeKpis(rows, null, now).maxDrawdown90dUsd).toBe(100);
    expect(computeKpis(rows, null, now).maxDrawdown90d).toBeNull();
    expect(computeKpis(rows, 10_000, now).maxDrawdown90d).toBeCloseTo(0.01);
    expect(computeKpis([...rows].reverse(), null, now)).toEqual(computeKpis(rows, null, now));
  });
  it('does not manufacture a numeric profit factor or empty-sample win rate', () => {
    expect(computeKpis([], null, now).winRate30d).toBeNull();
    const k = computeKpis([trade('win', 100, '2026-09-20')], null, now);
    expect(k.profitFactor30d).toBeNull();
    expect(k.profitFactorLabel).toBe('No losing trades');
  });
  it('orders cumulative P&L by exit date and preserves degraded health', () => {
    const payload = mapJournalResponseToPayload({ degraded: true, entries: [
      { id: 1, exitDate: '2026-09-21', pl: 20 }, { id: 2, exitDate: '2026-09-20', pl: -10 },
    ] }, now);
    expect(payload.equityCurve?.points.map(p => p.value)).toEqual([-10, 10]);
    expect(payload.header.health).toBe('degraded');
  });
});

describe('Journal quote identity and observation time', () => {
  const stock = trade('stock', 0, '', { status: 'open' });
  const crypto = { ...stock, id: 'crypto', symbol: 'KITE-USD', assetClass: 'crypto' as const, entry: { ...stock.entry, price: 0.2 } };
  it('keeps identical stock/crypto tickers in separate quote keys', () => {
    expect(journalQuoteRequest(stock)?.key).toBe('stock:KITE');
    expect(journalQuoteRequest(crypto)?.key).toBe('crypto:KITE');
    const rows = enrichTradesWithLivePrices([stock, crypto], {
      'stock:KITE': { price: 110, observedAt: null, retrievedAt: new Date(now).toISOString() },
      'crypto:KITE': { price: 0.3, observedAt: null, retrievedAt: new Date(now).toISOString() },
    });
    expect(rows[0].pnlUsd).toBe(100);
    expect(rows[1].pnlUsd).toBeCloseTo(1);
    expect(rows[0].exit).toEqual(stock.exit); // a quote is not a trade exit
  });
  it('never substitutes the underlying stock quote for an option or future', () => {
    expect(journalQuoteRequest({ ...stock, tradeType: 'Options' })).toBeNull();
    expect(journalQuoteRequest({ ...stock, tradeType: 'Futures' })).toBeNull();
  });
  it('rejects stale/future/nonfinite observations and does not invent provider time', () => {
    expect(parseJournalQuote({ ok: true, price: 1, observedAt: new Date(now - 16 * 60_000).toISOString() }, now)).toBeNull();
    expect(parseJournalQuote({ ok: true, price: 1, observedAt: new Date(now + 120_000).toISOString() }, now)).toBeNull();
    expect(parseJournalQuote({ ok: true, price: Infinity }, now)).toBeNull();
    expect(parseJournalQuote({ ok: true, price: 1, timestamp: new Date(now).toISOString() }, now)?.observedAt).toBeNull();
  });
});

const history = (values: number[]) => values.map((totalValue, i) => ({ timestamp: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(), totalValue, basis: 'account_equity_v2' }));
describe('Portfolio flow-adjusted risk', () => {
  it('does not turn a withdrawal or deposit into performance or drawdown', () => {
    const k = computePortfolioRisk(history([10000, 5000, 5000, 7000, 7000]), [
      { entry_type: 'withdrawal', amount: 5000, effective_date: '2026-09-02T18:00:00Z' },
      { entry_type: 'deposit', amount: 2000, effective_date: '2026-09-04T12:00:00Z' },
    ]);
    expect(k?.maxDrawdown).toBe(0);
    expect(k?.avgDailyReturn).toBe(0);
    expect(k?.annualizedSharpe).toBeNull();
  });
  it('links returns for drawdown even when flows change capital', () => {
    const k = computePortfolioRisk(history([10000, 15000, 13500, 14850, 14850]), [
      { entry_type: 'deposit', amount: 5000, effective_date: '2026-09-02' },
    ]);
    expect(k?.maxDrawdown).toBeCloseTo(10);
    expect(k?.currentDrawdown).toBeCloseTo(1);
    expect(k?.var95).toBeNull();
    expect(k?.periodsPerYear).toBe(365.25);
  });
  it('withholds daily risk across gaps, capital resets, and unknown cash flows', () => {
    const rows = history([10000, 10000, 0, 10000, 10000]);
    expect(computePortfolioRisk(rows, [])).toBeNull();
    expect(computePortfolioRisk(history([1, 2, 3, 4, 5]), null)).toBeNull();
    const gap = history([1, 2, 3, 4, 5]); gap[4].timestamp = '2026-09-08';
    expect(computePortfolioRisk(gap, [])).toBeNull();
  });
  it('reports zero historical loss VaR for an all-gain sample, not abs(gain)', () => {
    expect(computePortfolioRisk(history(Array.from({ length: 21 }, (_, i) => 10000 + i * 100)), [])?.var95).toBe(0);
  });
});

describe('Partial closes preserve both sides of the ledger', () => {
  it.each(['LONG', 'SHORT'] as const)('%s half close reconciles with remaining unrealised P&L', side => {
    const pl = side === 'LONG' ? 200 : -200;
    const p = { id: 1, side, quantity: 10, entryPrice: 100, currentPrice: 120, pl, plPercent: pl / 10 };
    const result = splitPosition(p, 0.5, 120, '2026-09-22', 2);
    expect(result.closed.quantity + result.remaining!.quantity).toBe(10);
    expect(result.closed.realizedPL + result.remaining!.pl).toBe(pl);
  });
  it('rejects invalid closes and allows a genuine zero-price full loss', () => {
    const p = { id: 1, side: 'LONG' as const, quantity: 10, entryPrice: 100, currentPrice: 120, pl: 200, plPercent: 20 };
    expect(() => splitPosition(p, 0.5, -1, '2026-09-22', 2)).toThrow();
    expect(splitPosition(p, 1, 0, '2026-09-22', 2).closed.realizedPL).toBe(-1000);
  });
});

describe('Backtest net cost reconciliation', () => {
  const data: PriceData = Object.fromEntries(Array.from({ length: 100 }, (_, i) => {
    const close = i < 50 ? 95 : 105;
    return [new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), { open: close, high: close * 1.005, low: close * 0.995, close, volume: 1_000_000 }];
  }));
  it('applies explicit crypto fees to a USD ticker and reconciles net dollars to net percent', () => {
    const crypto = runStrategy('ema_crossover', data, 10000, '2026-01-01', '2026-04-10', 'BTC-USD', 'daily', 'crypto');
    const stock = runStrategy('ema_crossover', data, 10000, '2026-01-01', '2026-04-10', 'BTC-USD', 'daily', 'stock');
    expect(crypto.trades.length).toBeGreaterThan(0);
    crypto.trades.forEach((t, i) => {
      expect(t.returnPercent).toBeCloseTo(t.return / 9500 * 100);
      expect(t.return).toBeLessThan(stock.trades[i].return);
      const qty = 9500 / t.entry;
      const gross = (t.side === 'LONG' ? t.exit - t.entry : t.entry - t.exit) * qty;
      expect(t.return).toBeCloseTo(gross - (t.entry + t.exit) * qty * 0.002);
    });
  });
});
