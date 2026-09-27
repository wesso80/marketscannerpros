import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSplitAdjustedDaily, fetchDailyOhlcv } from '@/lib/admin/priceSeries';
import { longHoldingStress, serializePortfolioRisk, type PortfolioRiskSnapshot } from '@/lib/admin/portfolioRisk';
import { validateRiskMemo } from '@/lib/admin/riskMemo';
import { validateTechnicalNote } from '@/lib/admin/technicalNote';
import { composeSynthesis } from '@/lib/admin/researchSynthesis';
import { buildCandidates, type OptionContract, type OptionsSnapshot, type StrategyCandidate } from '@/lib/admin/optionsArchitect';
import { groundOptionsMemo, optionExpiryPnl } from '@/lib/admin/optionsMemoGrounding';
import type { OptionsArchitectMemo } from '@/lib/admin/optionsMemo';
import { fetchEarningsImpliedMove } from '@/lib/admin/optionsImpliedMove';
import { validateEarningsNote } from '@/lib/admin/earningsAnalyzer';
import { avFetchAdmin } from '@/lib/avRateGovernor';

vi.mock('@/lib/avRateGovernor', () => ({ avFetchAdmin: vi.fn() }));
const av = vi.mocked(avFetchAdmin);
const bar = (price: number, split = 1) => ({ '1. open': String(price), '2. high': String(price + 1), '3. low': String(price - 1), '4. close': String(price), '5. adjusted close': '1', '6. volume': '100', '8. split coefficient': String(split) });

beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('ALPHA_VANTAGE_API_KEY', 'test-key'); });
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe('corporate actions and long-only stress', () => {
  it('removes a 4:1 split jump without adjusting the ex-date bar twice', () => {
    const rows = parseSplitAdjustedDaily({ '2026-09-24': bar(400), '2026-09-25': bar(100, 4), '2026-09-26': bar(101) });
    expect(rows.map(b => b.close)).toEqual([100, 100, 101]);
    expect(rows.map(b => b.volume)).toEqual([400, 100, 100]);
    expect(rows[0].high).toBe(100.25);
  });
  it('handles a reverse split and ignores dividend-adjusted close for price levels', () => {
    const rows = parseSplitAdjustedDaily({ '2026-09-24': bar(10), '2026-09-25': bar(100, 0.1) });
    expect(rows.map(b => b.close)).toEqual([100, 100]);
    expect(rows[0].volume).toBe(10);
  });
  it('withholds raw daily data when split metadata is absent', async () => {
    const row = bar(100); delete (row as Record<string, string>)['8. split coefficient'];
    av.mockResolvedValue({ 'Time Series (Daily)': { '2026-09-25': row } });
    const result = await fetchDailyOhlcv('AAPL');
    expect(result.status).toBe('error');
    expect(result.bars).toEqual([]);
    expect(av.mock.calls[0][0]).toContain('function=TIME_SERIES_DAILY_ADJUSTED');
  });
  it('bounds an unlevered long loss at 100% without manufacturing missing beta', () => {
    expect(longHoldingStress(-55, 2.16345)).toBe(-100);
    expect(longHoldingStress(-34, 1.5)).toBe(-51);
    expect(longHoldingStress(-55, null)).toBeNull();
    expect(longHoldingStress(-55, NaN)).toBeNull();
  });
});

const riskSnapshot = () => ({ generatedAt: '2026-09-27', totalAllocationPct: 35,
  benchmark: { status: 'ok' }, portfolio: {}, sectorConcentration: [], correlations: [], missingFields: [], errors: [],
  holdings: [{ ticker: 'MSFT', allocationPct: 20 }, { ticker: 'NVDA', allocationPct: 15 }].map(h => ({ ...h, hv90: 25, beta252: 1.2, maxDrawdownPct: -30, stress2008Pct: -66, missingFields: [] })),
}) as unknown as PortfolioRiskSnapshot;
const riskMemo = () => ({ executiveSummary: '', opportunityScore: 50, evidenceQualityScore: 60, personalExposureFlag: 'none', confidenceStatement: '', whatConfirms: [], whatInvalidates: [], mainRisk: '', portfolioFindings: {}, holdingNotes: [], hedgingPlan: [], recommendedActions: [], closingParagraph: '', dashboard: riskSnapshot().holdings.map(h => ({ ticker: h.ticker, allocationPct: h.allocationPct, hv90Pct: h.hv90, beta252: h.beta252, maxDrawdownPct: h.maxDrawdownPct, stress2008Pct: h.stress2008Pct })) });
describe('portfolio input integrity', () => {
  it('sends original per-holding weights in the model packet', () => {
    const packet = serializePortfolioRisk(riskSnapshot());
    expect(packet).toMatch(/MSFT[^]*?allocationPct=20/);
    expect(packet).toMatch(/NVDA[^]*?allocationPct=15/);
  });
  it('accepts matching metrics and rejects the live-audit weight swap', () => {
    expect(validateRiskMemo(riskMemo(), riskSnapshot()).ok).toBe(true);
    const memo = riskMemo(); memo.dashboard[0].allocationPct = 15; memo.dashboard[1].allocationPct = 20;
    expect(validateRiskMemo(memo, riskSnapshot())).toMatchObject({ ok: false, reason: expect.stringContaining('MSFT allocationPct') });
  });
  it('rejects duplicate holdings and invented missing metrics', () => {
    const memo = riskMemo(); memo.dashboard[1] = memo.dashboard[0];
    expect(validateRiskMemo(memo, riskSnapshot()).ok).toBe(false);
    const snapshot = riskSnapshot(); snapshot.holdings[0].beta252 = null;
    expect(validateRiskMemo(riskMemo(), snapshot).ok).toBe(false);
  });
});

function technical(bias = 'bullish', entry = 345.4, stop = 333.1, target1 = 352, target2 = 359) {
  return { ticker: 'AAPL', tradePlanSummary: { bias, entryLevel: entry, stopLevel: stop, target1, target2, riskRewardRatio: '0.98R / 1.19R' }, recommendedAction: {}, opportunityScore: 50, evidenceQualityScore: 80, personalExposureFlag: 'none', confidenceStatement: '', whatConfirms: [], whatInvalidates: [], mainRisk: '', trendAnalysis: {}, supportResistance: {}, movingAverages: {}, rsi: {}, macd: {}, bbands: {}, volume: {}, fibonacci: {}, chartPattern: {}, verdictParagraph: '' };
}
describe('daily brief arithmetic and alignment', () => {
  it('recomputes both R multiples from the actual entry and stop', () => {
    const result = validateTechnicalNote(technical());
    expect(result.ok && result.note.tradePlanSummary.riskRewardRatio).toBe('0.54R / 1.11R');
  });
  it('handles shorts and rejects invalid stop/target geometry', () => {
    const result = validateTechnicalNote(technical('bearish', 100, 105, 90, 85));
    expect(result.ok && result.note.tradePlanSummary.riskRewardRatio).toBe('2.00R / 3.00R');
    expect(validateTechnicalNote(technical('bullish', 100, 100, 110, 115)).ok).toBe(false);
    expect(validateTechnicalNote(technical('bullish', 100, 95, 90, 115)).ok).toBe(false);
  });
  it('distinguishes a neutral verdict from absent data', () => {
    const f = { rating: { verdict: 'hold', conviction: 3 } } as Parameters<typeof composeSynthesis>[0];
    const t = { tradePlanSummary: { bias: 'bullish', setupQuality: 4 } } as Parameters<typeof composeSynthesis>[1];
    expect(composeSynthesis(f, t).alignment).toBe('mixed');
    expect(composeSynthesis(null, t).alignment).toBe('insufficient-data');
  });
});

function contract(type: 'call' | 'put', strike: number, delta = 0.3): OptionContract {
  return { contractID: `AAPL261023${type}${strike}`, type, strike, expiration: '2026-10-23', dte: 28, mid: 1, mark: 1, last: 1, bid: 0.9, ask: 1.1, volume: 100, openInterest: 1000, impliedVolatility: 0.3, delta, gamma: 0.01, theta: -0.1, vega: 0.2, rho: 0.01, spreadPct: 20, liquidity: 'ok' };
}
const condor: StrategyCandidate = { category: 'iron-condor', description: '', fits: ['neutral'], legs: [
  { side: 'short', qty: 1, contract: { ...contract('put', 330, -0.3), mid: 4.5, bid: 4.4, ask: 4.6, gamma: 0.02, theta: -0.2, vega: 0.25 } }, { side: 'long', qty: 1, contract: { ...contract('put', 320, -0.16), mid: 2.3, bid: 2.2, ask: 2.4, gamma: 0.015, theta: -0.15 } },
  { side: 'short', qty: 1, contract: { ...contract('call', 355, 0.28), mid: 2.1, bid: 2, ask: 2.2, gamma: 0.02, theta: -0.2, vega: 0.25 } }, { side: 'long', qty: 1, contract: { ...contract('call', 360, 0.16), mid: 1.35, bid: 1.3, ask: 1.4, gamma: 0.015, theta: -0.15 } },
], netCreditPerShare: 2.95, maxProfitPerShare: 2.95, maxLossPerShare: 7.05, marginEstimatePerShare: 7.05, breakevens: [327.05, 357.95], probabilityOfProfitPct: 65, netGreeks: { delta: 0.02, gamma: -0.01, theta: 0.1, vega: -0.1 }, worstLiquidity: 'ok', avgSpreadPct: 20, rationale: '' };
const optionSnapshot = (candidate = condor) => ({ ticker: 'AAPL', spot: 345, generatedAt: '2026-09-27T01:00:00Z', selectedExpiration: '2026-10-23', chainAsOfDate: '2026-09-25', chainContractCount: 1000, candidates: [candidate] }) as OptionsSnapshot;
const optionMemo = (category = 'iron-condor') => ({ tradeSetup: { category, contractsToOpen: 70 }, decisionSummary: { sizingCall: '70 contracts' }, outlookAssessment: {}, alternativesConsidered: [] }) as unknown as OptionsArchitectMemo;
describe('options position arithmetic', () => {
  it('prices unequal condor wings independently', () => {
    expect(optionExpiryPnl(condor, 345, 320)).toBe(-705);
    expect(optionExpiryPnl(condor, 345, 330)).toBe(295);
    expect(optionExpiryPnl(condor, 345, 355)).toBe(295);
    expect(optionExpiryPnl(condor, 345, 360)).toBe(-205);
    expect(optionExpiryPnl(condor, 345, 500)).toBe(-205);
  });
  it('uses 7 units and $4935 risk for a $5000 budget; scales Greeks and DTE', () => {
    const memo = groundOptionsMemo(optionMemo(), optionSnapshot(), 5000);
    expect(memo.tradeSetup.contractsToOpen).toBe(7);
    expect(memo.tradeSetup.totalCapitalAtRisk).toBe(4935);
    expect(memo.decisionSummary.sizingCall).toContain('7 strategy units');
    expect(memo.decisionSummary.sizingCall).not.toContain('70 contracts');
    expect(memo.tradeSetup.positionGreeks).toEqual({ delta: 14, gamma: -7, theta: 70, vega: -70 });
    expect(memo.selectedExpirationDte).toBe(26);
    expect(memo.tradeSetup.legs.every(l => l.dte === 26)).toBe(true);
    expect(memo.payoffNarrative.payoffTable.find(r => r.priceAtExpiry === 360)?.pnlPerContract).toBe(-205);
  });
  it('shows zero units for insufficient capital and rejects unknown/expired structures', () => {
    expect(groundOptionsMemo(optionMemo(), optionSnapshot(), 500).tradeSetup.contractsToOpen).toBe(0);
    expect(() => groundOptionsMemo(optionMemo('invented'), optionSnapshot(), 5000)).toThrow();
    expect(() => groundOptionsMemo(optionMemo(), { ...optionSnapshot(), generatedAt: '2026-10-24' }, 5000)).toThrow(/expired/);
  });
  it('includes the shares in a covered-call payoff and position delta', () => {
    const c: StrategyCandidate = { ...condor, category: 'covered-call', legs: [{ side: 'short', qty: 1, contract: contract('call', 110, 0.3) }], netCreditPerShare: 2, marginEstimatePerShare: 100, maxLossPerShare: 98, netGreeks: { delta: -0.3, gamma: -0.01, theta: 0.1, vega: -0.2 } };
    expect(optionExpiryPnl(c, 100, 120)).toBe(1200);
    const memo = groundOptionsMemo(optionMemo('covered-call'), { ...optionSnapshot(c), spot: 100 }, 10000);
    expect(memo.tradeSetup.positionGreeks.delta).toBe(70);
  });
  it('never labels different strikes a straddle', () => {
    const calls = [contract('call', 100, 0.5)];
    const puts = [contract('put', 95, -0.5), contract('put', 100, -0.6)];
    const c = buildCandidates({ spot: 100, calls, puts, outlook: 'volatile' }).find(c => c.category === 'long-straddle');
    expect(c?.legs.map(l => l.contract.strike)).toEqual([100, 100]);
  });
});

describe('earnings event window', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-27T12:00:00Z')); });
  it('does not call the options provider for an unknown or past event', async () => {
    expect((await fetchEarningsImpliedMove('AAPL', { earningsDate: null, underlying: 100 })).available).toBe(false);
    expect((await fetchEarningsImpliedMove('AAPL', { earningsDate: '2026-09-26', underlying: 100 })).available).toBe(false);
    expect(av).not.toHaveBeenCalled();
  });
  it('requires an expiry strictly after the event and measures DTE from retrieval', async () => {
    av.mockResolvedValue({ data: ['2026-09-28', '2026-10-02'].flatMap(expiration => ['call', 'put'].map(type => ({ expiration, type, strike: '100', mark: '2' }))) });
    const result = await fetchEarningsImpliedMove('AAPL', { earningsDate: '2026-09-28', underlying: 100 });
    expect(result).toMatchObject({ available: true, expiry: '2026-10-02', daysToExpiry: 5, impliedMovePct: 4 });
  });
  it('does not fall back to an expiry preceding the event', async () => {
    av.mockResolvedValue({ data: [{ expiration: '2026-09-28', type: 'call', strike: '100', mark: '2' }] });
    expect(await fetchEarningsImpliedMove('AAPL', { earningsDate: '2026-10-15', underlying: 100 })).toMatchObject({ available: false, expiry: null });
  });
  it('withholds a naked short straddle described as defined risk', () => {
    const raw = Object.fromEntries(['ticker', 'framing', 'decisionSummary', 'opportunityScore', 'evidenceQualityScore', 'personalExposureFlag', 'confidenceStatement', 'whatConfirms', 'whatInvalidates', 'mainRisk', 'earningsHistory', 'consensus', 'keyMetricsToWatch', 'segmentExpectations', 'managementGuidance', 'optionsImpliedMove', 'historicalPattern', 'preEarningsPositioning', 'postEarningsPlaybook', 'closingParagraph'].map(k => [k, '']));
    raw.preEarningsPositioning = { structure: 'Defined-risk short straddle' } as never;
    expect(validateEarningsNote(raw)).toMatchObject({ ok: false, reason: expect.stringContaining('protective legs') });
  });
});
