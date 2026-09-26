/** BT-8: with no losing trades, "Largest Loss" reads "None (no losing trades)", not the smallest winner in red. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { largestGainTrade, largestLossTrade, NO_LOSING_TRADES, NO_WINNING_TRADES } from '@/lib/backtest/displayMetric';

describe('largest loss / gain only count real losses and gains', () => {
  it('QA case: all winners, the lowest-return trade (+9.5%) is not a loss', () => {
    expect(largestLossTrade({ returnPercent: 9.5 })).toBeNull();
    expect(NO_LOSING_TRADES).toBe('None (no losing trades)');
  });
  it('a real loss is kept', () => {
    const t = { returnPercent: -3.2, symbol: 'AAPL' };
    expect(largestLossTrade(t)).toBe(t);
  });
  it('all losers: the "best" trade is not a gain', () => {
    expect(largestGainTrade({ returnPercent: -1.1 })).toBeNull();
    expect(NO_WINNING_TRADES).toBe('None (no winning trades)');
    expect(largestGainTrade({ returnPercent: 4 })).toEqual({ returnPercent: 4 });
  });
  it('breakeven, missing or non-numeric returns are neither', () => {
    expect(largestLossTrade({ returnPercent: 0 })).toBeNull();
    expect(largestGainTrade({ returnPercent: 0 })).toBeNull();
    expect(largestLossTrade(null)).toBeNull();
    expect(largestLossTrade({ returnPercent: 'x' })).toBeNull();
    expect(largestLossTrade({ returnPercent: '-2.5' })).toEqual({ returnPercent: '-2.5' });
  });
});

describe('every Largest Loss / Gain display uses the helpers', () => {
  it('Backtest hub Performance Detail', () => {
    const hub = readFileSync('components/backtest/BacktestHub.tsx', 'utf8');
    expect(hub).toContain('const l = largestLossTrade(result.worstTrade)');
    expect(hub).toContain("value={l ? fmtPct(n(l.returnPercent)) : NO_LOSING_TRADES}");
    expect(hub).toContain('const g = largestGainTrade(result.bestTrade)');
    expect(hub).not.toContain('label="Largest Loss" value={fmtPct(n(result.worstTrade.returnPercent))}');
  });
  it('Scanner backtest Largest Gain / Loss cards', () => {
    const page = readFileSync('app/tools/scanner/backtest/page.tsx', 'utf8');
    expect(page).toContain('const l = largestLossTrade(result.worstTrade)');
    expect(page).toContain(': NO_LOSING_TRADES}');
    expect(page).toContain(': NO_WINNING_TRADES}');
  });
  it('Best/Worst trade cards colour by the trade sign', () => {
    const pm = readFileSync('components/backtest/PerformanceMetrics.tsx', 'utf8');
    expect(pm).toContain("worstTrade.returnPercent < 0 ? 'text-red-500' : 'text-emerald-500'");
    expect(pm).toContain("bestTrade.returnPercent < 0 ? 'text-red-500' : 'text-emerald-500'");
  });
});
