import type { GoldenEggPayload, GoldenEggCanonical, IndicatorState } from '@/src/features/goldenEgg/types';

/**
 * Public Symbol contract (W3: P3-07, P3-08, P4-01, P4-02; W3-R leaf projection). The Symbol page's response is BUILT
 * leaf by leaf from dated evidence: no parent object is spread or passed by reference (a new private field on an
 * internal object can therefore never reach the browser), and the internal packet is never mutated (it stays cached and
 * is still used by private consumers).
 *
 * Not public (internal engine verdicts and plans): assessment, direction verdict, grade, permission, confluence and
 * every score / score breakdown, flip conditions, primary driver/blocker text, size multiplier, hypothetical R:R and
 * risk sizing, R multiples, the playbook (doctrine), the narrative, time-confluence prediction / confidence /
 * "best window", "agree/disagree with the setup" verdicts, DVE breakout / trap / exhaustion scores, cross-market
 * relation to the direction verdict, and the canonical/legacy verdict blocks.
 * Also not public, because each is built from the private direction or permission (W3-R):
 *   - the scenario plan: reference trigger and level, invalidation (stop) level and logic, reaction zones, and the
 *     canonical `levels` block that repeats them;
 *   - timeframe alignment (its score and "structure aligned / opposing" details are relative to the direction verdict);
 *   - the cross-market summary ("N supportive · N headwind for a long read"); a neutral summary of the reference-market
 *     reads is written here instead;
 *   - time-confluence banners ("EXTREME BULLISH", "HIGH ALIGNMENT"), the gate note, the decompression target and the
 *     per-timeframe model weight.
 * Trend reads are re-expressed as measured relations (close above/below SMA 50 and SMA 20, last-bar change), not
 * "Bullish/Bearish".
 * Undecided product items are omitted until decided: setup classification and thesis, third-party analyst targets and
 * ratings and the beat/miss against consensus, engine confirmation/invalidation lists.
 */
export const PUBLIC_SYMBOL_CONTRACT = 'public-symbol-v2' as const;

type C = GoldenEggCanonical;
type Opt = NonNullable<C['options']>;
type Contract = { strike: number; oi: number; volume: number; iv: number | null; delta: number | null; gamma: number | null; theta: number | null; vega: number | null };
type Relation = 'above' | 'below' | 'unknown';

export interface PublicSymbolPacket {
  contract: typeof PUBLIC_SYMBOL_CONTRACT;
  meta: { symbol: string; assetClass: C['assetClass']; price: number; asOfTs: string; timeframe: string };
  priceEvidence: GoldenEggPayload['priceEvidence'] | null;
  timingEvidence: GoldenEggPayload['timingEvidence'] | null;
  optionsRequest: { expiry: string; status: 'used' | 'unavailable' } | null;
  canonical: {
    symbol: string; assetClass: C['assetClass']; timeframe: string; barInterval: string | null; price: number; changePct: number;
    priceTs: string; lastCompletedBarAt: string | null; historyBars: number; source: string | null;
    indicators: C['indicators'];
    liquidity: C['liquidity'];
    dataTrust: { level: C['dataTrust']['level']; label: string; reasons: string[]; freshness: string };
    options: {
      expiry: string; daysToExpiry: number; snapshotTs: string; putCallOi: number; avgIvPct: number | null; ivRank: null; expectedMovePct: number | null; maxPain: number | null;
      /** Side of spot the highest-OI strike sits on (measured), renamed from the internal `relation`. */
      callWall: { strike: number; sideOfSpot: string } | null; putWall: { strike: number; sideOfSpot: string } | null; dealerGamma: string; unusualActivity: string;
      topCall: Contract | null; topPut: Contract | null; totalCallOi: number; totalPutOi: number;
      quality: { level: Opt['quality']['level']; reasons: string[] }; notes: string[];
    } | null;
    fundamentals: Omit<NonNullable<C['fundamentals']>, 'analystTarget' | 'analystCount' | 'lastEpsBeat'> | null;
    network: {
      marketCap: number | null; marketCapRank: number | null; circulatingSupply: number | null; maxSupply: number | null; totalSupply: number | null; fdv: number | null; fdvBasis: string; supplyIssuedPct: number | null;
      spotVolume24h: number | null; volumeToMcap: number | null; ath: number | null; athDate: string | null; distanceFromAthPct: number | null; change7dPct: number | null; change30dPct: number | null;
      categories: string[]; relative: Array<{ benchmark: string; ratio: number; symbolPct: number; benchmarkPct: number; window: string; label: string }>; notes: string[];
    } | null;
    derivatives: {
      fundingRatePercent: number | null; fundingInterval: string; annualizedPct: number | null; openInterestUsd: number; perpVolume24hUsd: number; exchanges: number;
      crowding: NonNullable<C['derivatives']>['crowding']; note: string;
    } | null;
    crossMarket: { summary: string; items: Array<{ symbol: string; label: string; price: number | null; changePct: number | null; trend: string; detail: string }> };
  } | null;
  layer2: {
    setup: { keyLevels: Array<{ label: string; price: number; kind: 'support' | 'resistance' | 'pivot' | 'value' }> };
  };
  layer3: {
    structure: {
      /** Measured relations, not a direction read: close vs SMA 50 and SMA 20 on the completed bar, and the last bar's change (±0.5% band). */
      trend: { closeVsSma50: Relation; closeVsSma20: Relation; lastBar: 'up' | 'down' | 'flat' | 'unknown'; basis: string };
      volatility: { regime: GoldenEggPayload['layer3']['structure']['volatility']['regime']; atr?: number; bbwp?: number };
      liquidity: { overhead?: string; below?: string; note?: string };
    };
    momentum: { indicators: Array<{ name: string; value: string; state: IndicatorState }> };
    options: { enabled: boolean; highlights: Array<{ label: string; value: string }>; notes: string[] } | null;
    timeConfluence: {
      enabled: boolean; sessionState: 'open' | 'closed' | 'always_open' | null;
      closeSchedule: Array<{ tf: string; tfMinutes: number; nextCloseAt: string; minsToClose: number; mid50Level: number | null; distanceToMid50: number | null; pullDirection: 'up' | 'down' | 'none' | null; category: 'intraday' | 'daily' | 'weekly' | 'monthly' }>;
      decompression: { unmeasuredTFs: string[]; activeCount: number; clusteredCount: number };
      closes: { closingNowCount: number; closingNowTFs: string[]; closingSoonCount: number; isMonthEnd: boolean; isWeekEnd: boolean };
    } | null;
  };
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const contractLeaves = (k: Contract | null | undefined): Contract | null => (k ? { strike: k.strike, oi: k.oi, volume: k.volume, iv: k.iv, delta: k.delta, gamma: k.gamma, theta: k.theta, vega: k.vega } : null);
const relation = (s: string | undefined): Relation => (s === 'Bullish' ? 'above' : s === 'Bearish' ? 'below' : 'unknown');
const lastBar = (s: string | undefined) => (s === 'Bullish' ? 'up' : s === 'Bearish' ? 'down' : s === 'Consolidating' ? 'flat' : 'unknown') as 'up' | 'down' | 'flat' | 'unknown';
/** The evidence modules (lib/research) are public by design; they are still copied so the response never aliases the cached packet. */
const copy = <T,>(v: T | null | undefined): T | null => (v == null ? null : structuredClone(v));

/** A neutral summary of the reference-market reads: what each one did, with no relation to a direction. */
export function crossMarketReadSummary(items: Array<{ symbol: string; trend: string }>): string {
  const known = items.filter((i) => i.trend && i.trend !== 'unknown');
  if (!known.length) return 'Cross-market reference data unavailable right now.';
  return `${known.length} reference market${known.length === 1 ? '' : 's'} read: ${known.map((i) => `${i.symbol} ${i.trend}`).join(', ')}. How they relate to this symbol is not assessed here.`;
}

export function toPublicSymbolPacket(p: GoldenEggPayload): PublicSymbolPacket {
  const c = p.canonical, st = p.layer3.structure, tc = p.layer3.timeConfluence;
  const i = c?.indicators, l = c?.liquidity, o = c?.options, f = c?.fundamentals, n = c?.network, dv = c?.derivatives;
  const crossItems = c ? c.crossMarket.items.map((x) => ({ symbol: x.symbol, label: x.label, price: x.price, changePct: x.changePct, trend: x.trend, detail: x.detail })) : [];
  return {
    contract: PUBLIC_SYMBOL_CONTRACT,
    meta: { symbol: p.meta.symbol, assetClass: p.meta.assetClass, price: p.meta.price, asOfTs: p.meta.asOfTs, timeframe: p.meta.timeframe },
    priceEvidence: copy(p.priceEvidence),
    timingEvidence: copy(p.timingEvidence),
    optionsRequest: p.optionsRequest ? { expiry: p.optionsRequest.expiry, status: p.optionsRequest.status } : null,
    canonical: c && i && l ? {
      symbol: c.symbol, assetClass: c.assetClass, timeframe: c.timeframe, barInterval: c.barInterval, price: c.price, changePct: c.changePct,
      priceTs: c.priceTs, lastCompletedBarAt: c.lastCompletedBarAt, historyBars: c.historyBars, source: c.source,
      indicators: { rsi: i.rsi, adx: i.adx, atr: i.atr, atrPct: i.atrPct, ema20: i.ema20, ema50: i.ema50, ema200: i.ema200, sma20: i.sma20, sma50: i.sma50, macdHist: i.macdHist, macd: i.macd, macdSignal: i.macdSignal, stochK: i.stochK, computedOn: i.computedOn },
      liquidity: { volume: l.volume, avgVolume: l.avgVolume, advUsd: l.advUsd, volumeBasis: l.volumeBasis },
      dataTrust: { level: c.dataTrust.level, label: c.dataTrust.label, reasons: strs(c.dataTrust.reasons), freshness: c.dataTrust.freshness },
      options: o ? {
        expiry: o.expiry, daysToExpiry: o.daysToExpiry, snapshotTs: o.snapshotTs, putCallOi: o.putCallOi, avgIvPct: o.avgIvPct, ivRank: null, expectedMovePct: o.expectedMovePct, maxPain: o.maxPain,
        callWall: o.callWall ? { strike: o.callWall.strike, sideOfSpot: o.callWall.relation } : null, putWall: o.putWall ? { strike: o.putWall.strike, sideOfSpot: o.putWall.relation } : null,
        dealerGamma: o.dealerGamma, unusualActivity: o.unusualActivity, topCall: contractLeaves(o.topCall), topPut: contractLeaves(o.topPut), totalCallOi: o.totalCallOi, totalPutOi: o.totalPutOi,
        quality: { level: o.quality.level, reasons: strs(o.quality.reasons) }, notes: strs(o.notes),
      } : null,
      fundamentals: f ? {
        name: f.name, sector: f.sector, industry: f.industry, marketCap: f.marketCap, pe: f.pe, forwardPe: f.forwardPe, peg: f.peg,
        revenueGrowthYoy: f.revenueGrowthYoy, earningsGrowthYoy: f.earningsGrowthYoy, profitMargin: f.profitMargin, multipleLabel: f.multipleLabel, periodSummary: f.periodSummary,
        nextEarningsDate: f.nextEarningsDate, daysToEarnings: f.daysToEarnings, lastReportedQuarter: f.lastReportedQuarter,
      } : null,
      network: n ? {
        marketCap: n.marketCap, marketCapRank: n.marketCapRank, circulatingSupply: n.circulatingSupply, maxSupply: n.maxSupply, totalSupply: n.totalSupply, fdv: n.fdv, fdvBasis: n.fdvBasis, supplyIssuedPct: n.supplyIssuedPct,
        spotVolume24h: n.spotVolume24h, volumeToMcap: n.volumeToMcap, ath: n.ath, athDate: n.athDate, distanceFromAthPct: n.distanceFromAthPct, change7dPct: n.change7dPct, change30dPct: n.change30dPct,
        categories: strs(n.categories), relative: (n.relative ?? []).map((r) => ({ benchmark: r.benchmark, ratio: r.ratio, symbolPct: r.symbolPct, benchmarkPct: r.benchmarkPct, window: r.window, label: r.label })), notes: strs(n.notes),
      } : null,
      derivatives: dv ? { fundingRatePercent: dv.fundingRatePercent, fundingInterval: dv.fundingInterval, annualizedPct: dv.annualizedPct, openInterestUsd: dv.openInterestUsd, perpVolume24hUsd: dv.perpVolume24hUsd, exchanges: dv.exchanges, crowding: dv.crowding, note: dv.note } : null,
      crossMarket: { summary: crossMarketReadSummary(crossItems), items: crossItems },
    } : null,
    layer2: {
      setup: { keyLevels: (p.layer2.setup.keyLevels ?? []).map((k) => ({ label: k.label, price: k.price, kind: k.kind })) },
    },
    layer3: {
      structure: {
        trend: { closeVsSma50: relation(st.trend?.htf), closeVsSma20: relation(st.trend?.mtf), lastBar: lastBar(st.trend?.ltf), basis: 'Completed-bar close vs SMA 50 and SMA 20; last bar change beyond ±0.5%.' },
        volatility: { regime: st.volatility.regime, ...(st.volatility.atr != null ? { atr: st.volatility.atr } : {}), ...(st.volatility.bbwp != null ? { bbwp: st.volatility.bbwp } : {}) },
        liquidity: { ...(st.liquidity?.overhead ? { overhead: st.liquidity.overhead } : {}), ...(st.liquidity?.below ? { below: st.liquidity.below } : {}), ...(st.liquidity?.note ? { note: st.liquidity.note } : {}) },
      },
      momentum: { indicators: (p.layer3.momentum?.indicators ?? []).map((m) => ({ name: m.name, value: m.value, state: m.state })) },
      options: p.layer3.options ? { enabled: p.layer3.options.enabled, highlights: (p.layer3.options.highlights ?? []).map((h) => ({ label: h.label, value: h.value })), notes: strs(p.layer3.options.notes) } : null,
      timeConfluence: tc ? {
        enabled: tc.enabled, sessionState: tc.sessionState ?? null,
        closeSchedule: (tc.closeSchedule ?? []).map((r) => ({ tf: r.tf, tfMinutes: r.tfMinutes, nextCloseAt: r.nextCloseAt, minsToClose: r.minsToClose, mid50Level: r.mid50Level, distanceToMid50: r.distanceToMid50, pullDirection: r.pullDirection, category: r.category })),
        decompression: { unmeasuredTFs: strs(tc.decompression.unmeasuredTFs), activeCount: tc.decompression.activeCount, clusteredCount: tc.decompression.clusteredCount },
        closes: { closingNowCount: tc.candleCloseConfluence.closingNowCount, closingNowTFs: strs(tc.candleCloseConfluence.closingNowTFs), closingSoonCount: tc.candleCloseConfluence.closingSoonCount, isMonthEnd: tc.candleCloseConfluence.isMonthEnd, isWeekEnd: tc.candleCloseConfluence.isWeekEnd },
      } : null,
    },
  };
}
