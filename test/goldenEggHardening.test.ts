import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/coingecko', () => ({
  getOHLC: vi.fn(), getOHLCRange: vi.fn(), getMarketChartRange: vi.fn(), resolveSymbolToId: vi.fn(), getCoinDetail: vi.fn(), COINGECKO_ID_MAP: { BTC: 'bitcoin' },
  getAggregatedFundingRates: vi.fn(), getAggregatedOpenInterest: vi.fn(), getGlobalData: vi.fn(),
}));

import { assessTimingEvidence, sanitizeTimeConfluence, timingVerdict, describeLevelRelation, TIMING_HARD_GATE } from '../lib/goldenEgg/timing';
import { fetchCryptoDerivatives, type TimeConfluenceData } from '../lib/goldenEggFetchers';
import { getAggregatedOpenInterest } from '../lib/coingecko';
import { adxStrength, rsiRead, dveStrengthLabel, classifySetup, computeRiskQuality, computeStructureQuality } from '../lib/goldenEgg/semantics';
import { filterRelevantNews, classifyCatalyst, summarizeNews, avTickerKey } from '../lib/goldenEgg/newsRelevance';
import { selectCanonicalExpiry, summarizeChain } from '../lib/goldenEgg/optionsChain';
import { describeMultiple, periodLabels, parseEarningsCalendarCsv, nextEarningsFromCalendar, growthPhrase } from '../lib/goldenEgg/fundamentalsContext';
import { buildNetworkContext, relativeStrength } from '../lib/goldenEgg/networkContext';
import { trendFromLevels, relate, summarizeCrossMarket } from '../lib/goldenEgg/crossMarket';
import { evaluateDataTrust, isEquitySessionOpen } from '../lib/scanner/dataTrust';
import * as scannerMath from '../lib/scanner/indicatorMath';

const DAY = 86_400_000;

function tc(over: Partial<TimeConfluenceData> = {}): TimeConfluenceData {
  return {
    confidence: 83, direction: 'bearish', signalStrength: 'no_signal', banners: ['EXTREME BEARISH'],
    scoreBreakdown: { directionScore: -100, clusterScore: 100, decompressionScore: 20, activeTFs: 1, hasHigherTF: true },
    decompression: { activeCount: 1, clusteredCount: 0, clusteringRatio: 0, netPullDirection: 'bearish', reasoning: '', pulls: [] },
    candleCloseConfluence: { confluenceScore: 19, confluenceRating: 'low', closingNowCount: 1, closingNowTFs: ['5m'], closingSoonCount: 3, peakConfluenceIn: 5, bestEntryWindow: { startMins: 0, endMins: 30, reason: '' }, isMonthEnd: false, isWeekEnd: false },
    mid50Levels: [], prediction: { direction: 'bearish', confidence: 83, reasoning: '', targetLevel: 0, expectedMoveTime: '1m (5m close)' },
    closeSchedule: [
      { tf: '5m', tfMinutes: 5, nextCloseAt: '', minsToClose: 1, weight: 0.2, mid50Level: null, distanceToMid50: null, pullDirection: null, category: 'intraday' },
      { tf: '1D', tfMinutes: 1440, nextCloseAt: '', minsToClose: 1200, weight: 10, mid50Level: 7.43, distanceToMid50: 2.3, pullDirection: 'down', category: 'daily' },
    ],
    decompressionTarget: { price: 7.13, direction: 'down', totalWeight: 59.5, contributingTFs: ['1D'] },
    ...over,
  };
}

describe('time confluence policy (Part A)', () => {
  it('no_signal is informationally neutral: no direction, no EXTREME banner, no hard gate', () => {
    const a = assessTimingEvidence({ tc: tc(), setupDirection: 'LONG', assetClass: 'crypto', sessionOpen: true });
    expect(a.valid).toBe(false);
    expect(a.effectiveDirection).toBe('neutral');
    expect(a.relation).toBe('neutral');
    expect(a.eligibleForHardGate).toBe(false);
    const s = sanitizeTimeConfluence(tc(), { assetClass: 'crypto', sessionOpen: true });
    expect(s.banners).toEqual([]);
    expect(s.direction).toBe('neutral');
  });

  it('equity on a weekend: intraday countdowns removed, session closed, timing cannot gate', () => {
    const sat = Date.UTC(2026, 8, 19, 3, 35);
    expect(isEquitySessionOpen(sat)).toBe(false);
    const raw = tc({ signalStrength: 'strong', confidence: 80, scoreBreakdown: { directionScore: -70, clusterScore: 80, decompressionScore: 70, activeTFs: 5, hasHigherTF: true } });
    const a = assessTimingEvidence({ tc: raw, setupDirection: 'LONG', assetClass: 'equity', sessionOpen: false });
    expect(a.valid).toBe(false);
    expect(a.eligibleForHardGate).toBe(false);
    expect(a.reasons.join(' ')).toMatch(/session closed/);
    const s = sanitizeTimeConfluence(raw, { assetClass: 'equity', sessionOpen: false });
    expect(s.closeSchedule.every((r) => r.category !== 'intraday')).toBe(true);
    expect(s.candleCloseConfluence.closingNowCount).toBe(0);
    expect(s.sessionState).toBe('closed');
    expect(s.prediction.expectedMoveTime).toBe('Market closed');
  });

  const strong = () => tc({ signalStrength: 'strong', confidence: 80, direction: 'bearish', scoreBreakdown: { directionScore: -70, clusterScore: 80, decompressionScore: 70, activeTFs: 5, hasHigherTF: true }, banners: ['EXTREME BEARISH'] });

  it('LONG mapping: bearish timing = conflict, bullish timing = supportive', () => {
    const conflict = assessTimingEvidence({ tc: strong(), setupDirection: 'LONG', assetClass: 'crypto', sessionOpen: true });
    expect(conflict.relation).toBe('conflict');
    expect(conflict.eligibleForHardGate).toBe(true);
    expect(timingVerdict(conflict)).toBe('disagree');
    const bull = assessTimingEvidence({ tc: { ...strong(), direction: 'bullish', scoreBreakdown: { ...strong().scoreBreakdown, directionScore: 70 } }, setupDirection: 'LONG', assetClass: 'crypto', sessionOpen: true });
    expect(bull.relation).toBe('supportive');
    expect(timingVerdict(bull)).toBe('agree');
  });

  it('SHORT mapping: bearish timing = supportive, bullish timing = conflict', () => {
    const sup = assessTimingEvidence({ tc: strong(), setupDirection: 'SHORT', assetClass: 'crypto', sessionOpen: true });
    expect(sup.relation).toBe('supportive');
    expect(timingVerdict(sup)).toBe('agree');
    const con = assessTimingEvidence({ tc: { ...strong(), direction: 'bullish', scoreBreakdown: { ...strong().scoreBreakdown, directionScore: 70 } }, setupDirection: 'SHORT', assetClass: 'crypto', sessionOpen: true });
    expect(con.relation).toBe('conflict');
  });

  it('NEUTRAL setup never reads "agree" just because timing has a direction', () => {
    const a = assessTimingEvidence({ tc: strong(), setupDirection: 'NEUTRAL', assetClass: 'crypto', sessionOpen: true });
    expect(a.relation).toBe('neutral');
    expect(timingVerdict(a)).toBe('neutral');
  });

  it('hard-gate eligibility requires moderate/strong, current, confident, multi-TF conflict', () => {
    const weak = assessTimingEvidence({ tc: { ...strong(), signalStrength: 'weak' }, setupDirection: 'LONG', assetClass: 'crypto', sessionOpen: true });
    expect(weak.relation).toBe('conflict');
    expect(weak.eligibleForHardGate).toBe(false);
    const stale = assessTimingEvidence({ tc: strong(), setupDirection: 'LONG', assetClass: 'crypto', sessionOpen: true, scanAgeMs: TIMING_HARD_GATE.maxAgeMs + 1 });
    expect(stale.eligibleForHardGate).toBe(false);
    const fewTfs = assessTimingEvidence({ tc: { ...strong(), scoreBreakdown: { ...strong().scoreBreakdown, activeTFs: 2 } }, setupDirection: 'LONG', assetClass: 'crypto', sessionOpen: true });
    expect(fewTfs.eligibleForHardGate).toBe(false);
    const s = sanitizeTimeConfluence({ ...strong(), signalStrength: 'weak' }, { assetClass: 'crypto', sessionOpen: true });
    expect(s.banners).toEqual([]);
  });

  it('level relation text and sign always agree', () => {
    expect(describeLevelRelation(7.6, 5.8).label).toBe('23.68% below price');
    expect(describeLevelRelation(7.6, 8.04).label).toBe('5.79% above price');
    expect(describeLevelRelation(100, 100.01).side).toBe('at');
  });
});

describe('indicator semantics (Part H)', () => {
  it('ADX is strength, not direction', () => {
    expect(adxStrength(30)).toMatchObject({ state: 'strength', strong: true });
    expect(adxStrength(30).label).toMatch(/trending/);
    expect(adxStrength(12).strong).toBe(false);
  });
  it('RSI 80 is strong momentum AND extension', () => {
    const r = rsiRead(80);
    expect(r.momentum).toBe('bullish');
    expect(r.extended).toBe(true);
    expect(r.state).toBe('extended');
    expect(rsiRead(62).state).toBe('bull');
  });
  it('DVE strength renders on the 0–100 scale', () => {
    expect(dveStrengthLabel(66)).toBe('66/100');
    expect(dveStrengthLabel(6600)).toBe('100/100');
  });
  it('overbought RSI in a strong trend is an extended TREND, not mean reversion', () => {
    const s = classifySetup({ rsi: 73, adx: 62, bbWidthPct: 12, changePct: 1, atrPct: 4, direction: 'LONG' });
    expect(s.setupType).toBe('trend');
    expect(s.extended).toBe(true);
    const mr = classifySetup({ rsi: 74, adx: 14, bbWidthPct: 12, changePct: 0.5, atrPct: 2 });
    expect(mr.setupType).toBe('mean_reversion');
    const notBreakout = classifySetup({ rsi: 60, adx: 45, bbWidthPct: 12, changePct: -2.4, atrPct: 3, direction: 'LONG' });
    expect(notBreakout.setupType).toBe('trend');
  });
  it('structure penalises blow-off extension and thin liquidity', () => {
    const clean = computeStructureQuality({ price: 100, sma20: 95, sma50: 90, ema200: 80, bbMiddle: 95, adx: 30, atr: 2, advUsd: 5e9, assetClass: 'equity' });
    const blowoff = computeStructureQuality({ price: 100, sma20: 88, sma50: 80, ema200: 60, bbMiddle: 88, adx: 30, atr: 2, advUsd: 2e6, assetClass: 'equity' });
    expect(clean.score).toBeGreaterThan(blowoff.score + 15);
    expect(blowoff.notes.join(' ')).toMatch(/blow-off|thin liquidity/);
  });
  it('risk quality is not a constant: high crypto vol, extension and event risk reduce it', () => {
    const calm = computeRiskQuality({ atrPct: 2.4, barsPerDay: 1, rsi: 55, stochK: 50, exhaustionRisk: 20, trapDetected: false, advUsd: 1e9, dataTrustLevel: 'GOOD', fundingRatePercent: 0.005, eventWithinDays: null, stopDistanceAtr: 1.5, assetClass: 'crypto' });
    const hot = computeRiskQuality({ atrPct: 11, barsPerDay: 1, rsi: 77, stochK: 90, exhaustionRisk: 70, trapDetected: false, advUsd: 3e6, dataTrustLevel: 'DEGRADED', fundingRatePercent: 0.06, eventWithinDays: 3, stopDistanceAtr: 1.5, assetClass: 'crypto' });
    expect(calm.score).toBeGreaterThan(hot.score + 30);
    expect(hot.reasons.length).toBeGreaterThanOrEqual(4);
  });
});

describe('news relevance & catalysts (Parts E, M)', () => {
  const feed = [
    { title: 'FedEx Counts on Polish Billionaire', summary: 'x', source: 'A', ticker_sentiment: [{ ticker: 'FDX', relevance_score: '0.9', ticker_sentiment_label: 'Neutral' }] },
    { title: 'Meta accused in class action of profiting from scam ads', summary: 'lawsuit filed', source: 'B', time_published: '20260919T143000', ticker_sentiment: [{ ticker: 'META', relevance_score: '0.95', ticker_sentiment_label: 'Bearish', ticker_sentiment_score: '-0.3' }] },
    { title: 'Meta mentioned in passing', summary: '', source: 'C', ticker_sentiment: [{ ticker: 'META', relevance_score: '0.1', ticker_sentiment_label: 'Bullish' }] },
    { title: 'Company prices $1.3B convertible senior notes offering', summary: 'Meta Platforms prices notes', source: 'D', ticker_sentiment: [{ ticker: 'META', relevance_score: '0.8', ticker_sentiment_label: 'Somewhat-Bullish' }] },
    // AV tags unrelated issuers' filings with 0.5-0.65 relevance for the ticker; they don't name the company (OV-17 rule).
    { title: 'Form 4 Medpace Holdings Inc For: 26 September', summary: 'Form 4 filing', source: 'F', ticker_sentiment: [{ ticker: 'META', relevance_score: '0.61', ticker_sentiment_label: 'Neutral' }] },
    { title: 'S&P Global buys OpenZeppelin', summary: '', source: 'E', ticker_sentiment: [{ ticker: 'CRYPTO:BTC', relevance_score: '0.2' }] },
  ];
  it('keeps only articles that reference the symbol above the relevance threshold', () => {
    const items = filterRelevantNews(feed, 'META', 'equity', { companyName: 'Meta Platforms, Inc.' });
    expect(items.map((i) => i.source).sort()).toEqual(['B', 'D']);
    // Without the company name, D (0.8, names only "Meta Platforms") can't be confirmed; B is kept on relevance >= 0.9.
    expect(filterRelevantNews(feed, 'META', 'equity').map((i) => i.source)).toEqual(['B']);
    expect(items[0].publishedAt).toBe('2026-09-19T14:30:00Z');
    expect(filterRelevantNews(feed, 'BTC', 'crypto')).toEqual([]);
    expect(avTickerKey('BTC-USD', 'crypto')).toBe('CRYPTO:BTC');
  });
  it('a convertible offering is NEGATIVE even when the provider label is bullish; litigation is NEGATIVE', () => {
    expect(classifyCatalyst('Company prices $1.3B convertible senior notes offering').klass).toBe('NEGATIVE');
    expect(classifyCatalyst('Meta accused in class action').klass).toBe('NEGATIVE');
    expect(classifyCatalyst('FDA approval for new drug').klass).toBe('POSITIVE');
    expect(classifyCatalyst('Analyst upgrade after guidance cut').klass).toBe('MIXED');
    expect(classifyCatalyst('Company to report Q3 results on Oct 28').klass).toBe('EVENT_RISK');
    expect(classifyCatalyst('COO Javier Olivan sells $3.3m in shares').klass).toBe('NEGATIVE');
  });
  it('empty relevant set yields the explicit no-news headline', () => {
    expect(summarizeNews([]).headline).toBe('No material symbol-specific news identified.');
  });
});

describe('options chain canonicalisation (Part F)', () => {
  const now = Date.UTC(2026, 8, 20);
  const mk = (expiration: string, type: 'call' | 'put', strike: number, oi: number, iv = 0.3, gamma = 0.01) => ({ expiration, type, strike, open_interest: oi, volume: Math.round(oi / 20), implied_volatility: iv, gamma, delta: type === 'call' ? 0.4 : -0.4, theta: -0.05, vega: 0.2, date: '2026-09-18' });
  it('selects one liquid expiry (7–60 DTE, most OI) and never mixes strikes across expiries', () => {
    const chain = [
      ...[600, 650, 700, 750].flatMap((k) => [mk('2026-09-25', 'call', k, 500), mk('2026-09-25', 'put', k, 500)]),
      ...[600, 640, 660, 680, 700, 720].flatMap((k) => [mk('2026-10-16', 'call', k, 4000), mk('2026-10-16', 'put', k, 3000)]),
      ...[500, 700].flatMap((k) => [mk('2026-12-18', 'call', k, 9000), mk('2026-12-18', 'put', k, 9000)]),
    ];
    const sel = selectCanonicalExpiry(chain, now);
    expect(sel.expiry).toBe('2026-10-16');
    const snap = summarizeChain(chain, 665, { nowMs: now })!;
    expect(snap.expiry).toBe('2026-10-16');
    expect(snap.putCallOi).toBeCloseTo(0.75, 2);
    expect(snap.ivRank).toBeNull();
    expect(snap.expectedMovePct).toBeGreaterThan(0);
    expect(snap.snapshotTs).toBeTruthy();
  });
  it('flags a call wall below spot as legacy positioning, not resistance, and a far-off wall as pre-split contamination', () => {
    const chain = [600, 620, 640, 660, 680, 700].flatMap((k) => [mk('2026-10-16', 'call', k, k === 640 ? 9000 : 1000), mk('2026-10-16', 'put', k, 1000)]);
    const snap = summarizeChain(chain, 665, { nowMs: now })!;
    expect(snap.callWall).toMatchObject({ strike: 640, relation: 'below' });
    expect(snap.notes.join(' ')).toMatch(/below spot/);
    const split = [40, 41, 45, 700, 720, 740].flatMap((k) => [mk('2026-10-16', 'call', k, k === 41 ? 30000 : 500), mk('2026-10-16', 'put', k, 500)]);
    const bad = summarizeChain(split, 71.79, { nowMs: now, recentCloses: [1227, 1210, 118.7, 117.2, 71.79], recentDates: ['2025-11-13', '2025-11-14', '2025-11-17', '2025-11-18', '2026-09-18'] })!;
    expect(bad.quality.level).toBe('UNUSABLE');
    expect(bad.quality.reasons.join(' ')).toMatch(/pre-split|corporate action/);
  });
});

describe('fundamentals context (Part K)', () => {
  it('multiple label is transparent and never says over/undervalued; forward P/E and PEG shown alongside', () => {
    const m = describeMultiple(25.7, 20.2, 0.9);
    expect(m.label).toBe('Elevated multiple');
    expect(m.detail).toMatch(/forward P\/E 20.2/);
    expect(m.detail).toMatch(/PEG 0.90/);
    expect(m.detail).toMatch(/PEG below 1/);
    expect(m.rule).toMatch(/> 50 premium/);
    expect(JSON.stringify(m)).not.toMatch(/overvalued|undervalued/i);
    expect(describeMultiple(-5, null, null).label).toBe('Multiple unavailable');
  });
  it('period labels expose latest quarter, TTM vs latest-quarter YoY basis', () => {
    const p = periodLabels({ LatestQuarter: '2026-06-30', FiscalYearEnd: 'December' });
    expect(p.latestQuarter).toBe('2026-06-30');
    expect(p.summary).toMatch(/TTM/);
    expect(p.summary).toMatch(/latest-quarter YoY/);
    expect(p.basis.find((b) => /growth/i.test(b.metric))!.period).toMatch(/2026-06-30/);
  });
  it('earnings calendar parsing returns the next scheduled report and never a past one', () => {
    const csv = 'symbol,name,reportDate,fiscalDateEnding,estimate,currency\nMETA,Meta Platforms,2026-07-29,2026-06-30,7.1,USD\nMETA,Meta Platforms,2026-11-04,2026-09-30,7.4,USD\n';
    const rows = parseEarningsCalendarCsv(csv);
    expect(rows).toHaveLength(2);
    const next = nextEarningsFromCalendar(rows, 'META', Date.UTC(2026, 8, 20));
    expect(next?.reportDate).toBe('2026-11-04');
    expect(next?.estimate).toBe(7.4);
  });
  it('growth phrasing preserves the sign', () => {
    expect(growthPhrase('Earnings', -0.134)).toBe('Earnings −13.4% YoY (latest quarter)');
    expect(growthPhrase('Revenue', 0.28)).toBe('Revenue +28.0% YoY (latest quarter)');
  });
});

describe('crypto network context (Part L)', () => {
  it('derives FDV from max supply when the provider omits it, flags low issued share, computes BTC/ETH relative strength', () => {
    const detail = { market_cap_rank: 90, market_data: { current_price: { usd: 7.6 }, market_cap: { usd: 7.6e8 }, total_volume: { usd: 3.2e8 }, circulating_supply: 1e8, max_supply: 2e8, ath: { usd: 52.6 }, ath_change_percentage: { usd: -85.5 }, price_change_percentage_7d: 30 } };
    const sym = Array.from({ length: 30 }, (_, i) => 5 + i * 0.1);
    const btc = Array.from({ length: 30 }, (_, i) => 80000 + i * 10);
    const n = buildNetworkContext(detail, { symbolCloses: sym, btcCloses: btc, ethCloses: btc.map((v) => v / 30) });
    expect(n.fdv).toBeCloseTo(7.6 * 2e8, 0);
    expect(n.fdvBasis).toBe('derived_max_supply');
    expect(n.supplyIssuedPct).toBe(0.5);
    expect(n.notes.join(' ')).toMatch(/50% of max supply/);
    expect(n.relative.map((r) => r.benchmark)).toEqual(['BTC', 'ETH']);
    expect(n.relative[0].label).toBe('outperforming');
    expect(relativeStrength([1, 1, 1], [1, 1, 1], 'BTC', 20)).toBeNull();
  });
});

describe('cross-market context (Part J)', () => {
  it('relates reference trends to the symbol direction (inverse instruments flipped) and never claims alignment for neutral', () => {
    expect(trendFromLevels(100, 95, 90, 1.2).trend).toBe('up');
    expect(relate('up', 'LONG')).toBe('supportive');
    expect(relate('up', 'SHORT')).toBe('headwind');
    expect(relate('up', 'LONG', true)).toBe('headwind');
    const items = [
      { symbol: 'SPY', label: 'S&P', price: 1, changePct: 1, trend: 'up' as const, detail: '', relation: relate('up', 'LONG') },
      { symbol: 'UUP', label: 'USD', price: 1, changePct: 1, trend: 'up' as const, detail: '', relation: relate('up', 'LONG', true), inverse: true },
    ];
    expect(summarizeCrossMarket(items, 'LONG').alignment).toBe('neutral');
    expect(summarizeCrossMarket(items, 'NEUTRAL').summary).toMatch(/no alignment is claimed/);
    expect(summarizeCrossMarket([], 'LONG').alignment).toBe('unknown');
  });
});

describe('shared indicator math (Part B1)', () => {
  it('Golden Egg and Scanner use the same exported functions on the same bars', () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2);
    const highs = closes.map((c) => c + 1);
    const lows = closes.map((c) => c - 1);
    const rsi = scannerMath.rsi(closes, 14);
    const atr = scannerMath.atr(highs, lows, closes, 14);
    const adx = scannerMath.adx(highs, lows, closes, 14);
    expect(Number.isFinite(rsi[rsi.length - 1])).toBe(true);
    expect(Number.isFinite(atr[atr.length - 1])).toBe(true);
    expect(Number.isFinite(adx.adx)).toBe(true);
    // Same inputs → identical outputs (determinism is what parity relies on).
    expect(scannerMath.rsi(closes, 14)).toEqual(rsi);
  });
});

describe('split-contaminated trust (Part G)', () => {
  it('a split-like jump forces INSUFFICIENT_DATA even with fresh bars', () => {
    const t = evaluateDataTrust({ assetClass: 'equity', timeframe: 'daily', barInterval: '1d', lastBarAt: '2026-09-18', historyBars: 300, price: 71.79, indicators: { atr: true, rsi: true, adx: true, ema200: true, macd: true }, volumeAvailable: true, priceDiscontinuity: { date: '2025-11-17', ratio: 0.099 }, nowMs: Date.UTC(2026, 8, 19, 15) });
    expect(t.level).toBe('INSUFFICIENT_DATA');
  });
});


describe('crypto derivative evidence availability', () => {
  it('retains sampled OI when funding interval is unknown without inventing a direction', async () => {
    vi.mocked(getAggregatedOpenInterest).mockResolvedValue([{symbol:'ETH',totalOpenInterest:17e9,avgVolume24h:33e9,exchanges:3}]);
    expect(await fetchCryptoDerivatives('ETHUSD')).toEqual({
      fundingRate:null,fundingRatePercent:null,annualizedFunding:null,
      totalOpenInterest:17e9,volume24h:33e9,exchanges:3,sentiment:'Unavailable',
    });
    vi.mocked(getAggregatedOpenInterest).mockResolvedValue([]);
    expect(await fetchCryptoDerivatives('ETH')).toBeNull();
  });
});
