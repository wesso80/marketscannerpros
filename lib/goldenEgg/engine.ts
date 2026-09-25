import { describeMultiple } from '@/lib/goldenEgg/fundamentalsContext';
import { valuationAtPrice } from '@/lib/market/valuationIntegrity';
/**
 * Golden Egg engine — the ONE validated research packet for a symbol.
 *
 * `computeGoldenEgg()` is consumed by /api/golden-egg (Verdict tab) AND /api/deep-analysis (Deep Analyst), so both
 * surfaces read identical price, indicators, options/derivatives, levels, trust and time-confluence facts.
 */

import {
  fetchPrice,
  fetchIndicators,
  fetchOptionsSnapshot,
  fetchCryptoDerivatives,
  fetchMPE,
  fetchTimeConfluence,
  fetchMacroRegime,
  type Indicators,
  type OptionsSnapshot,
  type CryptoDerivatives,
  type TimeConfluenceData,
  type MacroRegime,
  type PriceData,
} from '@/lib/goldenEggFetchers';
import { computeDVE } from '@/lib/directionalVolatilityEngine';
import { buildMechanicalZones } from '@/lib/goldenEgg/mechanicalZones';
import type { DVEInput, DVEReading } from '@/lib/directionalVolatilityEngine.types';
import { classifyBestDoctrine, type ClassifierInput } from '@/lib/doctrine/classifier';
import { recordSignal } from '@/lib/signalRecorder';
import { recordEngineEvent } from '@/lib/brain/engineBridge';
import type { GoldenEggPayload, Direction, Verdict, GoldenEggCanonical } from '@/src/features/goldenEgg/types';
import { buildMarketDataProviderStatus, emitProductionDemoDataAlert, isLocalDemoMarketDataAllowed } from '@/lib/scanner/providerStatus';
import { evaluateDataTrust, isEquitySessionOpen, type DataTrustResult } from '@/lib/scanner/dataTrust';
import { detectPriceDiscontinuity } from '@/lib/scanner/barAggregation';
import { fetchCryptoSeries } from '@/lib/scanner/cryptoBars';
import { getIndicators, getQuote } from '@/lib/onDemandFetch';
import { getGlobalData } from '@/lib/coingecko';
import { assessTimingEvidence, sanitizeTimeConfluence, timingVerdict, type TimingAssessment } from './timing';
import { adxStrength, rsiRead, stochasticRead, dveStrengthLabel, classifySetup, computeStructureQuality, computeRiskQuality, computeMomentumQuality, computeConfluenceScore, formatUsdShort } from './semantics';
import { buildNetworkContext, type NetworkContext } from './networkContext';
import { trendFromLevels, relate, summarizeCrossMarket, SECTOR_ETF, type CrossMarketItem, type CrossMarketContext } from './crossMarket';
import { getFundamentalsSummary, type FundamentalsSummary } from './companyOverview';

// ── In-memory cache (3 min) ─────────────────────────────────────────────
const cache = new Map<string, { data: GoldenEggPayload; ts: number }>();
const CACHE_TTL = 3 * 60 * 1000;
type InternalPermission = 'TRADE' | 'NO_TRADE' | 'WATCH';

export function isLocalGoldenEggDemoAllowed(): boolean {
  return isLocalDemoMarketDataAllowed({
    nodeEnv: process.env.NODE_ENV,
    localDemoMarketData: process.env.LOCAL_DEMO_MARKET_DATA,
  }).allowed;
}

export function goldenEggDemoDataQuality(reason: string, context: Record<string, unknown> = {}) {
  const demoPolicy = isLocalDemoMarketDataAllowed({
    nodeEnv: process.env.NODE_ENV,
    localDemoMarketData: process.env.LOCAL_DEMO_MARKET_DATA,
  });
  if (demoPolicy.productionDemoEnabled) {
    emitProductionDemoDataAlert('golden-egg', reason, context);
  }
  const warnings = [
    'Development-only Golden Egg payload for workflow testing. Not live market data.',
    ...(demoPolicy.productionDemoEnabled ? ['CRITICAL: LOCAL_DEMO_MARKET_DATA is enabled in production.'] : []),
    reason,
  ];
  return buildMarketDataProviderStatus({
    source: 'local_demo',
    provider: 'local_demo',
    localDemo: true,
    stale: true,
    productionDemoEnabled: demoPolicy.productionDemoEnabled,
    warnings,
  });
}

function goldenEggLiveDataQuality(assetClass: 'equity' | 'crypto' | 'forex') {
  const provider = assetClass === 'crypto' ? 'coingecko' : 'alpha_vantage';
  return buildMarketDataProviderStatus({
    source: provider,
    provider,
  });
}

export function buildLocalDemoGoldenEggPayload(
  symbol: string,
  assetClass: 'equity' | 'crypto' | 'forex',
  tfLabel: string,
  reason: string,
): GoldenEggPayload {
  const demoPrices: Record<'equity' | 'crypto' | 'forex', Record<string, number>> = {
    equity: { AAPL: 520, MSFT: 473, NVDA: 426, GOOGL: 379, AMZN: 332, META: 510, AVGO: 1280, TSLA: 285 },
    crypto: { BTC: 65000, ETH: 3250, SOL: 145, BNB: 580, XRP: 0.52, LINK: 15.5, AVAX: 36, DOGE: 0.15 },
    forex: { EURUSD: 1.08, GBPUSD: 1.27, USDJPY: 156.4, AUDUSD: 0.65, NZDUSD: 0.59, USDCAD: 1.36, USDCHF: 0.91, EURJPY: 168.9 },
  };
  const key = symbol.toUpperCase();
  const basePrice = demoPrices[assetClass]?.[key] ?? (assetClass === 'crypto' ? 65000 : assetClass === 'forex' ? 1.1 : 420);
  const closes = Array.from({ length: 260 }, (_, i) => {
    const drift = (i / 259) * 0.12 - 0.04;
    const wave = Math.sin(i / 12) * 0.012;
    return basePrice * (1 + drift + wave);
  });
  const highs = closes.map((c) => c * 1.01);
  const lows = closes.map((c) => c * 0.99);
  const priceNow = closes[closes.length - 1];
  const prev = closes[closes.length - 2];
  const change = priceNow - prev;
  const changePct = prev > 0 ? (change / prev) * 100 : 0;
  const high = Math.max(...highs.slice(-20));
  const low = Math.min(...lows.slice(-20));
  const volume = assetClass === 'forex' ? 0 : 1_800_000;

  const priceData: PriceData = {
    price: priceNow,
    change,
    changePct,
    high,
    low,
    volume,
    avgVolume: assetClass === 'forex' ? undefined : 1_500_000,
    historicalCloses: closes,
    historicalHighs: highs,
    historicalLows: lows,
  };

  const indData: Indicators = {
    rsi: 58,
    macd: 0.85,
    macdSignal: 0.44,
    macdHist: 0.41,
    adx: 24,
    atr: priceNow * 0.025,
    sma20: priceNow * 0.98,
    sma50: priceNow * 0.94,
    bbUpper: priceNow * 1.03,
    bbMiddle: priceNow,
    bbLower: priceNow * 0.97,
    stochK: 63,
    stochD: 56,
    inSqueeze: false,
    squeezeStrength: 18,
    ema20: priceNow * 0.985,
    ema50: priceNow * 0.95,
    ema200: priceNow * 0.9,
    source: 'local_canonical_bars',
    barsUsed: 260,
  };

  const payload = buildPayload(symbol, assetClass, priceData, indData, null, null, tfLabel, null, null, null);
  const baseNarrative = payload.layer3.narrative ?? {
    enabled: true,
    summary: `${symbol} local demo Golden Egg context is available for workflow testing only.`,
    bullets: [],
    risks: [],
  };
  return {
    ...payload,
    layer1: {
      ...payload.layer1,
      primaryBlocker: payload.layer1.primaryBlocker || 'Live market data unavailable locally — demo payload',
      flipConditions: payload.layer1.flipConditions.length
        ? payload.layer1.flipConditions
        : [{ id: 'ld1', text: 'Local demo payload only. Validate with live market data before acting.', severity: 'must' }],
    },
    layer3: {
      ...payload.layer3,
      narrative: {
        ...baseNarrative,
        summary: `${baseNarrative.summary} Local demo payload: ${reason}.`,
      },
    },
  };
}

// ── Adaptive price rounding (preserves precision for sub-dollar assets) ──
function roundPrice(v: number): number {
  if (v === 0) return 0;
  const abs = Math.abs(v);
  if (abs >= 1)    return Math.round(v * 100)    / 100;    // 2 dp  ($1.23)
  if (abs >= 0.01) return Math.round(v * 10000)  / 10000;  // 4 dp  ($0.2345)
  return Math.round(v * 1000000) / 1000000;                // 6 dp  ($0.001234)
}

function fmtPriceStr(v: number): string {
  if (v === 0) return '0';
  const abs = Math.abs(v);
  if (abs >= 1)    return v.toFixed(2);
  if (abs >= 0.01) return v.toPrecision(4);
  return v.toPrecision(4);
}

// ── Score → Grade ───────────────────────────────────────────────────────
function scoreToGrade(score: number): 'A' | 'B' | 'C' | 'D' {
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  if (score >= 40) return 'C';
  return 'D';
}

function toPublicAssessment(permission: InternalPermission): GoldenEggPayload['layer1']['assessment'] {
  if (permission === 'TRADE') return 'ALIGNED';
  if (permission === 'NO_TRADE') return 'NOT_ALIGNED';
  return 'WATCH';
}

// ── Build GoldenEggPayload from live data ───────────────────────────────
export interface BuildPayloadExtras {
  fundamentals?: FundamentalsSummary | null;
  network?: NetworkContext | null;
  crossMarket?: CrossMarketContext | null;
  nowMs?: number;
  timeframeKey?: string; // '15m' | '1h' | 'daily' | 'weekly'
}

const TRUST_CAP: Record<DataTrustResult['level'], number> = { GOOD: 99, DEGRADED: 80, STALE: 60, INSUFFICIENT_DATA: 40 };
/** Missing inputs are already counted once (neutral 50 in the confluence, flagged). They must not also lower the cap. */
function trustCapFor(level: DataTrustResult['level'], degradedByQuality: boolean): number {
  if (level === 'DEGRADED' && !degradedByQuality) return TRUST_CAP.GOOD;
  if (level === 'INSUFFICIENT_DATA' && !degradedByQuality) return TRUST_CAP.GOOD;
  return TRUST_CAP[level];
}

function barsPerDayFor(tfLabel: string, assetClass: 'equity' | 'crypto' | 'forex'): number {
  if (tfLabel === '15m') return assetClass === 'crypto' ? 96 : 26;
  if (tfLabel === '1H') return assetClass === 'crypto' ? 24 : 7;
  if (tfLabel === '1W') return assetClass === 'crypto' ? 1 / 7 : 1 / 5;
  return 1;
}

function fmtLevel(v: number): string { return `$${fmtPriceStr(v)}`; }

// ── Build GoldenEggPayload from live data ───────────────────────────────
function buildPayload(
  symbol: string,
  assetClass: 'equity' | 'crypto' | 'forex',
  price: PriceData,
  ind: Indicators | null,
  optsIn: OptionsSnapshot | null,
  mpe: { composite: number; time: number; volatility: number; liquidity: number; options: number } | null,
  tfLabel: string = '1D',
  cryptoDerivs: CryptoDerivatives | null = null,
  tcRaw: TimeConfluenceData | null = null,
  macroRegime: MacroRegime | null = null,
  extras: BuildPayloadExtras = {},
): GoldenEggPayload {
  const nowMs = extras.nowMs ?? Date.now();
  const p = price.price;
  if (extras.fundamentals) {
    const f = extras.fundamentals;
    const v = valuationAtPrice(p, f.eps, f.sharesOutstanding, f.marketCap);
    extras = { ...extras, fundamentals: { ...f, pe: v.pe, marketCap: v.marketCap,
      currentPrice: p, valuationBasis: v.basis, multiple: describeMultiple(v.pe, f.forwardPe, f.peg) } };
  }
  const atr = ind?.atr ?? (price.high - price.low);
  const atrPct = p > 0 ? (atr / p) * 100 : 0;
  const closes = price.historicalCloses ?? [];
  const barsPerDay = barsPerDayFor(tfLabel, assetClass);
  const timeframeKey = extras.timeframeKey ?? (tfLabel === '15m' ? '15m' : tfLabel === '1H' ? '1h' : tfLabel === '1W' ? 'weekly' : 'daily');

  // ── Liquidity (dollar terms). CoinGecko crypto volume is already USD; equity volume is shares. ─────────
  const avgVolume = price.avgVolume ?? null;
  const advUsd = avgVolume != null && avgVolume > 0 ? (assetClass === 'crypto' ? avgVolume : avgVolume * p) : null;

  // ── Data trust (shared evaluator + split guard + liquidity) ─────────────────────────────────────────
  const discontinuity = assetClass === 'equity' && (tfLabel === '1D' || tfLabel === '1W') && closes.length > 5
    ? detectPriceDiscontinuity(closes, price.historicalDates)
    : null;
  const trustBase = evaluateDataTrust({
    assetClass,
    timeframe: timeframeKey,
    lastBarAt: price.lastCompletedBarAt ?? null,
    barInterval: price.barInterval ?? null,
    historyBars: closes.length || null,
    price: p,
    indicators: {
      atr: ind?.atr != null && ind.atr > 0,
      rsi: ind?.rsi != null,
      adx: ind?.adx != null,
      ema200: ind?.ema200 != null,
      macd: ind?.macdHist != null,
    },
    volumeAvailable: assetClass === 'forex' ? null : avgVolume != null && avgVolume > 0,
    priceDiscontinuity: discontinuity ? { date: discontinuity.date, ratio: discontinuity.ratio } : null,
    nowMs,
  });
  const trust: DataTrustResult = { ...trustBase, reasons: [...trustBase.reasons] };
  // True when trust is lowered for a reason other than missing inputs (interval, delay, liquidity, unusable chain…).
  let degradedByQuality = trustBase.qualityIssues.length > 0 || trustBase.eligibilityBlockers.length > 0;
  if (assetClass !== 'forex' && advUsd != null && advUsd < 5_000_000 && trust.level === 'GOOD') {
    degradedByQuality = true;
    trust.level = 'DEGRADED'; trust.factor = Math.min(trust.factor, 0.85);
    trust.reasons.push(`thin liquidity — average dollar volume ${formatUsdShort(advUsd)}`);
  }
  // Options chains that look pre-split or illiquid are display-only, never flow evidence.
  const optsUsable = optsIn && optsIn.canonical.quality.level !== 'UNUSABLE';
  const opts = optsUsable ? optsIn : null;
  // Missing Flow is a missing input: it is scored once (neutral / not applicable) and flagged here, without also
  // downgrading trust (which used to cap the score at 80 and add a "must" flip condition for every crypto row).
  if (assetClass === 'equity' && !optsIn) {
    trust.reasons.push('Flow evidence unavailable (counted as neutral); price and indicators remain separately inspectable.');
  }
  if (optsIn && !optsUsable) {
    trust.reasons.push(`options chain unusable: ${optsIn.canonical.quality.reasons[0] ?? 'quality check failed'}`);
    if (trust.level === 'GOOD') { degradedByQuality = true; trust.level = 'DEGRADED'; trust.factor = Math.min(trust.factor, 0.85); }
  }

  // ── Direction (needs ≥3 directional layers and a 2-vote gap) ───────────────────────────────────────
  let bullish = 0; let bearish = 0; let directionalLayers = 0;
  if (ind?.rsi != null) { directionalLayers++; if (ind.rsi > 55) bullish++; else if (ind.rsi < 45) bearish++; }
  if (ind?.macd != null) { directionalLayers++; if (ind.macd > 0) bullish++; else if (ind.macd < 0) bearish++; }
  if (ind?.macdHist != null) { directionalLayers++; if (ind.macdHist > 0) bullish++; else if (ind.macdHist < 0) bearish++; }
  if (ind?.sma50 != null) { directionalLayers++; if (p > ind.sma50) bullish++; else if (p < ind.sma50) bearish++; }
  if (Math.abs(price.changePct) > 0.1) { directionalLayers++; if (price.changePct > 1) bullish++; else if (price.changePct < -1) bearish++; }
  if (opts) { directionalLayers++; if (opts.putCallRatio < 0.8) bullish++; else if (opts.putCallRatio > 1.2) bearish++; }
  let direction: Direction;
  if (directionalLayers < 3 || Math.abs(bullish - bearish) < 2) direction = 'NEUTRAL';
  else if (bullish > bearish + 1) direction = 'LONG';
  else if (bearish > bullish + 1) direction = 'SHORT';
  else direction = 'NEUTRAL';
  const isLong = direction === 'LONG' || (direction === 'NEUTRAL' && bullish >= bearish);

  // ── Component scores ────────────────────────────────────────────────────────────────────────────────
  const structureQ = computeStructureQuality({
    direction, price: p, sma20: ind?.sma20 ?? null, sma50: ind?.sma50 ?? null, ema200: ind?.ema200 ?? null, bbMiddle: ind?.bbMiddle ?? null,
    adx: ind?.adx ?? null, atr: ind?.atr ?? null, advUsd, assetClass,
  });
  const structureScore = ind ? structureQ.score : 50;
  const flow = computeFlowScore(opts, mpe, cryptoDerivs, direction);
  const flowScore = flow.score;
  const momentum = computeMomentumQuality(ind, price.changePct, direction);
  const momentumScore = momentum.score;

  // DVE first — risk quality needs exhaustion / trap.
  let dveReading: DVEReading | null = null;
  try {
    const stochK = ind?.stochK ?? null;
    const stochD = ind?.stochD ?? null;
    const dveInput: DVEInput = {
      price: { closes, opens: price.historicalOpens, highs: price.historicalHighs, lows: price.historicalLows, currentPrice: p, changePct: price.changePct, volume: price.volume, avgVolume: price.avgVolume },
      indicators: ind ? {
        macd: ind.macd, macdHist: ind.macdHist, macdSignal: ind.macdSignal, adx: ind.adx, atr: ind.atr, sma20: ind.sma20, sma50: ind.sma50,
        bbUpper: ind.bbUpper, bbMiddle: ind.bbMiddle, bbLower: ind.bbLower, stochK, stochD,
        stochMomentum: (stochK != null && stochD != null) ? stochK - stochD : null, inSqueeze: ind.inSqueeze, squeezeStrength: ind.squeezeStrength,
      } : undefined,
      options: opts ? { putCallRatio: opts.putCallRatio, ivRank: opts.ivRank, dealerGamma: opts.dealerGamma, maxPain: opts.maxPain, highestOICallStrike: opts.highestOICallStrike, highestOIPutStrike: opts.highestOIPutStrike } : undefined,
      mpeComposite: mpe?.composite,
    };
    dveReading = computeDVE(dveInput, symbol);
  } catch { /* DVE is additive — failure is non-fatal */ }

  const rsi = rsiRead(ind?.rsi);
  const stoch = stochasticRead(ind?.stochK);
  const adx = adxStrength(ind?.adx);

  // ── Setup + levels (needed for risk: stop distance) ────────────────────────────────────────────────
  const bbWidthPct = ind?.bbUpper && ind?.bbLower && ind?.bbMiddle ? ((ind.bbUpper - ind.bbLower) / ind.bbMiddle) * 100 : null;
  const setup = classifySetup({ rsi: ind?.rsi ?? null, adx: ind?.adx ?? null, bbWidthPct, changePct: price.changePct, atrPct: atrPct * Math.sqrt(barsPerDay), direction });
  const keyLevels = buildKeyLevels(p, ind, opts, atr, tcRaw);

  const maxStopPct = 0.15;
  const rawStopDist = atr * 1.5;
  let stopDistance = Math.min(rawStopDist, p * maxStopPct);
  let stopPrice = isLong ? p - stopDistance : p + stopDistance;
  let stopAnchor: string | undefined;
  if (atr > 0 && keyLevels.length > 0) {
    const minDist = atr * 1.0;
    const maxDist = Math.min(atr * 2.0, p * maxStopPct);
    const candidates = keyLevels
      .map((l) => ({ ...l, dist: Math.abs(p - l.price) }))
      .filter((l) => Number.isFinite(l.price) && l.price > 0)
      .filter((l) => (l.kind === 'support' || l.kind === 'resistance' || l.kind === 'pivot'))
      .filter((l) => isLong ? l.price < p : l.price > p)
      .filter((l) => l.dist >= minDist && l.dist <= maxDist)
      .sort((a, b) => a.dist - b.dist);
    if (candidates.length > 0) {
      const anchor = candidates[0];
      const buffer = atr * 0.15;
      const refined = isLong ? anchor.price - buffer : anchor.price + buffer;
      const refinedDist = Math.abs(p - refined);
      if (refined > 0 && refinedDist > 0 && refinedDist <= p * maxStopPct) { stopPrice = refined; stopDistance = refinedDist; stopAnchor = anchor.label; }
    }
  }
  const stopDistanceAtr = atr > 0 ? stopDistance / atr : null;

  const riskQ = computeRiskQuality({
    atrPct, barsPerDay, rsi: ind?.rsi ?? null, stochK: ind?.stochK ?? null,
    exhaustionRisk: dveReading?.exhaustion.level ?? null, trapDetected: Boolean(dveReading?.trap.detected),
    advUsd, dataTrustLevel: trust.level, fundingRatePercent: cryptoDerivs?.fundingRatePercent ?? null,
    eventWithinDays: extras.fundamentals?.daysToEarnings ?? null, stopDistanceAtr, assetClass,
  });
  const riskScore = riskQ.score;

  // ── Weighted confluence (fixed applicable denominator; missing components contribute zero) ───────
  const components = [
    { key: 'Structure', weight: 0.30, value: structureScore, present: ind != null },
    // Absolute crypto OI is context; no directional flow score without a comparable supported contract.
    { key: 'Flow', weight: 0.25, value: flowScore, present: assetClass !== 'crypto' && (opts != null || mpe != null), applicable: assetClass !== 'forex' },
    { key: 'Momentum', weight: 0.20, value: momentumScore, present: ind != null },
    { key: 'Risk', weight: 0.25, value: riskScore, present: ind != null },
  ];
  const scoreCalculation = computeConfluenceScore(components, trustCapFor(trust.level, degradedByQuality));
  const confidence = scoreCalculation.finalScore;
  const grade = scoreToGrade(confidence);

  // ── Timing evidence policy (Part A) ─────────────────────────────────────────────────────────────────
  const sessionOpen = assetClass === 'equity' ? isEquitySessionOpen(nowMs) : true;
  const timing: TimingAssessment = assessTimingEvidence({ tc: tcRaw, setupDirection: direction, assetClass, sessionOpen });
  const tcData = tcRaw ? sanitizeTimeConfluence(tcRaw, { assetClass, sessionOpen }) : null;
  const timeConfluenceHardConflict = timing.eligibleForHardGate;

  // ── Permission ──────────────────────────────────────────────────────────────────────────────────────
  let permission: InternalPermission = 'WATCH';
  if (confidence >= 70 && direction !== 'NEUTRAL' && (trust.level === 'GOOD' || trust.level === 'DEGRADED')) permission = 'TRADE';
  // INSUFFICIENT_DATA (missing inputs / short history) stays WATCH; only stale or unusable data is NO_TRADE.
  else if (confidence < 40 || trust.level === 'STALE' || trust.eligibilityBlockers.length > 0) permission = 'NO_TRADE';
  if (permission === 'TRADE' && timeConfluenceHardConflict) permission = 'WATCH';
  if (macroRegime?.riskState === 'risk_off' && direction === 'LONG' && permission === 'TRADE') permission = 'WATCH';

  // ── Driver / blocker (Risk is never a driver) ───────────────────────────────────────────────────────
  const drivers = [
    { key: 'Structure', val: structureScore },
    { key: 'Flow', val: flowScore },
    { key: 'Momentum', val: momentumScore },
  ].filter(d => components.some(c => c.key === d.key && c.present)).sort((a, b) => b.val - a.val);
  if (!drivers.length) drivers.push({key: 'Evidence unavailable', val: 0});
  const primaryDriver = `${drivers[0].key} leads at ${drivers[0].val.toFixed(0)}/100 — ${describeScore(drivers[0].key, drivers[0].val, ind, opts, cryptoDerivs, price, structureQ.notes, flow.notes)}`;
  const weakest = drivers[drivers.length - 1];
  let primaryBlocker: string | undefined;
  if (trust.level === 'INSUFFICIENT_DATA' || trust.level === 'STALE') primaryBlocker = `Data trust ${trust.level.toLowerCase().replace('_', ' ')}: ${trust.reasons[0] ?? 'inputs unreliable'}`;
  else if (timeConfluenceHardConflict) primaryBlocker = `Time confluence ${timing.effectiveDirection} (${tcRaw!.signalStrength}, ${tcRaw!.confidence}% conf, ${tcRaw!.scoreBreakdown.activeTFs} TFs) opposes the ${direction.toLowerCase()} scenario`;
  else if (weakest.val < 55) primaryBlocker = `${weakest.key} holding back at ${weakest.val.toFixed(0)}/100 — ${describeScore(weakest.key, weakest.val, ind, opts, cryptoDerivs, price, structureQ.notes, flow.notes)}`;
  else if (riskScore < 50) primaryBlocker = `Risk conditions ${riskScore}/100 — ${riskQ.reasons[0]}`;
  else if (setup.extended) primaryBlocker = `Extension — ${setup.note}`;
  else if (macroRegime?.riskState === 'risk_off' && direction === 'LONG') primaryBlocker = `Macro regime RISK_OFF (${macroRegime.concerns.join(', ')})`;

  if (primaryBlocker && permission === 'TRADE') permission = 'WATCH';

  // ── Flip conditions ─────────────────────────────────────────────────────────────────────────────────
  const flipConditions: GoldenEggPayload['layer1']['flipConditions'] = [];
  if (permission !== 'TRADE') {
    if (trust.level !== 'GOOD') flipConditions.push({ id: 'f8', text: `Data trust is ${trust.level.toLowerCase().replace('_', ' ')} (${trust.reasons.join('; ')}) — inputs need to be clean before the packet can be relied on`, severity: 'must' });
    if (timeConfluenceHardConflict) flipConditions.push({ id: 'f6', text: `Time confluence is ${timing.effectiveDirection} while the setup is ${direction.toLowerCase()} — wait for timing to agree or for the conflict to clear`, severity: 'must' });
    if (macroRegime?.riskState === 'risk_off' && direction === 'LONG') flipConditions.push({ id: 'f5', text: `Macro regime is RISK_OFF (${macroRegime.concerns.join(', ')}) — wait for macro environment to improve`, severity: 'must' });
    if (structureScore < 60) flipConditions.push({ id: 'f1', text: direction === 'SHORT' ? 'Price needs to break and hold below key moving averages' : 'Price needs to reclaim and hold above key moving averages', severity: 'must' });
    if (flowScore < 50 && opts) flipConditions.push({ id: 'f2', text: `Options positioning needs to confirm direction (P/C ${opts.putCallRatio.toFixed(2)} on ${opts.canonical.expiry})`, severity: 'should' });
    if (momentumScore < 50) flipConditions.push({ id: 'f3', text: `RSI needs to move ${direction === 'SHORT' ? 'below 45' : 'above 55'} to confirm momentum`, severity: 'must' });
    if (riskScore < 50) flipConditions.push({ id: 'f9', text: `Risk conditions need to improve — ${riskQ.reasons.slice(0, 2).join('; ')}`, severity: 'should' });
    if (direction === 'NEUTRAL') flipConditions.push({ id: 'f10', text: `Direction is neutral (${bullish} bullish vs ${bearish} bearish layers of ${directionalLayers}) — a directional resolution is required`, severity: 'must' });
    if (setup.extended) flipConditions.push({ id: 'extension', text: `Extension must resolve: ${setup.note}`, severity: 'must' });
    if (flipConditions.length === 0) flipConditions.push({ id: 'f0', text: 'Overall score below threshold — waiting for improved confluence', severity: 'must' });
  }

  const cta: GoldenEggPayload['layer1']['cta'] = permission === 'TRADE'
    ? { primary: 'OPEN_SCANNER', secondary: opts ? 'OPEN_OPTIONS' : 'OPEN_TIME' }
    : { primary: 'SET_ALERT', secondary: 'OPEN_TIME' };

  // ── Reference / zones (structural where available, mechanical and labelled otherwise) ──────────────
  const structural = keyLevels.filter((l) => l.kind === 'support' || l.kind === 'resistance' || l.kind === 'pivot');
  const beyond = structural
    .filter((l) => isLong ? l.price > p : l.price < p)
    .map((l) => ({ ...l, dist: Math.abs(l.price - p) }))
    .sort((a, b) => a.dist - b.dist);
  const refCandidate = beyond.find((l) => l.dist <= atr * 2 && l.dist >= atr * 0.15);
  const mechanicalRef = isLong ? p + atr * 0.3 : p - atr * 0.3;
  const referencePrice: number | undefined = permission === 'NO_TRADE' ? undefined : permission === 'TRADE' ? p : (refCandidate ? refCandidate.price : mechanicalRef);
  const referenceBasis: 'structural' | 'mechanical' = permission === 'WATCH' && refCandidate ? 'structural' : 'mechanical';
  const referenceTrigger = permission === 'TRADE'
    ? `${isLong ? 'Bullish' : 'Bearish'} scenario active at current price ${fmtLevel(p)} — reference is the live quote.`
    : permission === 'WATCH' && referencePrice != null
      ? (refCandidate
        ? `Structural trigger: a close ${isLong ? 'above' : 'below'} ${refCandidate.label} ${fmtLevel(refCandidate.price)} with volume or volatility expansion.`
        : `Model reference ${fmtLevel(referencePrice)} (price ${isLong ? '+' : '−'} 0.3 ATR — mechanical; no structural level within 2 ATR).`)
      : 'Monitor whether flip conditions are met.';

  const maxTargetPct = 0.30;
  const zoneStart = referencePrice ?? p;
  const structuralZones = beyond
    .filter((l) => (isLong ? l.price > zoneStart + atr * 0.5 : l.price < zoneStart - atr * 0.5))
    .filter((l) => Math.abs(l.price - p) / p <= maxTargetPct)
    .slice(0, 3)
    .map((l) => ({ price: l.price, basis: 'structural' as const, label: l.label }));
  const decompTarget = tcRaw?.decompressionTarget;
  const decompAligned = Boolean(decompTarget && decompTarget.price > 0 && ((isLong && decompTarget.direction === 'up' && decompTarget.price > p) || (!isLong && decompTarget.direction === 'down' && decompTarget.price < p)));
  const mechanicalZones = buildMechanicalZones(zoneStart, stopPrice, p, isLong);
  const zones: Array<{ price: number; basis: 'structural' | 'mechanical'; label: string }> = [];
  const pushZone = (z: { price: number; basis: 'structural' | 'mechanical'; label: string }) => {
    if (zones.length >= 3) return;
    if (zones.some((e) => Math.abs(e.price - z.price) < atr * 0.25)) return; // collapse near-duplicate levels
    zones.push(z);
  };
  for (const z of structuralZones) pushZone(z);
  for (const z of mechanicalZones) pushZone(z);
  zones.sort((a, b) => isLong ? a.price - b.price : b.price - a.price);
  const riskPerUnit = Math.abs(zoneStart - stopPrice);
  const zoneR = (z: number) => (riskPerUnit > 0 ? Math.round((Math.abs(z - zoneStart) / riskPerUnit) * 10) / 10 : null);
  const illustrativeR = zones[1] ? zoneR(zones[1].price) : zones[0] ? zoneR(zones[0].price) : null;

  // Timeframe alignment (MPE time pressure)
  const tfScore = mpe ? Math.min(4, Math.round(mpe.time / 25)) : 2;
  const tfDetails: string[] = [];
  if (ind?.sma50 != null && ind.sma20 != null) tfDetails.push((isLong && p > ind.sma50) || (!isLong && p < ind.sma50) ? 'Daily structure aligned' : 'Daily structure opposing');
  if (ind?.macdHist != null) tfDetails.push(ind.macdHist > 0 ? 'MACD histogram positive' : 'MACD histogram negative');
  if (ind?.ema200 != null) tfDetails.push(p > ind.ema200 ? `Above EMA200 ${fmtLevel(ind.ema200)}` : `Below EMA200 ${fmtLevel(ind.ema200)}`);
  else tfDetails.push('EMA200 unavailable (insufficient history)');
  if (mpe) { if (mpe.time >= 50) tfDetails.push('Time confluence active'); if (mpe.volatility >= 50) tfDetails.push('Volatility pressure building'); }

  // ── Layer 3 ─────────────────────────────────────────────────────────────────────────────────────────
  const structureVerdict: Verdict = structureScore >= 65 ? 'agree' : structureScore >= 45 ? 'neutral' : 'disagree';
  const trendHTF = ind?.sma50 != null ? (p > ind.sma50 ? 'Bullish' : 'Bearish') : 'Unknown';
  const trendMTF = ind?.sma20 != null ? (p > ind.sma20 ? 'Bullish' : 'Bearish') : 'Unknown';
  const trendLTF = price.changePct > 0.5 ? 'Bullish' : price.changePct < -0.5 ? 'Bearish' : 'Consolidating';

  let volRegime: 'compression' | 'neutral' | 'transition' | 'expansion' | 'climax' =
    bbWidthPct != null ? (bbWidthPct < 8 ? 'compression' : 'expansion') : atrPct < 2 ? 'compression' : atrPct > 5 ? 'expansion' : 'neutral';
  if (dveReading) volRegime = dveReading.volatility.regime;

  let optionsEvidence: GoldenEggPayload['layer3']['options'];
  if (optsIn) {
    const c = optsIn.canonical;
    const verdict: Verdict = !optsUsable ? 'unknown' : optsIn.sentiment === 'Bullish' && isLong ? 'agree' : optsIn.sentiment === 'Bearish' && !isLong ? 'agree' : optsIn.sentiment === 'Neutral' ? 'neutral' : 'disagree';
    optionsEvidence = {
      enabled: true,
      verdict,
      highlights: [
        { label: `Expiry`, value: `${c.expiry} (${c.daysToExpiry} DTE)` },
        { label: 'Snapshot', value: c.snapshotTs ? (/^\d{4}-\d{2}-\d{2}$/.test(c.snapshotTs) ? `${c.snapshotTs} (provider date; time unavailable)` : c.snapshotTs) : 'Unavailable' },
        { label: 'Put/Call OI', value: c.putCallOi.toFixed(2) },
        { label: 'Avg IV (chain)', value: c.avgIv != null ? `${(c.avgIv * 100).toFixed(0)}%` : 'n/a' },
        { label: 'Expected move (±1σ to expiry)', value: c.expectedMovePct != null ? `±${c.expectedMovePct.toFixed(1)}%` : 'n/a' },
        { label: 'IV Rank', value: 'n/a (no IV history)' },
        { label: 'Dealer Gamma', value: c.dealerGamma },
        { label: 'Unusual Activity', value: c.unusualActivity },
        { label: 'Max Pain', value: c.maxPain != null ? fmtLevel(c.maxPain) : 'n/a' },
        { label: 'Call wall', value: c.callWall ? `${fmtLevel(c.callWall.strike)} (${c.callWall.relation} spot)` : 'n/a' },
        { label: 'Put wall', value: c.putWall ? `${fmtLevel(c.putWall.strike)} (${c.putWall.relation} spot)` : 'n/a' },
        { label: 'Chain quality', value: c.quality.level },
      ],
      notes: [
        ...(!optsUsable ? [`Options NOT used as flow evidence — ${c.quality.reasons.join('; ')}.`] : c.quality.level === 'DEGRADED' ? [`Chain degraded: ${c.quality.reasons.join('; ')}.`] : []),
        ...c.notes,
      ],
    };
  } else if (cryptoDerivs) {
    const fmtUsd = (v: number) => formatUsdShort(v);
    optionsEvidence = {
      enabled: true,
      verdict: 'neutral',
      highlights: [
        { label: 'Funding rate', value: 'Unavailable — funding periods not supplied' },
        { label: 'Annualized funding', value: 'Unavailable' },
        { label: 'Open interest (sampled venues)', value: fmtUsd(cryptoDerivs.totalOpenInterest) },
        { label: 'Perp volume 24h (sampled venues)', value: fmtUsd(cryptoDerivs.volume24h) },
        { label: 'Exchanges in sample', value: `${cryptoDerivs.exchanges}` },
      ],
      notes: flow.notes,
    };
  }

  const momentumVerdict: Verdict = momentumScore >= 65 ? 'agree' : momentumScore >= 45 ? 'neutral' : 'disagree';
  const momentumIndicators: GoldenEggPayload['layer3']['momentum']['indicators'] = [];
  if (ind?.rsi != null) momentumIndicators.push({ name: 'RSI(14)', value: rsi.label, state: rsi.state });
  if (ind?.adx != null) momentumIndicators.push({ name: 'ADX (trend strength)', value: adx.label, state: adx.state });
  if (ind?.macdHist != null) momentumIndicators.push({ name: 'MACD Hist', value: ind.macdHist.toFixed(3), state: ind.macdHist > 0 ? 'bull' : 'bear' });
  if (ind?.stochK != null) momentumIndicators.push({ name: 'Stochastic', value: stoch.label, state: stoch.state });

  const internals: GoldenEggPayload['layer3']['internals'] = mpe ? {
    enabled: true,
    verdict: mpe.composite >= 60 ? 'agree' : mpe.composite >= 40 ? 'neutral' : 'disagree',
    items: [
      { name: 'MPE Composite', value: `${mpe.composite.toFixed(0)}/100`, state: mpe.composite >= 60 ? 'bull' : mpe.composite < 40 ? 'bear' : 'neutral' },
      { name: 'Time Pressure', value: `${mpe.time.toFixed(0)}`, state: mpe.time >= 50 ? 'bull' : 'neutral' },
      { name: 'Vol Pressure', value: `${mpe.volatility.toFixed(0)}`, state: mpe.volatility >= 50 ? 'bull' : 'neutral' },
      { name: 'Liquidity Pressure', value: `${mpe.liquidity.toFixed(0)}`, state: mpe.liquidity >= 50 ? 'bull' : 'neutral' },
    ],
  } : undefined;

  // ── Narrative ───────────────────────────────────────────────────────────────────────────────────────
  const narrativeBullets: string[] = [];
  if (permission === 'TRADE') narrativeBullets.push('Multiple factors aligned — conditions support educational scenario analysis.');
  if (structureScore >= 70) narrativeBullets.push('Price structure supports the directional thesis.');
  for (const n of structureQ.notes.slice(0, 2)) narrativeBullets.push(n.charAt(0).toUpperCase() + n.slice(1) + '.');
  if (opts && opts.unusualActivity !== 'Normal') narrativeBullets.push(`Options activity ${opts.unusualActivity.toLowerCase()} on ${opts.canonical.expiry} — watch for follow-through.`);
  if (mpe && mpe.composite >= 60) narrativeBullets.push('Market pressure engine confirms building pressure.');
  if (tcRaw && timing.valid) {
    narrativeBullets.push(`Time confluence ${tcRaw.signalStrength} ${timing.effectiveDirection} — ${tcRaw.scoreBreakdown.activeTFs} TFs active${tcRaw.scoreBreakdown.hasHigherTF ? ' (higher TF confirmed)' : ''}; relation to setup: ${timing.relation}.`);
  } else if (tcData?.displayNote) {
    narrativeBullets.push(tcData.displayNote);
  }
  if (tcRaw?.decompressionTarget && tcRaw.decompressionTarget.price > 0) {
    const d = tcRaw.decompressionTarget;
    narrativeBullets.push(`Mid-50 decompression level ${fmtLevel(d.price)} (${d.direction === 'up' ? 'above' : d.direction === 'down' ? 'below' : 'near'} price) from ${d.contributingTFs.length} TFs — a mean-reversion pull, not a timing verdict.`);
  }
  if (dveReading) {
    if (dveReading.signal.type !== 'none') narrativeBullets.push(`DVE ${dveReading.signal.type.replace(/_/g, ' ')} signal active — strength ${dveStrengthLabel(dveReading.signal.strength)}.`);
    if (dveReading.volatility.regime === 'compression' && dveReading.volatility.bbwp < 20) narrativeBullets.push(`Volatility compressed (BBWP ${dveReading.volatility.bbwp.toFixed(1)}) — expansion risk is elevated.`);
  }
  if (extras.crossMarket && extras.crossMarket.alignment !== 'unknown') narrativeBullets.push(`Cross-market: ${extras.crossMarket.summary}`);
  if (narrativeBullets.length === 0) narrativeBullets.push('Confluence is building but not yet at actionable thresholds.');

  const narrativeRisks: string[] = [];
  for (const r of riskQ.reasons) if (!/no material risk flags/.test(r)) narrativeRisks.push(r.charAt(0).toUpperCase() + r.slice(1) + '.');
  if (trust.level !== 'GOOD') narrativeRisks.push(`Data trust ${trust.level.replace('_', ' ')}: ${trust.reasons.join('; ')}.`);
  if (opts && opts.canonical.quality.level === 'DEGRADED') narrativeRisks.push(`Options chain degraded: ${opts.canonical.quality.reasons[0]}.`);
  if (mpe && mpe.composite < 40) narrativeRisks.push('Low market pressure — range-bound conditions likely.');
  if (weakest.val < 40) narrativeRisks.push(`${weakest.key} score is weak — significant blocker to thesis.`);
  if (timing.relation === 'conflict') narrativeRisks.push(`Time confluence ${timing.effectiveDirection} opposes the ${direction.toLowerCase()} thesis${timeConfluenceHardConflict ? ' (hard gate applied)' : ' (below hard-gate thresholds — noted, not gating)'}.`);
  if (tcRaw?.candleCloseConfluence.isMonthEnd) narrativeRisks.push('Month-end rebalancing — expect irregular flows and positioning.');
  if (extras.fundamentals?.daysToEarnings != null && extras.fundamentals.daysToEarnings >= 0 && extras.fundamentals.daysToEarnings <= 14) narrativeRisks.push(`Earnings scheduled ${extras.fundamentals.nextEarningsDate} (${extras.fundamentals.daysToEarnings} days) — event risk.`);
  if (narrativeRisks.length === 0) narrativeRisks.push('No major risk flags at current levels.');

  const timeConfluenceVerdict: Verdict | undefined = tcRaw ? timingVerdict(timing) : undefined;

  // ── Doctrine ────────────────────────────────────────────────────────────────────────────────────────
  let doctrineResult: GoldenEggPayload['doctrine'] = null;
  try {
    const classifierInput: ClassifierInput = {
      dveRegime: volRegime, bbwp: dveReading?.volatility.bbwp ?? null,
      dveSignalType: dveReading?.signal.type !== 'none' ? dveReading?.signal.type : undefined,
      breakoutScore: dveReading?.breakout.score, rsi: ind?.rsi ?? null, macdHist: ind?.macdHist ?? null, adx: ind?.adx ?? null, stochK: ind?.stochK ?? null,
      priceVsSma20Pct: ind?.sma20 != null && p > 0 ? ((p - ind.sma20) / ind.sma20) * 100 : null,
      priceVsSma50Pct: ind?.sma50 != null && p > 0 ? ((p - ind.sma50) / ind.sma50) * 100 : null,
      volumeRatio: price.avgVolume && price.avgVolume > 0 ? price.volume / price.avgVolume : null,
      permission, direction, confidence, setupType: setup.setupType, optionsVerdict: optionsEvidence?.verdict, inSqueeze: ind?.inSqueeze ?? undefined,
      structureVerdict, directionalBias: dveReading?.direction.bias, trapDetected: dveReading?.trap.detected, exhaustionRisk: dveReading?.exhaustion.level,
    };
    const match = classifyBestDoctrine(classifierInput);
    if (match) {
      const pb = match.playbook;
      doctrineResult = { id: match.doctrineId, label: pb.label, confidence: match.matchConfidence, regime: classifierInput.dveRegime, reasons: match.reasons, playbook: { description: pb.description, direction: pb.direction, category: pb.category, entryCriteria: pb.entryCriteria, riskModel: pb.riskModel, failureSignals: pb.failureSignals } };
    }
  } catch { /* doctrine is additive */ }

  // ── Confirmation / invalidation (setup-derived) ─────────────────────────────────────────────────────
  const confirmation: string[] = [];
  const invalidationTexts: string[] = [];
  const dirWord = direction === 'LONG' ? 'above' : direction === 'SHORT' ? 'below' : 'through';
  const oppWord = direction === 'LONG' ? 'below' : direction === 'SHORT' ? 'above' : 'against';
  if (referencePrice != null) confirmation.push(referenceBasis === 'structural' ? `Close ${dirWord} ${fmtLevel(referencePrice)} (${refCandidate?.label}) with volume or volatility expansion.` : `Close ${dirWord} the model reference ${fmtLevel(referencePrice)} with expansion — mechanical trigger; look for a structural level to replace it.`);
  if (setup.setupType === 'trend') confirmation.push(`ADX staying ≥ 25 (now ${ind?.adx?.toFixed(0) ?? 'n/a'}) and price holding ${dirWord} ${ind?.ema200 != null ? `EMA200 ${fmtLevel(ind.ema200)}` : 'the 50-bar mean'}.`);
  if (setup.setupType === 'breakout') confirmation.push('Follow-through bar holding the break with above-average participation.');
  if (setup.setupType === 'squeeze') confirmation.push('Bollinger width expanding with a directional close — direction is not assumed before the expansion bar.');
  if (setup.setupType === 'mean_reversion') confirmation.push(`RSI turning back ${direction === 'LONG' ? 'up from oversold' : 'down from overbought'} and a reclaim of the 20-bar mean.`);
  if (timing.relation === 'conflict') confirmation.push('Time confluence flipping to agree, or the conflict falling below gate thresholds.');
  invalidationTexts.push(`Close ${oppWord} ${fmtLevel(stopPrice)}${stopAnchor ? ` (beyond ${stopAnchor})` : ' (1.5× ATR model stop)'} with volume confirmation.`);
  if (ind?.ema200 != null && setup.setupType === 'trend') invalidationTexts.push(`Decisive close ${oppWord} EMA200 ${fmtLevel(ind.ema200)} or ADX rolling below 20.`);
  if (setup.extended) invalidationTexts.push('Climax bar followed by a close through its midpoint — the extended move is failing.');
  if (trust.level !== 'GOOD') invalidationTexts.push('Trust remaining below GOOD — the packet cannot be relied upon while inputs are contaminated or stale.');

  const canonical: GoldenEggCanonical = {
    symbol, assetClass, timeframe: tfLabel, barInterval: price.barInterval ?? null,
    price: p, changePct: Math.round(price.changePct * 100) / 100, priceTs: price.priceTs ?? price.lastCompletedBarAt ?? '', lastCompletedBarAt: price.lastCompletedBarAt ?? null, historyBars: closes.length, source: price.source ?? null,
    indicators: {
      rsi: ind?.rsi ?? null, adx: ind?.adx ?? null, atr: ind?.atr ?? null, atrPct: ind?.atr != null && p > 0 ? Math.round((ind.atr / p) * 10000) / 100 : null,
      ema20: ind?.ema20 ?? null, ema50: ind?.ema50 ?? null, ema200: ind?.ema200 ?? null, sma20: ind?.sma20 ?? null, sma50: ind?.sma50 ?? null, macdHist: ind?.macdHist ?? null, macd: ind?.macd ?? null, macdSignal: ind?.macdSignal ?? null, stochK: ind?.stochK ?? null,
      computedOn: `${ind?.source ?? 'unknown'} · ${ind?.barsUsed ?? closes.length} ${price.barInterval ?? tfLabel} bars`,
    },
    liquidity: { volume: price.volume ?? null, avgVolume, advUsd, volumeBasis: price.volumeBasis ?? null },
    dataTrust: { level: trust.level, label: trust.level.replace('_', ' '), reasons: trust.reasons, freshness: trust.freshness, priceDiscontinuity: discontinuity ? { date: discontinuity.date, ratio: discontinuity.ratio } : null },
    scores: { structure: Math.round(structureScore), flow: Math.round(flowScore), momentum: Math.round(momentumScore), riskQuality: Math.round(riskScore), notes: { structure: structureQ.notes, risk: riskQ.reasons, flow: flow.notes, momentum: momentum.notes } },
    timing: {
      relation: timing.relation, valid: timing.valid, eligibleForHardGate: timing.eligibleForHardGate, direction: timing.effectiveDirection,
      signalStrength: tcRaw?.signalStrength ?? 'unavailable', confidence: tcRaw?.confidence ?? null, sessionState: tcData?.sessionState ?? 'unknown', reasons: timing.reasons,
    },
    extension: {
      rsiExtended: rsi.extended, stochExtended: stoch.extended, dveExhaustion: dveReading?.exhaustion.level ?? null,
      dveSignal: dveReading && dveReading.signal.type !== 'none' ? dveReading.signal.type : null, dveSignalStrength: dveReading && dveReading.signal.type !== 'none' ? dveStrengthLabel(dveReading.signal.strength) : null,
      label: setup.extended ? 'extended' : rsi.extended || stoch.extended ? 'elevated' : 'normal',
    },
    derivatives: cryptoDerivs ? {
      fundingRatePercent: cryptoDerivs.fundingRatePercent, fundingInterval: 'unavailable', annualizedPct: cryptoDerivs.annualizedFunding,
      openInterestUsd: cryptoDerivs.totalOpenInterest, perpVolume24hUsd: cryptoDerivs.volume24h, exchanges: cryptoDerivs.exchanges,
      crowding: 'unavailable',
      note: flow.notes[0] ?? 'funding near exchange baseline',
    } : null,
    options: optsIn ? {
      expiry: optsIn.canonical.expiry, daysToExpiry: optsIn.canonical.daysToExpiry, snapshotTs: optsIn.canonical.snapshotTs, putCallOi: optsIn.canonical.putCallOi,
      avgIvPct: optsIn.canonical.avgIv != null ? Math.round(optsIn.canonical.avgIv * 1000) / 10 : null, ivRank: null, expectedMovePct: optsIn.canonical.expectedMovePct, maxPain: optsIn.canonical.maxPain,
      callWall: optsIn.canonical.callWall ? { strike: optsIn.canonical.callWall.strike, relation: optsIn.canonical.callWall.relation } : null,
      putWall: optsIn.canonical.putWall ? { strike: optsIn.canonical.putWall.strike, relation: optsIn.canonical.putWall.relation } : null,
      dealerGamma: optsIn.canonical.dealerGamma, unusualActivity: optsIn.canonical.unusualActivity,
      topCall: optsIn.canonical.topCall, topPut: optsIn.canonical.topPut, totalCallOi: optsIn.canonical.totalCallOi, totalPutOi: optsIn.canonical.totalPutOi,
      quality: { level: optsIn.canonical.quality.level, reasons: optsIn.canonical.quality.reasons }, notes: optsIn.canonical.notes,
    } : null,
    fundamentals: extras.fundamentals ? {
      name: extras.fundamentals.name, sector: extras.fundamentals.sector, industry: extras.fundamentals.industry, marketCap: extras.fundamentals.marketCap,
      pe: extras.fundamentals.pe, forwardPe: extras.fundamentals.forwardPe, peg: extras.fundamentals.peg,
      revenueGrowthYoy: extras.fundamentals.revenueGrowthYoy, earningsGrowthYoy: extras.fundamentals.earningsGrowthYoy, profitMargin: extras.fundamentals.profitMargin,
      multipleLabel: extras.fundamentals.multiple.label, periodSummary: extras.fundamentals.period.summary,
      analystTarget: extras.fundamentals.analystTarget, analystCount: extras.fundamentals.analystCount,
      nextEarningsDate: extras.fundamentals.nextEarningsDate, daysToEarnings: extras.fundamentals.daysToEarnings,
      lastReportedQuarter: extras.fundamentals.lastReportedQuarter, lastEpsBeat: extras.fundamentals.lastEpsBeat,
    } : null,
    network: extras.network ?? null,
    crossMarket: extras.crossMarket ?? { alignment: 'unknown', summary: 'Cross-market reference data unavailable right now.', items: [] },
    levels: {
      reference: { price: referencePrice != null ? roundPrice(referencePrice) : null, basis: referenceBasis, label: referenceTrigger },
      invalidation: { price: roundPrice(stopPrice), basis: stopAnchor ? 'structural' : 'mechanical', label: stopAnchor ? `Beyond ${stopAnchor} (structure-anchored, ${(stopDistance / atr).toFixed(2)}× ATR buffer)` : '1.5× ATR model stop — no structural level within 1–2 ATR', distanceAtr: stopDistanceAtr != null ? Math.round(stopDistanceAtr * 100) / 100 : null },
      zones: zones.map((z) => ({ price: roundPrice(z.price), basis: z.basis, label: z.label, rMultiple: zoneR(z.price) })),
      illustrativeR,
    },
    verdict: { assessment: toPublicAssessment(permission), direction, confluence: confidence, grade, primaryDriver, primaryBlocker: primaryBlocker ?? null, setupType: setup.setupType, setupNote: setup.note },
    confirmation,
    invalidation: invalidationTexts,
  };

  return {
    meta: { symbol, assetClass, price: p, asOfTs: new Date(nowMs).toISOString(), timeframe: tfLabel },
    layer1: {
      assessment: toPublicAssessment(permission),
      direction,
      confluenceScore: confidence,
      confidence,
      grade,
      primaryDriver,
      primaryBlocker,
      flipConditions,
      scoreCalculation: {version: scoreCalculation.version, coverage: scoreCalculation.coverage, rawTotal: scoreCalculation.rawTotal,
        trustCap: scoreCalculation.trustCap, capAdjustment: scoreCalculation.capAdjustment, finalScore: confidence},
      scoreBreakdown: scoreCalculation.rows.map(c => ({
        key: c.key, weight: c.weight * 100, value: Math.round(c.value), available: c.available,
        applicable: c.applicable !== false, effectiveWeight: c.effectiveWeight * 100, points: c.points,
        note: !c.available ? (c.applicable === false ? 'Not applicable to this asset' : c.key === 'Flow' && optsIn ? 'Options chain unusable; excluded' : 'Evidence unavailable; excluded')
          : c.key === 'Structure' ? `${direction} structure alignment`
          : c.key === 'Momentum' ? `${direction} momentum alignment; ${rsi.label}`
          : c.key === 'Risk' ? `Risk quality — ${riskQ.reasons[0]}`
          : opts ? `P/C ${opts.putCallRatio.toFixed(2)} · ${opts.canonical.expiry}` : 'Market participation context',
      })),
      cta,
    },
    layer2: {
      setup: {
        setupType: setup.setupType,
        thesis: buildThesis(direction, setup, ind, opts, mpe, symbol, tcRaw, timing, dveReading),
        timeframeAlignment: { score: tfScore, max: 4, details: tfDetails },
        keyLevels,
        invalidation: `Scenario weakens if price ${isLong ? 'closes below' : 'closes above'} ${fmtLevel(stopPrice)} with volume confirmation.`,
      },
      scenario: {
        referenceTrigger,
        referenceLevel: { type: permission === 'TRADE' ? 'reference' : 'confirmation', price: referencePrice != null ? roundPrice(referencePrice) : undefined },
        invalidationLevel: { price: roundPrice(stopPrice), logic: stopAnchor ? `Beyond ${stopAnchor} (structure-anchored, ${(stopDistance / atr).toFixed(2)}x ATR buffer)` : `1.5x ATR model stop — no structural level within 1–2 ATR` },
        reactionZones: zones.map((z, i) => ({ price: roundPrice(z.price), rMultiple: zoneR(z.price) ?? undefined, note: `${z.basis === 'structural' ? z.label : `Model zone (${z.label})`}${i === 1 && decompAligned ? ' · decompression-aligned' : ''}` })),
        hypotheticalRr: { expectedR: illustrativeR ?? 0, minR: 1.5 },
        hypotheticalRisk: { riskPct: confidence >= 70 ? 1.0 : confidence >= 55 ? 0.75 : 0.5 },
      },
    },
    layer3: {
      structure: {
        verdict: structureVerdict,
        trend: { htf: trendHTF, mtf: trendMTF, ltf: trendLTF },
        volatility: {
          regime: volRegime,
          atr: atr > 0 ? roundPrice(atr) : undefined,
          ...(dveReading ? {
            bbwp: dveReading.volatility.bbwp, bbwpSma5: dveReading.volatility.bbwpSma5, rateOfChange: dveReading.volatility.rateSmoothed,
            directionalBias: dveReading.direction.bias, directionalConfidence: dveReading.direction.confidence,
            contractionContinuation: dveReading.phasePersistence.contraction.continuationProbability, expansionContinuation: dveReading.phasePersistence.expansion.continuationProbability,
            phaseAge: dveReading.phasePersistence.contraction.active ? dveReading.phasePersistence.contraction.stats.currentBars : dveReading.phasePersistence.expansion.active ? dveReading.phasePersistence.expansion.stats.currentBars : undefined,
            phaseAgePercentile: dveReading.phasePersistence.contraction.active ? dveReading.phasePersistence.contraction.stats.agePercentile : dveReading.phasePersistence.expansion.active ? dveReading.phasePersistence.expansion.stats.agePercentile : undefined,
            signalType: dveReading.signal.type !== 'none' ? dveReading.signal.type : undefined,
            signalStrength: dveReading.signal.type !== 'none' ? dveReading.signal.strength : undefined,
            breakoutScore: dveReading.breakout.score, breakoutComponents: dveReading.breakout.components, breakoutComponentDetails: dveReading.breakout.componentDetails,
            trapDetected: dveReading.trap.detected, trapScore: dveReading.trap.score, exhaustionRisk: dveReading.exhaustion.level,
          } : {}),
        },
        liquidity: {
          overhead: ind?.bbUpper ? `BB Upper ${fmtLevel(ind.bbUpper)}` : undefined,
          below: ind?.bbLower ? `BB Lower ${fmtLevel(ind.bbLower)}` : undefined,
          note: opts?.canonical.maxPain != null ? `Max pain ${fmtLevel(opts.canonical.maxPain)} on ${opts.canonical.expiry}` : advUsd != null ? `Avg dollar volume ${formatUsdShort(advUsd)}` : undefined,
        },
      },
      options: optionsEvidence,
      momentum: { verdict: momentumVerdict, indicators: momentumIndicators },
      internals,
      narrative: {
        enabled: true,
        summary: permission === 'TRADE'
          ? `${symbol} shows ${direction.toLowerCase()} alignment with ${confidence}/100 confluence. Multiple factors support a ${setup.setupType.replace('_', ' ')} educational scenario.${timing.valid && timing.relation === 'supportive' ? ` Time confluence agrees (${timing.effectiveDirection}).` : ''}${dveReading && dveReading.signal.type !== 'none' ? ` DVE ${dveReading.signal.type.replace(/_/g, ' ')} signal active.` : ''}`
          : permission === 'NO_TRADE'
          ? `${symbol} is not aligned. ${primaryBlocker ?? 'Confluence is insufficient'} — monitor flip conditions.`
          : `${symbol} is in watch mode. Alignment is gated by ${primaryBlocker ? primaryBlocker.charAt(0).toLowerCase() + primaryBlocker.slice(1) : 'unresolved confirmation'} — monitor flip conditions.${timing.valid && timing.effectiveDirection !== 'neutral' ? ` Time confluence reads ${timing.effectiveDirection} (${timing.relation}).` : ''}`,
        bullets: narrativeBullets,
        risks: narrativeRisks,
      },
      timeConfluence: tcData ? {
        enabled: true,
        verdict: timeConfluenceVerdict!,
        confidence: tcData.confidence,
        direction: tcData.direction,
        signalStrength: tcData.signalStrength,
        banners: tcData.banners,
        scoreBreakdown: tcData.scoreBreakdown,
        decompression: tcData.decompression,
        candleCloseConfluence: tcData.candleCloseConfluence,
        mid50Levels: tcData.mid50Levels,
        prediction: tcData.prediction,
        closeSchedule: tcData.closeSchedule,
        decompressionTarget: tcData.decompressionTarget,
        sessionState: tcData.sessionState,
        displayNote: tcData.displayNote,
        gating: { relation: timing.relation, valid: timing.valid, eligibleForHardGate: timing.eligibleForHardGate, reasons: timing.reasons },
      } : undefined,
    },
    doctrine: doctrineResult,
    canonical,
  };
}


// ── Scoring functions ───────────────────────────────────────────────────
function computeFlowScore(
  opts: OptionsSnapshot | null,
  mpe: { composite: number; time: number; volatility: number; liquidity: number; options: number } | null,
  cryptoDerivs: CryptoDerivatives | null = null,
  direction: Direction = 'LONG',
): { score: number; notes: string[] } {
  let score = 50;
  const notes: string[] = [];
  const side = direction === 'LONG' ? 1 : direction === 'SHORT' ? -1 : 0;
  if (opts) {
    const c = opts.canonical;
    if (opts.putCallRatio < 0.7) { score += 15 * side; notes.push(`call-heavy positioning (P/C ${opts.putCallRatio.toFixed(2)} on ${c.expiry})`); }
    else if (opts.putCallRatio < 0.9) { score += 5 * side; notes.push(`mildly call-tilted (P/C ${opts.putCallRatio.toFixed(2)} on ${c.expiry})`); }
    else if (opts.putCallRatio > 1.3) { score -= 15 * side; notes.push(`put-heavy positioning (P/C ${opts.putCallRatio.toFixed(2)} on ${c.expiry})`); }
    else if (opts.putCallRatio > 1.1) { score -= 5 * side; notes.push(`mildly put-tilted (P/C ${opts.putCallRatio.toFixed(2)} on ${c.expiry})`); }
    else notes.push(`balanced positioning (P/C ${opts.putCallRatio.toFixed(2)} on ${c.expiry})`);
    if (opts.unusualActivity === 'Very High') { score += 10; notes.push('volume/OI very high — unusual activity'); }
    else if (opts.unusualActivity === 'Elevated') { score += 5; notes.push('volume/OI elevated'); }
    if (opts.dealerGamma.includes('Long')) { score += 5; notes.push('dealers long gamma (stabilising)'); }
    else if (opts.dealerGamma.includes('Short')) { score -= 3; notes.push('dealers short gamma (amplifying)'); }
    if (c.quality.level === 'DEGRADED') { score -= 5; notes.push('chain quality degraded — flow read discounted'); }
  }
  if (cryptoDerivs) {
    return { score: 50, notes: [
      'Directional funding and comparable OI changes are unavailable; absolute OI is context, not directional confirmation.',
      `Sampled open interest ${formatUsdShort(cryptoDerivs.totalOpenInterest)}; perp volume ${formatUsdShort(cryptoDerivs.volume24h)} across ${cryptoDerivs.exchanges} venues.`,
    ] };
  }
  if (mpe) {
    score += (mpe.liquidity - 50) * 0.2;
    score += (mpe.options - 50) * 0.15;
  }
  return { score: Math.max(0, Math.min(100, score)), notes };
}

// ── Helpers ─────────────────────────────────────────────────────────────
function describeScore(key: string, val: number, ind: Indicators | null, opts: OptionsSnapshot | null, cryptoDerivs: CryptoDerivatives | null, price: { changePct: number }, structureNotes: string[] = [], flowNotes: string[] = []): string {
  if (key === 'Structure') {
    const core = ind?.sma50 ? (val >= 65 ? 'price aligned with the 20/50-bar means' : val >= 45 ? 'mixed alignment with the 20/50-bar means' : 'price against the 20/50-bar means') : 'trend structure evaluated';
    return structureNotes.length ? `${core}; ${structureNotes[0]}` : core;
  }
  if (key === 'Flow') return opts
    ? `options ${flowNotes[0] ?? `P/C ${opts.putCallRatio.toFixed(2)}`}`
    : cryptoDerivs ? (flowNotes.slice(0, 2).join('; ') || 'Funding period unavailable; OI is context only') : 'no options/derivatives data available';
  if (key === 'Momentum') return ind?.rsi != null ? `${rsiRead(ind.rsi).label}; session ${price.changePct > 0 ? '+' : ''}${price.changePct.toFixed(1)}%` : 'momentum indicators pending';
  return '';
}

function buildKeyLevels(p: number, ind: Indicators | null, opts: OptionsSnapshot | null, atr: number, tcData?: TimeConfluenceData | null): GoldenEggPayload['layer2']['setup']['keyLevels'] {
  const levels: GoldenEggPayload['layer2']['setup']['keyLevels'] = [];
  if (ind?.sma20 != null) levels.push({ label: 'SMA 20', price: roundPrice(ind.sma20), kind: 'pivot' });
  if (ind?.sma50 != null) levels.push({ label: 'SMA 50', price: roundPrice(ind.sma50), kind: ind.sma50 < p ? 'support' : 'resistance' });
  if (ind?.ema200 != null) levels.push({ label: 'EMA 200', price: roundPrice(ind.ema200), kind: ind.ema200 < p ? 'support' : 'resistance' });
  if (ind?.bbUpper != null) levels.push({ label: 'BB Upper', price: roundPrice(ind.bbUpper), kind: 'resistance' });
  if (ind?.bbLower != null) levels.push({ label: 'BB Lower', price: roundPrice(ind.bbLower), kind: 'support' });
  if (opts) {
    const c = opts.canonical;
    if (c.maxPain != null && Math.abs(c.maxPain - p) / p <= 0.25) levels.push({ label: `Max Pain (${c.expiry})`, price: roundPrice(c.maxPain), kind: 'value' });
    // Strike hygiene: a call wall is only "resistance" when it is above spot; below spot it is legacy/pinned positioning.
    if (c.callWall) levels.push(c.callWall.relation === 'above' ? { label: `Call Wall (${c.expiry})`, price: c.callWall.strike, kind: 'resistance' } : { label: `Call Wall below spot (${c.expiry})`, price: c.callWall.strike, kind: 'value' });
    if (c.putWall) levels.push(c.putWall.relation === 'below' ? { label: `Put Wall (${c.expiry})`, price: c.putWall.strike, kind: 'support' } : { label: `Put Wall above spot (${c.expiry})`, price: c.putWall.strike, kind: 'value' });
  }
  if (tcData?.decompressionTarget && tcData.decompressionTarget.price > 0) {
    levels.push({ label: `Mid-50 decompression (${tcData.decompressionTarget.contributingTFs.length} TFs)`, price: roundPrice(tcData.decompressionTarget.price), kind: 'value' });
  }
  if (tcData?.closeSchedule) {
    const dailyPlus = tcData.closeSchedule.filter(r => r.mid50Level && r.mid50Level > 0 && r.weight >= 10).sort((a, b) => b.weight - a.weight).slice(0, 3);
    for (const r of dailyPlus) levels.push({ label: `${r.tf} Mid-50`, price: roundPrice(r.mid50Level!), kind: r.mid50Level! > p ? 'resistance' : 'support' });
  }
  levels.sort((a, b) => Math.abs(a.price - p) - Math.abs(b.price - p));
  return levels.slice(0, 8);
}

function buildThesis(
  dir: Direction,
  setup: ReturnType<typeof classifySetup>,
  ind: Indicators | null,
  opts: OptionsSnapshot | null,
  mpe: { composite: number } | null,
  symbol: string,
  tcData: TimeConfluenceData | null | undefined,
  timing: TimingAssessment,
  dve?: DVEReading | null,
): string {
  const dirWord = dir === 'LONG' ? 'bullish' : dir === 'SHORT' ? 'bearish' : 'neutral';
  const setupWord = setup.setupType === 'squeeze' ? 'volatility squeeze' : setup.setupType === 'mean_reversion' ? 'mean reversion' : setup.setupType === 'breakout' ? 'breakout' : setup.setupType === 'range' ? 'range-bound' : setup.extended ? 'extended trend continuation' : 'trend continuation';
  let thesis = `${symbol} shows a ${dirWord} ${setupWord} setup (${setup.note}).`;
  if (ind?.adx != null) thesis += ` ${adxStrength(ind.adx).label.replace(/^\d+(\.\d+)?/, `ADX ${ind.adx.toFixed(0)}`)}.`;
  if (opts && opts.sentiment !== 'Neutral') thesis += ` Options positioning is ${opts.sentiment.toLowerCase()} (P/C ${opts.putCallRatio.toFixed(2)} on ${opts.canonical.expiry}).`;
  if (mpe && mpe.composite >= 60) thesis += ` Market pressure at ${mpe.composite.toFixed(0)}/100 supports the thesis.`;
  if (tcData && timing.valid && timing.effectiveDirection !== 'neutral') thesis += ` Time confluence is ${timing.effectiveDirection} with ${tcData.signalStrength} signal strength (${timing.relation}).`;
  if (dve && dve.signal.type !== 'none') thesis += ` DVE ${dve.signal.type.replace(/_/g, ' ')} signal — strength ${dveStrengthLabel(dve.signal.strength)}.`;
  return thesis;
}

// ── Orchestration ────────────────────────────────────────────────────────
export interface GoldenEggComputeParams {
  symbol: string;
  timeframe: string; // '15m' | '1h' | 'daily' | 'weekly'
  assetClass: 'equity' | 'crypto' | 'forex';
  workspaceId?: string | null;
  /** Skip the 3-minute memory cache. */
  fresh?: boolean;
}

export interface GoldenEggComputeResult {
  payload: GoldenEggPayload;
  cached: boolean;
  localDemo: boolean;
  warnings: string[];
  dataQuality: ReturnType<typeof buildMarketDataProviderStatus>;
}

export function tfLabelFor(timeframe: string): string {
  return timeframe === '15m' ? '15m' : timeframe === '1h' ? '1H' : timeframe === 'weekly' ? '1W' : '1D';
}

async function buildCrossMarket(assetClass: 'equity' | 'crypto' | 'forex', direction: Direction, sector: string | null, symbolBase: string, series: { btcCloses?: number[]; ethCloses?: number[] }): Promise<CrossMarketContext> {
  const items: CrossMarketItem[] = [];
  const readEquity = async (sym: string, label: string, inverse = false) => {
    try {
      const [q, i] = await Promise.all([getQuote(sym), getIndicators(sym, 'daily')]);
      const t = trendFromLevels(q?.price ?? null, i?.sma20 ?? null, i?.sma50 ?? null, q?.changePct ?? null);
      items.push({ symbol: sym, label, price: q?.price ?? null, changePct: q?.changePct ?? null, trend: t.trend, detail: t.detail, relation: relate(t.trend, direction, inverse), inverse, asOf: (q as any)?.latestDay ?? null });
    } catch { items.push({ symbol: sym, label, price: null, changePct: null, trend: 'unknown', detail: 'unavailable', relation: 'unknown' }); }
  };
  const readSeries = (sym: string, label: string, closes?: number[]) => {
    if (!closes || closes.length < 21) { items.push({ symbol: sym, label, price: null, changePct: null, trend: 'unknown', detail: 'series unavailable', relation: 'unknown' }); return; }
    const last = closes[closes.length - 1];
    const sma = (n: number) => closes.slice(-n).reduce((a, b) => a + b, 0) / Math.min(n, closes.length);
    const chg5 = closes.length > 5 ? ((last - closes[closes.length - 6]) / closes[closes.length - 6]) * 100 : null;
    const t = trendFromLevels(last, sma(20), closes.length >= 50 ? sma(50) : null, chg5);
    items.push({ symbol: sym, label, price: last, changePct: chg5 != null ? Math.round(chg5 * 100) / 100 : null, trend: t.trend, detail: `${t.detail} (5-bar change)`, relation: relate(t.trend, direction) });
  };
  if (assetClass === 'equity') {
    await readEquity('SPY', 'S&P 500');
    await readEquity('QQQ', 'Nasdaq 100');
    const etf = sector ? SECTOR_ETF[sector.toUpperCase()] : undefined;
    if (etf) await readEquity(etf, `Sector ETF (${sector})`);
    await readEquity('TLT', 'Long bonds (rates proxy)');
    await readEquity('UUP', 'US dollar', true);
  } else if (assetClass === 'crypto') {
    if (symbolBase !== 'BTC') readSeries('BTC', 'Bitcoin (daily)', series.btcCloses);
    if (symbolBase !== 'ETH') readSeries('ETH', 'Ether (daily)', series.ethCloses);
    try {
      const g = await getGlobalData();
      const dom = Number(g?.market_cap_percentage?.btc);
      const mcapChg = Number(g?.market_cap_change_percentage_24h_usd);
      if (Number.isFinite(dom)) items.push({ symbol: 'BTC.D', label: 'BTC dominance', price: Math.round(dom * 10) / 10, changePct: null, trend: 'flat', detail: `${dom.toFixed(1)}% of total crypto market cap — high dominance historically weighs on alt beta`, relation: symbolBase === 'BTC' ? 'neutral' : dom >= 60 ? (direction === 'LONG' ? 'headwind' : direction === 'SHORT' ? 'supportive' : 'neutral') : 'neutral' });
      if (Number.isFinite(mcapChg)) items.push({ symbol: 'TOTAL', label: 'Total crypto market cap (24h)', price: null, changePct: Math.round(mcapChg * 100) / 100, trend: mcapChg > 0.75 ? 'up' : mcapChg < -0.75 ? 'down' : 'flat', detail: `${mcapChg >= 0 ? '+' : ''}${mcapChg.toFixed(2)}% 24h`, relation: relate(mcapChg > 0.75 ? 'up' : mcapChg < -0.75 ? 'down' : 'flat', direction) });
    } catch { /* optional */ }
  }
  return summarizeCrossMarket(items, direction);
}

/**
 * Compute (or serve from the 3-minute cache) the canonical Golden Egg packet.
 * This is the ONLY entry point; the Verdict API and the Deep Analyst both call it.
 */
export async function computeGoldenEgg(params: GoldenEggComputeParams): Promise<GoldenEggComputeResult> {
  const symbol = params.symbol.trim().toUpperCase();
  const timeframe = (params.timeframe || 'daily').toLowerCase();
  const assetClass = params.assetClass;
  const avIntervalMap: Record<string, string> = { '15m': '15min', '1h': '60min', 'daily': 'daily', 'weekly': 'weekly' };
  const avInterval = avIntervalMap[timeframe] || 'daily';
  const tfLabel = tfLabelFor(timeframe);
  const cacheKey = `${symbol}_${timeframe}_${assetClass}`;
  const hit = cache.get(cacheKey);
  if (!params.fresh && hit && Date.now() - hit.ts < CACHE_TTL) {
    return { payload: hit.data, cached: true, localDemo: false, warnings: [], dataQuality: buildMarketDataProviderStatus({ source: 'memory_cache', provider: 'memory_cache' }) };
  }

  const tcSymbol = assetClass === 'crypto' ? `${symbol.replace(/[-/]?(USDT|USD)$/i, '')}USD` : symbol;
  const base = symbol.replace(/[-/]?(USDT|USD)$/i, '');
  const [priceData, tcData, macroRegime] = await Promise.all([
    fetchPrice(symbol, assetClass, { requireHistoricals: true, avInterval }),
    fetchTimeConfluence(tcSymbol),
    fetchMacroRegime(),
  ]);
  const mpeData = await fetchMPE(symbol, assetClass, tcData);

  if (!priceData) {
    if (isLocalGoldenEggDemoAllowed()) {
      const reason = `Unable to fetch live price data for ${symbol}`;
      const dq = goldenEggDemoDataQuality(reason, { symbol, assetClass, timeframe: tfLabel });
      return { payload: buildLocalDemoGoldenEggPayload(symbol, assetClass, tfLabel, reason), cached: false, localDemo: true, warnings: dq.warnings, dataQuality: dq };
    }
    throw new Error(`Unable to fetch price data for ${symbol}`);
  }

  const indData = await fetchIndicators(symbol, assetClass, priceData.historicalCloses, priceData.historicalHighs, priceData.historicalLows, avInterval);

  let optsData: OptionsSnapshot | null = null;
  let cryptoDerivsData: CryptoDerivatives | null = null;
  let fundamentals: FundamentalsSummary | null = null;
  let network: NetworkContext | null = null;
  const benchSeries: { btcCloses?: number[]; ethCloses?: number[] } = {};
  if (assetClass === 'equity') {
    [optsData, fundamentals] = await Promise.all([
      fetchOptionsSnapshot(symbol, priceData.price, { recentCloses: priceData.historicalCloses, recentDates: priceData.historicalDates }),
      getFundamentalsSummary(symbol).catch(() => null),
    ]);
  } else if (assetClass === 'crypto') {
    const [derivs, btc, eth] = await Promise.all([
      fetchCryptoDerivatives(symbol),
      base === 'BTC' ? Promise.resolve(null) : fetchCryptoSeries('BTC', 'daily', Date.now(), { coinId: 'bitcoin' }).catch(() => null),
      base === 'ETH' || base === 'BTC' ? Promise.resolve(null) : fetchCryptoSeries('ETH', 'daily', Date.now(), { coinId: 'ethereum' }).catch(() => null),
    ]);
    cryptoDerivsData = derivs;
    benchSeries.btcCloses = btc?.bars.map((b) => b.close);
    benchSeries.ethCloses = eth?.bars.map((b) => b.close);
    network = buildNetworkContext(priceData.coinDetail, { symbolCloses: priceData.historicalCloses, btcCloses: benchSeries.btcCloses, ethCloses: benchSeries.ethCloses, interval: priceData.barInterval ?? '1d', isBtc: base === 'BTC', isEth: base === 'ETH' });
  }

  // Direction is needed to relate cross-market items; build the payload once without cross-market, then attach.
  const provisional = buildPayload(symbol, assetClass, priceData, indData, optsData, mpeData, tfLabel, cryptoDerivsData, tcData, macroRegime, { fundamentals, network, timeframeKey: timeframe });
  const crossMarket = await buildCrossMarket(assetClass, provisional.layer1.direction, fundamentals?.sector ?? null, base, benchSeries).catch(() => null);
  const payload = crossMarket ? buildPayload(symbol, assetClass, priceData, indData, optsData, mpeData, tfLabel, cryptoDerivsData, tcData, macroRegime, { fundamentals, network, crossMarket, timeframeKey: timeframe }) : provisional;

  if (payload.layer1.direction !== 'NEUTRAL') {
    recordSignal({
      symbol, signalType: 'golden_egg', direction: payload.layer1.direction === 'LONG' ? 'bullish' : 'bearish', score: payload.layer1.confidence,
      priceAtSignal: priceData.price, timeframe: tfLabel,
      features: { assessment: payload.layer1.assessment, rsi: indData?.rsi ?? undefined, macd_hist: indData?.macdHist ?? undefined, adx: indData?.adx ?? undefined, mpe_composite: mpeData?.composite ?? undefined, macro_regime: macroRegime?.riskState ?? undefined },
    }).catch(() => {});
  }
  if (params.workspaceId) {
    void recordEngineEvent({
      workspaceId: params.workspaceId, engine: 'golden_egg', eventType: 'golden_egg.analysis_generated', symbol,
      assetClass: assetClass === 'crypto' ? 'crypto' : assetClass === 'forex' ? 'fx' : 'equities', timeframe: tfLabel, source: 'golden_egg',
      dataFreshness: payload.canonical?.dataTrust.freshness === 'stale' ? 'stale' : 'unknown',
      inputs: { symbol, assetClass, timeframe: tfLabel, price: priceData.price, rsi: indData?.rsi, macdHist: indData?.macdHist, adx: indData?.adx, mpeComposite: mpeData?.composite, macroRegime: macroRegime?.riskState },
      scoreSnapshot: { direction: payload.layer1.direction, assessment: payload.layer1.assessment, confidence: payload.layer1.confidence, invalidation: payload.canonical?.levels.invalidation.price ?? null, trust: payload.canonical?.dataTrust.level ?? null },
      meta: { primaryBlocker: payload.layer1.primaryBlocker, timing: payload.canonical?.timing.relation ?? null },
      adminOnly: true,
    }).catch(() => {});
  }

  cache.set(cacheKey, { data: payload, ts: Date.now() });
  return { payload, cached: false, localDemo: false, warnings: [], dataQuality: goldenEggLiveDataQuality(assetClass) };
}
