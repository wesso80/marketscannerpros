/**
 * Options Flow Classifier
 *
 * Enhances the existing volume/OI-based unusual activity detection with:
 * 1. Trade direction inference (bid/ask classification)
 * 2. Block vs sweep pattern detection
 * 3. Opening vs closing trade inference
 * 4. Net premium flow computation with directional weighting
 * 5. IV skew analysis for directional sentiment
 * 6. Smart money scoring with premium-size tiers
 *
 * Data source: Alpha Vantage REALTIME_OPTIONS_FMV contract-level data
 * (bid, ask, last, mark, volume, OI, IV, Greeks per contract)
 */

/* ── Types ── */

export type TradeDirection = 'bought' | 'sold' | 'neutral';
export type FlowPattern = 'block' | 'sweep' | 'scattered';
export type PositionAction = 'opening' | 'closing' | 'unknown';
export type PremiumTier = 'whale' | 'institutional' | 'large' | 'retail';

export interface ContractFlow {
  strike: number;
  expiration: string;
  type: 'call' | 'put';
  volume: number;
  openInterest: number;
  bid: number;
  ask: number;
  last: number;
  mark: number;
  iv: number;
  delta: number;
  // Classified fields
  direction: TradeDirection;
  directionConfidence: number;  // 0-1
  estimatedPremium: number;     // $ notional
  premiumTier: PremiumTier;
  moneyness: 'ITM' | 'ATM' | 'OTM';
  distancePct: number;          // % from current price
}

export interface FlowAggregate {
  /** Net premium: positive = bullish (call buying / put selling) */
  netPremium: number;
  callPremiumBought: number;
  callPremiumSold: number;
  putPremiumBought: number;
  putPremiumSold: number;
  totalPremium: number;
  /** Directional conviction: -100 (max bearish) to +100 (max bullish) */
  conviction: number;
  /** Count by direction */
  boughtCount: number;
  soldCount: number;
  neutralCount: number;
}

export interface FlowPatternResult {
  pattern: FlowPattern;
  reason: string;
  /** Number of distinct strikes with high volume */
  activeStrikes: number;
  /** Whether volume is concentrated at 1-2 strikes (block) or spread (sweep) */
  concentrationRatio: number;
}

export interface IVSkewAnalysis {
  /** Put skew: avg OTM put IV - avg OTM call IV (positive = put-heavy hedging) */
  skew: number;
  skewSignal: 'bearish_hedging' | 'bullish_demand' | 'neutral';
  /** IV term structure: near-term IV vs far-term IV */
  termStructure: 'backwardation' | 'contango' | 'flat';
  termReason: string;
  /** ATM IV level */
  atmIV: number;
  /** 25-delta skew (if enough data) */
  skew25Delta: number | null;
}

export interface SmartMoneySignal {
  direction: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  confidence: number;     // 0-100
  signals: string[];      // Human-readable signal descriptions
  whaleFlows: ContractFlow[];  // Premium > $500K
  institutionalFlows: ContractFlow[];  // Premium $100K-$500K
}

export interface OptionsFlowClassification {
  symbol: string;
  currentPrice: number;
  expiration: string;
  timestamp: string;
  /** Per-contract flow classification */
  contracts: ContractFlow[];
  /** Aggregate premium flow */
  aggregate: FlowAggregate;
  /** Block vs sweep detection */
  flowPattern: FlowPatternResult;
  /** IV skew analysis */
  ivSkew: IVSkewAnalysis;
  /** Smart money scoring */
  smartMoney: SmartMoneySignal;
  /** Top flow entries by premium size */
  topFlows: ContractFlow[];
}

/* ── Contract parsing helpers ── */

interface RawContract {
  strike: string;
  expiration: string;
  type: string;
  volume: string;
  open_interest: string;
  bid: string;
  ask: string;
  last: string;
  mark: string;
  implied_volatility: string;
  delta?: string;
  gamma?: string;
  [key: string]: unknown;
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

/* ── Core classification functions ── */

/**
 * Infer trade direction from last/bid/ask relationship.
 * Standard retail approximation (used by tastytrade, ThinkorSwim, etc.):
 *   last >= ask → buyer initiated (bought)
 *   last <= bid → seller initiated (sold)
 *   between   → neutral/unknown
 */
function classifyDirection(bid: number, ask: number, last: number): { direction: TradeDirection; confidence: number } {
  if (bid <= 0 || ask <= 0 || last <= 0) return { direction: 'neutral', confidence: 0 };
  if (bid >= ask) return { direction: 'neutral', confidence: 0 };

  const spread = ask - bid;
  const mid = (bid + ask) / 2;

  // At or above ask = aggressive buyer
  if (last >= ask) return { direction: 'bought', confidence: 0.9 };
  // At or below bid = aggressive seller
  if (last <= bid) return { direction: 'sold', confidence: 0.9 };

  // Within spread: lean toward closer side
  const distFromBid = last - bid;
  const ratio = distFromBid / spread;

  if (ratio >= 0.7) return { direction: 'bought', confidence: 0.55 + ratio * 0.2 };
  if (ratio <= 0.3) return { direction: 'sold', confidence: 0.55 + (1 - ratio) * 0.2 };

  return { direction: 'neutral', confidence: 0.3 };
}

function classifyMoneyness(strike: number, currentPrice: number, type: 'call' | 'put'): 'ITM' | 'ATM' | 'OTM' {
  const pct = Math.abs(strike - currentPrice) / currentPrice;
  if (pct < 0.01) return 'ATM';
  if (type === 'call') return strike < currentPrice ? 'ITM' : 'OTM';
  return strike > currentPrice ? 'ITM' : 'OTM';
}

function classifyPremiumTier(premium: number): PremiumTier {
  if (premium >= 500_000) return 'whale';
  if (premium >= 100_000) return 'institutional';
  if (premium >= 25_000) return 'large';
  return 'retail';
}

/* ── Flow pattern detection ── */

function detectFlowPattern(contracts: ContractFlow[]): FlowPatternResult {
  const significant = contracts.filter(c => c.volume >= 100 && c.estimatedPremium >= 10_000);
  if (significant.length === 0) {
    return { pattern: 'scattered', reason: 'No significant flow detected', activeStrikes: 0, concentrationRatio: 0 };
  }

  // Group by strike
  const byStrike = new Map<number, number>();
  let totalVol = 0;
  for (const c of significant) {
    byStrike.set(c.strike, (byStrike.get(c.strike) || 0) + c.volume);
    totalVol += c.volume;
  }

  const sorted = [...byStrike.entries()].sort((a, b) => b[1] - a[1]);
  const topStrikeVol = sorted[0]?.[1] || 0;
  const top2Vol = sorted.slice(0, 2).reduce((s, [, v]) => s + v, 0);
  const concentrationRatio = totalVol > 0 ? top2Vol / totalVol : 0;
  const activeStrikes = sorted.filter(([, v]) => v >= totalVol * 0.05).length;

  // Block: concentrated at 1-2 strikes (>60% of volume)
  if (concentrationRatio >= 0.6 && activeStrikes <= 3) {
    return {
      pattern: 'block',
      reason: `${Math.round(concentrationRatio * 100)}% volume at ${activeStrikes} strike${activeStrikes > 1 ? 's' : ''} — institutional block order`,
      activeStrikes,
      concentrationRatio,
    };
  }

  // Sweep: spread across many strikes (aggressive directional)
  if (activeStrikes >= 4 && concentrationRatio < 0.5) {
    return {
      pattern: 'sweep',
      reason: `Volume spread across ${activeStrikes} strikes — aggressive sweep pattern`,
      activeStrikes,
      concentrationRatio,
    };
  }

  return {
    pattern: 'scattered',
    reason: `${activeStrikes} active strikes, ${Math.round(concentrationRatio * 100)}% at top 2`,
    activeStrikes,
    concentrationRatio,
  };
}

/* ── IV Skew Analysis ── */

function analyzeIVSkew(contracts: ContractFlow[], currentPrice: number): IVSkewAnalysis {
  const otmCalls = contracts.filter(c => c.type === 'call' && c.moneyness === 'OTM' && c.iv > 0);
  const otmPuts = contracts.filter(c => c.type === 'put' && c.moneyness === 'OTM' && c.iv > 0);
  const atmContracts = contracts.filter(c => c.moneyness === 'ATM' && c.iv > 0);

  const avgOTMCallIV = otmCalls.length > 0 ? otmCalls.reduce((s, c) => s + c.iv, 0) / otmCalls.length : 0;
  const avgOTMPutIV = otmPuts.length > 0 ? otmPuts.reduce((s, c) => s + c.iv, 0) / otmPuts.length : 0;
  const atmIV = atmContracts.length > 0 ? atmContracts.reduce((s, c) => s + c.iv, 0) / atmContracts.length : (avgOTMCallIV + avgOTMPutIV) / 2;

  const skew = avgOTMPutIV - avgOTMCallIV;

  let skewSignal: IVSkewAnalysis['skewSignal'] = 'neutral';
  if (skew > 0.03) skewSignal = 'bearish_hedging';
  else if (skew < -0.03) skewSignal = 'bullish_demand';

  // 25-delta skew: find puts/calls near 0.25 delta
  const calls25d = otmCalls.filter(c => Math.abs(Math.abs(c.delta) - 0.25) < 0.1);
  const puts25d = otmPuts.filter(c => Math.abs(Math.abs(c.delta) - 0.25) < 0.1);
  let skew25Delta: number | null = null;
  if (calls25d.length > 0 && puts25d.length > 0) {
    const avg25dCallIV = calls25d.reduce((s, c) => s + c.iv, 0) / calls25d.length;
    const avg25dPutIV = puts25d.reduce((s, c) => s + c.iv, 0) / puts25d.length;
    skew25Delta = avg25dPutIV - avg25dCallIV;
  }

  // Term structure — compare near ATM IV to far (we only have one expiry at a time, so approximate from moneyness)
  const nearATM = atmContracts.length > 0;
  return {
    skew,
    skewSignal,
    termStructure: 'flat',
    termReason: nearATM ? 'Single expiration snapshot — term structure requires multi-expiry data' : 'Insufficient ATM data',
    atmIV,
    skew25Delta,
  };
}

/* ── Smart Money Scoring ── */

function scoreSmartMoney(contracts: ContractFlow[], aggregate: FlowAggregate): SmartMoneySignal {
  const signals: string[] = [];
  const whaleFlows = contracts.filter(c => c.premiumTier === 'whale');
  const institutionalFlows = contracts.filter(c => c.premiumTier === 'institutional');

  let bullScore = 0;
  let bearScore = 0;

  // Whale flows dominate
  for (const w of whaleFlows) {
    const premium = w.estimatedPremium;
    if (w.type === 'call' && w.direction === 'bought') {
      bullScore += premium / 100_000;
      signals.push(`🐋 $${(premium / 1000).toFixed(0)}K call bought at ${w.strike} strike`);
    } else if (w.type === 'put' && w.direction === 'bought') {
      bearScore += premium / 100_000;
      signals.push(`🐋 $${(premium / 1000).toFixed(0)}K put bought at ${w.strike} strike`);
    } else if (w.type === 'call' && w.direction === 'sold') {
      bearScore += premium / 150_000;
      signals.push(`🐋 $${(premium / 1000).toFixed(0)}K call sold at ${w.strike} strike`);
    } else if (w.type === 'put' && w.direction === 'sold') {
      bullScore += premium / 150_000;
      signals.push(`🐋 $${(premium / 1000).toFixed(0)}K put sold at ${w.strike} strike`);
    }
  }

  // Institutional flows
  for (const inst of institutionalFlows) {
    const premium = inst.estimatedPremium;
    if (inst.type === 'call' && inst.direction === 'bought') bullScore += premium / 200_000;
    else if (inst.type === 'put' && inst.direction === 'bought') bearScore += premium / 200_000;
    else if (inst.type === 'call' && inst.direction === 'sold') bearScore += premium / 300_000;
    else if (inst.type === 'put' && inst.direction === 'sold') bullScore += premium / 300_000;
  }

  if (institutionalFlows.length > 0) {
    signals.push(`${institutionalFlows.length} institutional-size flow${institutionalFlows.length > 1 ? 's' : ''} ($100K+)`);
  }

  // Aggregate net premium signal
  if (Math.abs(aggregate.netPremium) >= 500_000) {
    const dir = aggregate.netPremium > 0 ? 'bullish' : 'bearish';
    signals.push(`Net premium flow: $${(Math.abs(aggregate.netPremium) / 1_000_000).toFixed(1)}M ${dir}`);
  }

  const total = bullScore + bearScore;
  let direction: SmartMoneySignal['direction'] = 'neutral';
  let confidence = 0;

  if (total > 0) {
    const ratio = bullScore / total;
    if (ratio >= 0.65) { direction = 'bullish'; confidence = Math.min(95, 50 + ratio * 50); }
    else if (ratio <= 0.35) { direction = 'bearish'; confidence = Math.min(95, 50 + (1 - ratio) * 50); }
    else if (bullScore > 0 && bearScore > 0) { direction = 'mixed'; confidence = 30 + Math.abs(ratio - 0.5) * 80; }
  }

  if (signals.length === 0) signals.push('No significant smart money flow detected');

  return {
    direction,
    confidence: Math.round(confidence),
    signals,
    whaleFlows,
    institutionalFlows,
  };
}

/* ── Main Classifier ── */

export function classifyOptionsFlow(
  calls: RawContract[],
  puts: RawContract[],
  currentPrice: number,
  symbol: string,
  expiration: string,
): OptionsFlowClassification {
  const allRaw = [
    ...calls.map(c => ({ ...c, type: 'call' as const })),
    ...puts.map(p => ({ ...p, type: 'put' as const })),
  ];

  // Parse and classify each contract
  const contracts: ContractFlow[] = [];
  for (const raw of allRaw) {
    const strike = num(raw.strike);
    const volume = num(raw.volume);
    const oi = num(raw.open_interest);
    const bid = num(raw.bid);
    const ask = num(raw.ask);
    const last = num(raw.last);
    const mark = num(raw.mark) || (bid > 0 && ask > 0 ? (bid + ask) / 2 : last);
    const iv = num(raw.implied_volatility);
    const delta = num(raw.delta);

    if (strike <= 0 || volume <= 0) continue;

    const { direction, confidence: dirConf } = classifyDirection(bid, ask, last);
    const midPrice = bid > 0 && ask > 0 ? (bid + ask) / 2 : mark;
    const estimatedPremium = midPrice > 0 ? midPrice * volume * 100 : 0;
    const moneyness = classifyMoneyness(strike, currentPrice, raw.type);
    const distancePct = currentPrice > 0 ? Math.abs(strike - currentPrice) / currentPrice : 0;

    contracts.push({
      strike,
      expiration: raw.expiration,
      type: raw.type,
      volume,
      openInterest: oi,
      bid,
      ask,
      last,
      mark: midPrice,
      iv,
      delta,
      direction,
      directionConfidence: dirConf,
      estimatedPremium,
      premiumTier: classifyPremiumTier(estimatedPremium),
      moneyness,
      distancePct,
    });
  }

  // Aggregate premium flow
  let callBought = 0, callSold = 0, putBought = 0, putSold = 0;
  let boughtCount = 0, soldCount = 0, neutralCount = 0;

  for (const c of contracts) {
    if (c.direction === 'bought') {
      boughtCount++;
      if (c.type === 'call') callBought += c.estimatedPremium;
      else putBought += c.estimatedPremium;
    } else if (c.direction === 'sold') {
      soldCount++;
      if (c.type === 'call') callSold += c.estimatedPremium;
      else putSold += c.estimatedPremium;
    } else {
      neutralCount++;
    }
  }

  // Net premium: call buying + put selling = bullish; put buying + call selling = bearish
  const bullishPremium = callBought + putSold;
  const bearishPremium = putBought + callSold;
  const netPremium = bullishPremium - bearishPremium;
  const totalPremium = callBought + callSold + putBought + putSold;

  let conviction = 0;
  if (totalPremium > 0) {
    conviction = Math.round(((bullishPremium - bearishPremium) / totalPremium) * 100);
  }

  const aggregate: FlowAggregate = {
    netPremium,
    callPremiumBought: callBought,
    callPremiumSold: callSold,
    putPremiumBought: putBought,
    putPremiumSold: putSold,
    totalPremium,
    conviction,
    boughtCount,
    soldCount,
    neutralCount,
  };

  const flowPattern = detectFlowPattern(contracts);
  const ivSkew = analyzeIVSkew(contracts, currentPrice);
  const smartMoney = scoreSmartMoney(contracts, aggregate);

  // Top flows by premium
  const topFlows = [...contracts]
    .sort((a, b) => b.estimatedPremium - a.estimatedPremium)
    .slice(0, 10);

  return {
    symbol,
    currentPrice,
    expiration,
    timestamp: new Date().toISOString(),
    contracts,
    aggregate,
    flowPattern,
    ivSkew,
    smartMoney,
    topFlows,
  };
}
