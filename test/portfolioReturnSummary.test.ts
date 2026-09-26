import { describe, it, expect } from 'vitest';
import { measuredDrawdownPct, portfolioReturns, portfolioStateLabels } from '@/lib/portfolio/returnSummary';

describe('portfolioReturns (TR-3)', () => {
  it('Total return includes realized P&L; open return is unrealized / open cost', () => {
    // $10k account, +$1,500 realized on closed trades, one open position down $200 on $2,000 cost.
    const r = portfolioReturns({ unrealizedPL: -200, realizedPL: 1500, openCost: 2000, startingCapital: 10000, netDeposits: 0 });
    expect(r.totalReturnPct).toBeCloseTo(13); // was shown as -10% before
    expect(r.openReturnPct).toBeCloseTo(-10);
  });
  it('counts deposits in the capital base and is null without one', () => {
    expect(portfolioReturns({ unrealizedPL: 0, realizedPL: 500, openCost: 0, startingCapital: 5000, netDeposits: 5000 }).totalReturnPct).toBeCloseTo(5);
    expect(portfolioReturns({ unrealizedPL: 0, realizedPL: 500, openCost: 0, startingCapital: 0, netDeposits: 0 }).totalReturnPct).toBeNull();
  });
});

describe('measuredDrawdownPct', () => {
  const clean = Array.from({ length: 5 }, () => ({ basis: 'account_equity_v2', totalValue: 10000 }));
  it('is null until 5 clean equity snapshots and risk analytics exist', () => {
    expect(measuredDrawdownPct(clean.slice(0, 4), { currentDrawdown: 30 })).toBeNull();
    expect(measuredDrawdownPct([...clean.slice(0, 4), { basis: 'legacy_position_value', totalValue: 1 }], { currentDrawdown: 30 })).toBeNull();
    expect(measuredDrawdownPct(clean, null)).toBeNull();
    expect(measuredDrawdownPct(clean, { currentDrawdown: 12.5 })).toBe(12.5);
  });
});

describe('portfolioStateLabels', () => {
  it('a losing open position is not labelled a drawdown without a measured drawdown', () => {
    const l = portfolioStateLabels({ totalReturnPct: -25, drawdownPct: null, concentrationPct: 20 });
    expect(l.portfolioHealthLabel).toBe('Below Baseline');
    expect(l.riskLoadLabel).toBe('Low');
    expect(l.edgeStateLabel).toBe('Neutral');
    expect(l.biasLabel).toBe('Bearish');
  });
  it('uses the measured drawdown from peak equity for drawdown labels', () => {
    const l = portfolioStateLabels({ totalReturnPct: 4, drawdownPct: 22, concentrationPct: 20 });
    expect(l.portfolioHealthLabel).toBe('Elevated Drawdown');
    expect(l.riskLoadLabel).toBe('High');
    expect(l.edgeStateLabel).toBe('Defensive');
  });
  it('keeps return- and concentration-based labels', () => {
    expect(portfolioStateLabels({ totalReturnPct: 15, drawdownPct: 0, concentrationPct: 20 })).toMatchObject({ portfolioHealthLabel: 'Above Baseline', edgeStateLabel: 'Offensive', biasLabel: 'Bullish' });
    expect(portfolioStateLabels({ totalReturnPct: 0, drawdownPct: null, concentrationPct: 60 }).riskLoadLabel).toBe('High');
  });
});
