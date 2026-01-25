/**
 * Options Confluence Analyzer
 * 
 * Integrates Time Confluence system with options trading:
 * 1. Uses confluence stack to determine trade quality
 * 2. Uses 50% levels to suggest strike prices
 * 3. Uses decompression timing to suggest expiration
 * 4. Calculates theoretical Greeks impact
 * 5. Analyzes Open Interest for sentiment/liquidity
 */

import { HierarchicalScanResult, ConfluenceLearningAgent, ScanMode } from './confluence-learning-agent';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface OptionsGreeks {
  delta: number;        // Price sensitivity (-1 to 1)
  gamma: number;        // Delta rate of change
  theta: number;        // Time decay per day (negative for long options)
  vega: number;         // IV sensitivity
  rho: number;          // Interest rate sensitivity
}

export interface StrikeRecommendation {
  strike: number;
  type: 'call' | 'put';
  reason: string;
  distanceFromPrice: number;    // % OTM or ITM
  moneyness: 'ITM' | 'ATM' | 'OTM';
  estimatedDelta: number;
  confidenceScore: number;      // 0-100 based on confluence alignment
  targetLevel: number;          // 50% level this strike targets
}

export interface ExpirationRecommendation {
  dte: number;                  // Days to expiration
  expirationDate: string;       // YYYY-MM-DD
  reason: string;
  thetaRisk: 'low' | 'moderate' | 'high';
  timeframe: 'scalping' | 'intraday' | 'swing' | 'position';
  confidenceScore: number;
}

export interface OptionsSetup {
  symbol: string;
  currentPrice: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  
  // Confluence data
  confluenceStack: number;
  decompressingTFs: string[];
  pullBias: number;
  signalStrength: 'strong' | 'moderate' | 'weak' | 'no_signal';
  
  // Trade quality assessment
  tradeQuality: 'A+' | 'A' | 'B' | 'C' | 'F';
  qualityReasons: string[];
  
  // Recommended strikes
  primaryStrike: StrikeRecommendation | null;
  alternativeStrikes: StrikeRecommendation[];
  
  // Recommended expiration
  primaryExpiration: ExpirationRecommendation | null;
  alternativeExpirations: ExpirationRecommendation[];
  
  // Open Interest analysis
  openInterestAnalysis: OpenInterestData | null;
  
  // Greeks considerations
  greeksAdvice: GreeksAdvice;
  
  // Risk management
  maxRiskPercent: number;       // Suggested max position size
  stopLossStrategy: string;
  profitTargetStrategy: string;
  
  // Entry timing
  entryTiming: EntryTimingAdvice;
}

export interface OpenInterestData {
  totalCallOI: number;
  totalPutOI: number;
  pcRatio: number;              // Put/Call ratio
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentReason: string;
  maxPainStrike: number | null;
  highOIStrikes: { strike: number; openInterest: number; type: 'call' | 'put' }[];
  expirationDate: string;       // The expiration date being analyzed
}

export interface GreeksAdvice {
  deltaTarget: string;          // e.g., "0.50-0.70 for directional"
  thetaWarning: string | null;
  vegaConsideration: string | null;
  gammaAdvice: string | null;
  overallAdvice: string;
}

export interface EntryTimingAdvice {
  idealEntryWindow: string;     // e.g., "Next 5-15 minutes"
  urgency: 'immediate' | 'within_hour' | 'wait' | 'no_trade';
  reason: string;
  avoidWindows: string[];
}

export interface OptionsChainData {
  symbol: string;
  expirations: string[];        // Available expiration dates
  strikes: number[];            // Available strikes
  calls: OptionContract[];
  puts: OptionContract[];
}

export interface OptionContract {
  strike: number;
  expiration: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || '';

const DELTA_TARGETS = {
  scalping: { min: 0.65, max: 0.85, label: '0.65-0.85 (high delta for quick moves)' },
  intraday: { min: 0.50, max: 0.70, label: '0.50-0.70 (balanced risk/reward)' },
  swing: { min: 0.40, max: 0.60, label: '0.40-0.60 (more leverage, more time)' },
  position: { min: 0.30, max: 0.50, label: '0.30-0.50 (cheaper, needs bigger move)' },
};

const EXPIRATION_MAP = {
  scalping: { dte: [0, 1, 2], label: '0-2 DTE', reason: 'Quick in/out, high theta but matches confluence timing' },
  intraday_30m: { dte: [1, 2, 3], label: '1-3 DTE', reason: 'Same-day to next-day moves' },
  intraday_1h: { dte: [2, 3, 5], label: '2-5 DTE', reason: 'Gives time for hourly confluence to play out' },
  intraday_4h: { dte: [3, 5, 7], label: '3-7 DTE', reason: '4H moves need a few days' },
  swing_1d: { dte: [5, 7, 14], label: '5-14 DTE', reason: 'Daily confluence = weekly expiration' },
  swing_3d: { dte: [7, 14, 21], label: '1-3 weeks', reason: '3-day moves need 2+ weeks' },
  swing_1w: { dte: [14, 21, 30], label: '2-4 weeks', reason: 'Weekly confluence = monthly options' },
  macro_monthly: { dte: [30, 45, 60], label: '30-60 DTE', reason: 'Monthly moves need time' },
  macro_yearly: { dte: [60, 90, 180], label: 'LEAPS', reason: 'Long-term positioning' },
};

// ═══════════════════════════════════════════════════════════════════════════
// BLACK-SCHOLES GREEKS ESTIMATION
// ═══════════════════════════════════════════════════════════════════════════

function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

export function estimateGreeks(
  spotPrice: number,
  strikePrice: number,
  daysToExpiry: number,
  riskFreeRate: number = 0.05,
  impliedVolatility: number = 0.25,
  isCall: boolean = true
): OptionsGreeks {
  const T = daysToExpiry / 365;
  if (T <= 0) {
    return { delta: 0, gamma: 0, theta: 0, vega: 0, rho: 0 };
  }
  
  const S = spotPrice;
  const K = strikePrice;
  const r = riskFreeRate;
  const sigma = impliedVolatility;
  
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  
  // Delta
  const delta = isCall ? normalCDF(d1) : normalCDF(d1) - 1;
  
  // Gamma
  const gamma = normalPDF(d1) / (S * sigma * Math.sqrt(T));
  
  // Theta (per day)
  const theta1 = -(S * normalPDF(d1) * sigma) / (2 * Math.sqrt(T));
  const theta2 = isCall 
    ? -r * K * Math.exp(-r * T) * normalCDF(d2)
    : r * K * Math.exp(-r * T) * normalCDF(-d2);
  const theta = (theta1 + theta2) / 365;
  
  // Vega (per 1% IV move)
  const vega = S * Math.sqrt(T) * normalPDF(d1) / 100;
  
  // Rho (per 1% rate move)
  const rho = isCall
    ? K * T * Math.exp(-r * T) * normalCDF(d2) / 100
    : -K * T * Math.exp(-r * T) * normalCDF(-d2) / 100;
  
  return { delta, gamma, theta, vega, rho };
}

// ═══════════════════════════════════════════════════════════════════════════
// ALPHA VANTAGE OPTIONS CHAIN API
// ═══════════════════════════════════════════════════════════════════════════

interface AVOptionContract {
  contractID: string;
  symbol: string;
  expiration: string;
  strike: string;
  type: string;
  last: string;
  mark: string;
  bid: string;
  bid_size: string;
  ask: string;
  ask_size: string;
  volume: string;
  open_interest: string;
  implied_volatility: string;
  delta?: string;
  gamma?: string;
  theta?: string;
  vega?: string;
  rho?: string;
}

// Get this week's Friday for weekly options expiry
// Get the nearest/current week's Friday for weekly options expiry
function getThisWeekFriday(): Date {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 5 = Friday
  
  // If today is Friday (5), use today. Otherwise find days until Friday.
  // For Saturday (6) and Sunday (0), get NEXT Friday
  let daysUntilFriday: number;
  if (dayOfWeek === 5) {
    daysUntilFriday = 0; // Today is Friday
  } else if (dayOfWeek === 6) {
    daysUntilFriday = 6; // Saturday -> next Friday
  } else {
    daysUntilFriday = (5 - dayOfWeek + 7) % 7; // Sunday-Thursday -> this Friday
  }
  
  const friday = new Date(now);
  friday.setDate(now.getDate() + daysUntilFriday);
  friday.setHours(0, 0, 0, 0);
  return friday;
}

async function fetchOptionsChain(symbol: string): Promise<{
  calls: AVOptionContract[];
  puts: AVOptionContract[];
  selectedExpiry: string;
} | null> {
  if (!ALPHA_VANTAGE_KEY) {
    console.warn('No Alpha Vantage API key - skipping options chain fetch');
    return null;
  }
  
  try {
    // Use HISTORICAL_OPTIONS (end-of-day data) - available with 75 req/min premium plan
    // When date is not specified, returns data from the previous trading session
    const url = `https://www.alphavantage.co/query?function=HISTORICAL_OPTIONS&symbol=${symbol}&apikey=${ALPHA_VANTAGE_KEY}`;
    console.log(`📊 Fetching EOD options chain for ${symbol} (historical/delayed)...`);
    
    const response = await fetch(url);
    const data = await response.json();
    
    // Enhanced logging to debug API response
    console.log(`📊 Options API response status: ${response.status}`);
    console.log(`📊 Options API response keys: ${Object.keys(data).join(', ')}`);
    
    if (data['Error Message']) {
      console.error('❌ Options API Error Message:', data['Error Message']);
      return null;
    }
    
    if (data['Note']) {
      console.warn('⚠️ Options API Note (likely rate limit):', data['Note']);
      return null;
    }
    
    if (data['Information']) {
      console.error('❌ Options API Information (likely premium required):', data['Information']);
      return null;
    }
    
    // Alpha Vantage returns data in 'data' array
    const options = data['data'] || [];
    if (!Array.isArray(options) || options.length === 0) {
      console.warn('⚠️ No options data returned. Full response:', JSON.stringify(data).substring(0, 500));
      return null;
    }
    
    // Log first contract to debug field names
    if (options.length > 0) {
      console.log('📊 Sample contract:', JSON.stringify(options[0], null, 2));
    }
    
    // Find the best expiration date (closest to this Friday)
    const targetFriday = getThisWeekFriday();
    const targetDateStr = targetFriday.toISOString().split('T')[0];
    
    // Collect all unique expiration dates
    const expiryMap: Record<string, number> = {};
    for (const opt of options) {
      if (opt.expiration) {
        expiryMap[opt.expiration] = (expiryMap[opt.expiration] || 0) + 1;
      }
    }
    
    // Find expiration closest to target Friday with the most contracts
    let bestExpiry = Object.keys(expiryMap)[0];
    let minDiff = Infinity;
    
    for (const expiry of Object.keys(expiryMap)) {
      const expiryDate = new Date(expiry);
      const diff = Math.abs(expiryDate.getTime() - targetFriday.getTime());
      // Prefer closer dates, but also consider contract count
      if (diff < minDiff || (diff === minDiff && expiryMap[expiry] > expiryMap[bestExpiry])) {
        minDiff = diff;
        bestExpiry = expiry;
      }
    }
    
    console.log(`📅 Available expirations: ${Object.keys(expiryMap).slice(0, 5).join(', ')}...`);
    console.log(`📅 Target Friday: ${targetDateStr}, Selected expiry: ${bestExpiry}`);
    
    // Filter to only this expiration
    const calls: AVOptionContract[] = [];
    const puts: AVOptionContract[] = [];
    
    for (const contract of options) {
      if (contract.expiration !== bestExpiry) continue;
      
      const contractType = contract.type?.toLowerCase();
      if (contractType === 'call') {
        calls.push(contract);
      } else if (contractType === 'put') {
        puts.push(contract);
      }
    }
    
    console.log(`✅ Filtered to ${bestExpiry}: ${calls.length} calls, ${puts.length} puts`);
    return { calls, puts, selectedExpiry: bestExpiry };
  } catch (err) {
    console.error('Options chain fetch failed:', err);
    return null;
  }
}
function analyzeOpenInterest(
  calls: AVOptionContract[],
  puts: AVOptionContract[],
  currentPrice: number,
  expirationDate: string
): OpenInterestData {
  // Calculate total OI
  let totalCallOI = 0;
  let totalPutOI = 0;
  
  const strikeOI: Map<number, { callOI: number; putOI: number }> = new Map();
  
  // Sanity check: ensure currentPrice is valid
  if (!currentPrice || currentPrice <= 0) {
    console.error('❌ Invalid currentPrice for O/I analysis:', currentPrice);
    return {
      totalCallOI: 0,
      totalPutOI: 0,
      pcRatio: 1.0,
      sentiment: 'neutral',
      sentimentReason: 'Unable to analyze - invalid price data',
      maxPainStrike: null,
      highOIStrikes: [],
      expirationDate,
    };
  }
  
  // Only consider strikes within 30% of current price (tighter range for accuracy)
  const minStrike = currentPrice * 0.7;
  const maxStrike = currentPrice * 1.3;
  
  console.log(`📊 Filtering strikes to range: $${minStrike.toFixed(2)} - $${maxStrike.toFixed(2)} (current: $${currentPrice})`);
  
  // Debug: collect all raw strikes to see what's in the data
  const allRawStrikes: number[] = [];
  
  for (const call of calls) {
    // Alpha Vantage may use 'open_interest' or 'openInterest'
    const oiValue = call.open_interest || (call as unknown as Record<string, string>).openInterest || '0';
    const oi = parseInt(String(oiValue), 10) || 0;
    const strikeValue = call.strike || '0';
    const strike = parseFloat(String(strikeValue)) || 0;
    
    if (strike > 0) allRawStrikes.push(strike);
    
    // Filter to reasonable strike range around current price
    if (strike > 0 && strike >= minStrike && strike <= maxStrike) {
      totalCallOI += oi;
      if (!strikeOI.has(strike)) strikeOI.set(strike, { callOI: 0, putOI: 0 });
      strikeOI.get(strike)!.callOI += oi;
    }
  }
  
  for (const put of puts) {
    const oiValue = put.open_interest || (put as unknown as Record<string, string>).openInterest || '0';
    const oi = parseInt(String(oiValue), 10) || 0;
    const strikeValue = put.strike || '0';
    const strike = parseFloat(String(strikeValue)) || 0;
    
    if (strike > 0) allRawStrikes.push(strike);
    
    // Filter to reasonable strike range around current price
    if (strike > 0 && strike >= minStrike && strike <= maxStrike) {
      totalPutOI += oi;
      if (!strikeOI.has(strike)) strikeOI.set(strike, { callOI: 0, putOI: 0 });
      strikeOI.get(strike)!.putOI += oi;
    }
  }
  
  // Debug: Show strike range info
  const uniqueRawStrikes = [...new Set(allRawStrikes)].sort((a, b) => a - b);
  const filteredStrikes = [...strikeOI.keys()].sort((a, b) => a - b);
  console.log(`📊 Raw strikes from API: min=$${uniqueRawStrikes[0]?.toFixed(2) || 'N/A'}, max=$${uniqueRawStrikes[uniqueRawStrikes.length - 1]?.toFixed(2) || 'N/A'}, total=${uniqueRawStrikes.length}`);
  console.log(`📊 Filtered strikes in range: ${filteredStrikes.length} strikes: ${filteredStrikes.slice(0, 10).map(s => '$' + s).join(', ')}${filteredStrikes.length > 10 ? '...' : ''}`);
  
  // Put/Call ratio
  const pcRatio = totalCallOI > 0 ? totalPutOI / totalCallOI : 1.0;
  
  // Sentiment based on P/C ratio
  // < 0.7 = bullish (more calls), > 1.0 = bearish (more puts), between = neutral
  let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let sentimentReason = 'P/C ratio in neutral range';
  
  if (pcRatio < 0.7) {
    sentiment = 'bullish';
    sentimentReason = `P/C ${pcRatio.toFixed(2)} = heavy call buying`;
  } else if (pcRatio > 1.0) {
    sentiment = 'bearish';
    sentimentReason = `P/C ${pcRatio.toFixed(2)} = heavy put buying`;
  }
  
  // Find max pain strike (where most options expire worthless)
  // Max Pain = strike where total $ value of ITM options is MINIMIZED
  // For each potential settlement price (strike), calculate total ITM value:
  //   - Calls are ITM if their strike < settlement price → value = (settlement - callStrike) * callOI
  //   - Puts are ITM if their strike > settlement price → value = (putStrike - settlement) * putOI
  let maxPainStrike: number | null = null;
  let minPain = Infinity;
  
  for (const [potentialSettlement] of strikeOI.entries()) {
    let totalPain = 0;
    
    for (const [contractStrike, data] of strikeOI.entries()) {
      // Calls are ITM when strike < settlement price
      if (contractStrike < potentialSettlement) {
        totalPain += (potentialSettlement - contractStrike) * data.callOI * 100; // *100 for contract size
      }
      // Puts are ITM when strike > settlement price
      if (contractStrike > potentialSettlement) {
        totalPain += (contractStrike - potentialSettlement) * data.putOI * 100; // *100 for contract size
      }
    }
    
    if (totalPain < minPain) {
      minPain = totalPain;
      maxPainStrike = potentialSettlement;
    }
  }
  
  // Final validation: max pain must be within reasonable range of current price
  if (maxPainStrike !== null) {
    const maxPainDistance = Math.abs(maxPainStrike - currentPrice) / currentPrice;
    if (maxPainDistance > 0.35) {
      console.warn(`⚠️ Max pain $${maxPainStrike} is ${(maxPainDistance * 100).toFixed(1)}% away from price $${currentPrice} - likely bad data, nullifying`);
      maxPainStrike = null;
    }
  }
  
  // Find high OI strikes - return as flat list with type
  const highOIStrikes: { strike: number; openInterest: number; type: 'call' | 'put' }[] = [];
  
  // Add top call strikes by OI
  for (const [strike, data] of strikeOI.entries()) {
    if (data.callOI > 0) {
      highOIStrikes.push({ strike, openInterest: data.callOI, type: 'call' });
    }
    if (data.putOI > 0) {
      highOIStrikes.push({ strike, openInterest: data.putOI, type: 'put' });
    }
  }
  
  // Sort by OI and take top 10
  highOIStrikes.sort((a, b) => b.openInterest - a.openInterest);
  const topStrikes = highOIStrikes.slice(0, 10);
  
  console.log(`📊 O/I Summary (${expirationDate}): Calls=${totalCallOI.toLocaleString()}, Puts=${totalPutOI.toLocaleString()}, P/C=${pcRatio.toFixed(2)}, MaxPain=$${maxPainStrike}`);
  
  return {
    totalCallOI,
    totalPutOI,
    pcRatio,
    sentiment,
    sentimentReason,
    maxPainStrike,
    highOIStrikes: topStrikes,
    expirationDate,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STRIKE SELECTION BASED ON 50% LEVELS
// ═══════════════════════════════════════════════════════════════════════════

function selectStrikesFromConfluence(
  confluenceResult: HierarchicalScanResult,
  isCallDirection: boolean
): StrikeRecommendation[] {
  const { currentPrice, mid50Levels, clusters, decompression, prediction } = confluenceResult;
  const recommendations: StrikeRecommendation[] = [];
  
  // Get sorted 50% levels in direction of trade
  const relevantLevels = mid50Levels
    .filter(l => isCallDirection ? l.level > currentPrice : l.level < currentPrice)
    .sort((a, b) => isCallDirection 
      ? a.level - b.level  // Closest above for calls
      : b.level - a.level  // Closest below for puts
    );
  
  // Primary recommendation: ATM or 1 strike OTM for best delta exposure
  const atmStrike = Math.round(currentPrice);
  const atmGreeks = estimateGreeks(currentPrice, atmStrike, 7, 0.05, 0.25, isCallDirection);
  
  recommendations.push({
    strike: atmStrike,
    type: isCallDirection ? 'call' : 'put',
    reason: 'ATM strike - highest gamma, balanced delta',
    distanceFromPrice: ((atmStrike - currentPrice) / currentPrice) * 100,
    moneyness: 'ATM',
    estimatedDelta: atmGreeks.delta,
    confidenceScore: prediction.confidence,
    targetLevel: relevantLevels[0]?.level || (isCallDirection ? currentPrice * 1.02 : currentPrice * 0.98),
  });
  
  // Secondary: Strike at nearest 50% cluster
  if (clusters.length > 0) {
    const clusterLevel = clusters[0].avgLevel;
    // Find strike near cluster
    const clusterStrike = Math.round(clusterLevel);
    if (clusterStrike !== atmStrike) {
      const clusterGreeks = estimateGreeks(currentPrice, clusterStrike, 7, 0.05, 0.25, isCallDirection);
      const distPct = ((clusterStrike - currentPrice) / currentPrice) * 100;
      
      recommendations.push({
        strike: clusterStrike,
        type: isCallDirection ? 'call' : 'put',
        reason: `Strike at 50% cluster (${clusters[0].tfs.join('/')} converging)`,
        distanceFromPrice: distPct,
        moneyness: Math.abs(distPct) < 1 ? 'ATM' : distPct > 0 ? 'OTM' : 'ITM',
        estimatedDelta: clusterGreeks.delta,
        confidenceScore: Math.min(100, prediction.confidence + clusters[0].tfs.length * 5),
        targetLevel: clusterLevel,
      });
    }
  }
  
  // Tertiary: Nearest decompressing 50% level as target
  const decompLevels = mid50Levels.filter(l => l.isDecompressing);
  if (decompLevels.length > 0) {
    const primaryDecomp = decompLevels[0];
    const decompStrike = Math.round(primaryDecomp.level);
    if (decompStrike !== atmStrike && !recommendations.find(r => r.strike === decompStrike)) {
      const decompGreeks = estimateGreeks(currentPrice, decompStrike, 7, 0.05, 0.25, isCallDirection);
      const distPct = ((decompStrike - currentPrice) / currentPrice) * 100;
      
      recommendations.push({
        strike: decompStrike,
        type: isCallDirection ? 'call' : 'put',
        reason: `Target: ${primaryDecomp.tf} 50% level (actively decompressing)`,
        distanceFromPrice: distPct,
        moneyness: Math.abs(distPct) < 1 ? 'ATM' : distPct > 0 ? 'OTM' : 'ITM',
        estimatedDelta: decompGreeks.delta,
        confidenceScore: prediction.confidence,
        targetLevel: primaryDecomp.level,
      });
    }
  }
  
  return recommendations;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPIRATION SELECTION BASED ON CONFLUENCE TIMING
// ═══════════════════════════════════════════════════════════════════════════

function selectExpirationFromConfluence(
  confluenceResult: HierarchicalScanResult,
  scanMode: ScanMode
): ExpirationRecommendation[] {
  const expirationConfig = EXPIRATION_MAP[scanMode] || EXPIRATION_MAP.intraday_1h;
  const recommendations: ExpirationRecommendation[] = [];
  const today = new Date();
  
  // Get the number of decompressing TFs to gauge urgency
  const decompCount = confluenceResult.decompression.activeCount;
  const hasHighConfluence = decompCount >= 3;
  
  for (const dte of expirationConfig.dte) {
    const expDate = new Date(today);
    expDate.setDate(expDate.getDate() + dte);
    // Skip weekends for equity options
    while (expDate.getDay() === 0 || expDate.getDay() === 6) {
      expDate.setDate(expDate.getDate() + 1);
    }
    
    const dateStr = expDate.toISOString().split('T')[0];
    let thetaRisk: 'low' | 'moderate' | 'high' = 'low';
    if (dte <= 2) thetaRisk = 'high';
    else if (dte <= 7) thetaRisk = 'moderate';
    
    let timeframe: 'scalping' | 'intraday' | 'swing' | 'position' = 'intraday';
    if (dte <= 2) timeframe = 'scalping';
    else if (dte <= 7) timeframe = 'intraday';
    else if (dte <= 30) timeframe = 'swing';
    else timeframe = 'position';
    
    // Adjust confidence based on decompression timing
    let confidence = confluenceResult.prediction.confidence;
    if (hasHighConfluence && dte <= 5) {
      confidence = Math.min(100, confidence + 10);
    }
    
    const reason = dte === expirationConfig.dte[0]
      ? `Primary: ${expirationConfig.reason}`
      : `Alternative: More time for move to develop`;
    
    recommendations.push({
      dte,
      expirationDate: dateStr,
      reason,
      thetaRisk,
      timeframe,
      confidenceScore: confidence,
    });
  }
  
  return recommendations;
}

// ═══════════════════════════════════════════════════════════════════════════
// TRADE QUALITY GRADING (with O/I integration)
// ═══════════════════════════════════════════════════════════════════════════

function gradeTradeQuality(
  confluenceResult: HierarchicalScanResult,
  oiData: OpenInterestData | null = null
): { grade: 'A+' | 'A' | 'B' | 'C' | 'F'; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  
  // Confluence stack (0-25 points)
  const decompCount = confluenceResult.decompression.activeCount;
  if (decompCount >= 5) {
    score += 25;
    reasons.push(`✅ Mega confluence: ${decompCount} TFs decompressing`);
  } else if (decompCount >= 3) {
    score += 18;
    reasons.push(`✅ Strong confluence: ${decompCount} TFs decompressing`);
  } else if (decompCount >= 2) {
    score += 10;
    reasons.push(`⚡ Moderate confluence: ${decompCount} TFs`);
  } else {
    reasons.push(`⚠️ Low confluence: only ${decompCount} TF decompressing`);
  }
  
  // Direction clarity (0-25 points)
  const pullBias = Math.abs(confluenceResult.decompression.pullBias);
  if (pullBias >= 80) {
    score += 25;
    reasons.push(`✅ Very clear direction: ${pullBias.toFixed(0)}% bias`);
  } else if (pullBias >= 60) {
    score += 18;
    reasons.push(`✅ Clear direction: ${pullBias.toFixed(0)}% bias`);
  } else if (pullBias >= 40) {
    score += 10;
    reasons.push(`⚡ Moderate bias: ${pullBias.toFixed(0)}%`);
  } else {
    reasons.push(`⚠️ Weak/conflicting bias: ${pullBias.toFixed(0)}%`);
  }
  
  // Cluster magnets (0-15 points)
  if (confluenceResult.clusters.length >= 2) {
    score += 15;
    reasons.push(`✅ Multiple price clusters (${confluenceResult.clusters.length})`);
  } else if (confluenceResult.clusters.length === 1) {
    score += 10;
    reasons.push(`✅ Price cluster detected`);
  } else {
    reasons.push(`📍 No strong price clusters`);
  }
  
  // Prediction confidence (0-20 points)
  const confidence = confluenceResult.prediction.confidence;
  if (confidence >= 85) {
    score += 20;
    reasons.push(`✅ High confidence prediction: ${confidence}%`);
  } else if (confidence >= 70) {
    score += 15;
    reasons.push(`✅ Good confidence: ${confidence}%`);
  } else if (confidence >= 50) {
    score += 8;
    reasons.push(`⚡ Moderate confidence: ${confidence}%`);
  } else {
    reasons.push(`⚠️ Low confidence: ${confidence}%`);
  }
  
  // O/I Sentiment Alignment (0-15 points) - NEW
  if (oiData) {
    const direction = confluenceResult.decompression.netPullDirection;
    const oiAligned = (direction === 'bullish' && oiData.sentiment === 'bullish') ||
                      (direction === 'bearish' && oiData.sentiment === 'bearish');
    const oiConflict = (direction === 'bullish' && oiData.sentiment === 'bearish') ||
                       (direction === 'bearish' && oiData.sentiment === 'bullish');
    
    if (oiAligned) {
      score += 15;
      reasons.push(`✅ O/I confirms direction: P/C ratio ${oiData.pcRatio.toFixed(2)}`);
    } else if (oiConflict) {
      score -= 5;  // Penalty for conflict
      reasons.push(`⚠️ O/I conflicts: P/C ratio ${oiData.pcRatio.toFixed(2)} suggests ${oiData.sentiment}`);
    } else {
      score += 5;
      reasons.push(`📊 O/I neutral: P/C ratio ${oiData.pcRatio.toFixed(2)}`);
    }
    
    // Max pain proximity bonus (0-5 points)
    if (oiData.maxPainStrike) {
      const maxPainDist = Math.abs((oiData.maxPainStrike - confluenceResult.currentPrice) / confluenceResult.currentPrice) * 100;
      if (maxPainDist <= 2) {
        score += 5;
        reasons.push(`✅ Near max pain: $${oiData.maxPainStrike.toFixed(0)}`);
      }
    }
  } else {
    reasons.push(`📊 O/I data unavailable`);
  }
  
  // Grade assignment
  let grade: 'A+' | 'A' | 'B' | 'C' | 'F';
  if (score >= 90) grade = 'A+';
  else if (score >= 75) grade = 'A';
  else if (score >= 55) grade = 'B';
  else if (score >= 35) grade = 'C';
  else grade = 'F';
  
  return { grade, reasons };
}

// ═══════════════════════════════════════════════════════════════════════════
// ENTRY TIMING BASED ON CONFLUENCE WINDOWS
// ═══════════════════════════════════════════════════════════════════════════

function calculateEntryTiming(
  confluenceResult: HierarchicalScanResult
): EntryTimingAdvice {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentHourDecimal = hour + minute / 60;
  
  // EST market hours (adjust for timezone)
  const estOffset = -5;
  const estHour = (hour + estOffset + 24) % 24;
  
  const decompCount = confluenceResult.decompression.activeCount;
  const activeDecomps = confluenceResult.decompression.decompressions.filter(d => d.isDecompressing);
  
  // Find nearest decompression close
  const nearestClose = activeDecomps
    .map(d => d.minsToClose)
    .filter(m => m > 0)
    .sort((a, b) => a - b)[0];
  
  const avoidWindows: string[] = [];
  
  // Lunch lull (12pm-2pm EST)
  if (estHour >= 12 && estHour < 14) {
    avoidWindows.push('Currently in lunch lull (12-2pm EST) - lower volume');
  }
  
  // Determine urgency
  let urgency: 'immediate' | 'within_hour' | 'wait' | 'no_trade' = 'wait';
  let reason = '';
  let idealWindow = '';
  
  if (confluenceResult.signalStrength === 'no_signal' || 
      confluenceResult.decompression.netPullDirection === 'neutral') {
    urgency = 'no_trade';
    reason = 'No clear directional signal - wait for confluence';
    idealWindow = 'Wait for TFs to align';
  } else if (decompCount >= 3 && Math.abs(confluenceResult.decompression.pullBias) >= 60) {
    urgency = 'immediate';
    reason = `${decompCount} TFs decompressing with strong bias - prime entry window`;
    idealWindow = nearestClose ? `Before ${nearestClose}m TF close` : 'Now';
  } else if (decompCount >= 2) {
    urgency = 'within_hour';
    reason = 'Good confluence building - enter on slight pullback';
    idealWindow = nearestClose ? `Within ${Math.min(nearestClose, 30)} minutes` : 'Within 30 minutes';
  } else if (nearestClose && nearestClose <= 15) {
    urgency = 'within_hour';
    reason = `TF close in ${nearestClose}m - wait for post-close confirmation`;
    idealWindow = `${nearestClose + 2}-${nearestClose + 10}m from now`;
  } else {
    urgency = 'wait';
    reason = 'Low confluence - wait for more TFs to decompress';
    idealWindow = 'Monitor for confluence buildup';
  }
  
  return {
    idealEntryWindow: idealWindow,
    urgency,
    reason,
    avoidWindows,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GREEKS ADVICE
// ═══════════════════════════════════════════════════════════════════════════

function generateGreeksAdvice(
  scanMode: ScanMode,
  expirationDte: number,
  signalStrength: string
): GreeksAdvice {
  const deltaConfig = DELTA_TARGETS[
    scanMode.startsWith('scalping') ? 'scalping' :
    scanMode.startsWith('intraday') ? 'intraday' :
    scanMode.startsWith('swing') ? 'swing' : 'position'
  ] || DELTA_TARGETS.intraday;
  
  let thetaWarning: string | null = null;
  if (expirationDte <= 2) {
    thetaWarning = '⚠️ HIGH THETA DECAY: 0-2 DTE options lose value rapidly. Exit same-day or next morning.';
  } else if (expirationDte <= 5) {
    thetaWarning = '⚡ Moderate theta: Consider closing before last 2 DTE if target not hit.';
  }
  
  let vegaConsideration: string | null = null;
  if (signalStrength === 'strong') {
    vegaConsideration = 'IV crush risk if playing earnings or events. Otherwise, IV expansion helps.';
  }
  
  let gammaAdvice: string | null = null;
  if (expirationDte <= 3) {
    gammaAdvice = 'High gamma = fast P/L swings. Be ready to exit quickly on target or stop.';
  }
  
  const overallAdvice = signalStrength === 'strong'
    ? `Target delta ${deltaConfig.label}. Strong confluence supports aggressive positioning.`
    : signalStrength === 'moderate'
    ? `Target delta ${deltaConfig.label}. Consider smaller position due to moderate signal.`
    : `Wait for better signal quality or use defined-risk spreads.`;
  
  return {
    deltaTarget: deltaConfig.label,
    thetaWarning,
    vegaConsideration,
    gammaAdvice,
    overallAdvice,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN ANALYZER CLASS
// ═══════════════════════════════════════════════════════════════════════════

export class OptionsConfluenceAnalyzer {
  private confluenceAgent: ConfluenceLearningAgent;
  
  constructor() {
    this.confluenceAgent = new ConfluenceLearningAgent();
  }
  
  /**
   * Analyze a symbol for options trading using Time Confluence
   */
  async analyzeForOptions(
    symbol: string,
    scanMode: ScanMode
  ): Promise<OptionsSetup> {
    // Get confluence analysis
    const confluenceResult = await this.confluenceAgent.scanHierarchical(symbol, scanMode);
    
    const { currentPrice, decompression, prediction, signalStrength, clusters, mid50Levels } = confluenceResult;
    
    // Fetch options chain for O/I analysis (stocks only, not crypto)
    let openInterestAnalysis: OpenInterestData | null = null;
    const isCrypto = symbol.includes('USD') && !symbol.includes('/');
    
    if (!isCrypto) {
      try {
        const optionsChain = await fetchOptionsChain(symbol);
        if (optionsChain) {
          openInterestAnalysis = analyzeOpenInterest(optionsChain.calls, optionsChain.puts, currentPrice, optionsChain.selectedExpiry);
          console.log(`📊 O/I Analysis (${optionsChain.selectedExpiry}): P/C=${openInterestAnalysis.pcRatio.toFixed(2)}, Sentiment=${openInterestAnalysis.sentiment}, Max Pain=$${openInterestAnalysis.maxPainStrike || 'N/A'}`);
        }
      } catch (err) {
        console.warn('O/I analysis failed:', err);
      }
    }
    
    // Determine trade direction
    const direction = decompression.netPullDirection;
    const isCallDirection = direction === 'bullish';
    
    // Grade trade quality (now includes O/I sentiment alignment)
    const { grade, reasons: qualityReasons } = gradeTradeQuality(confluenceResult, openInterestAnalysis);
    
    // Select strikes based on 50% levels
    const allStrikes = direction !== 'neutral' 
      ? selectStrikesFromConfluence(confluenceResult, isCallDirection)
      : [];
    
    const primaryStrike = allStrikes.length > 0 ? allStrikes[0] : null;
    const alternativeStrikes = allStrikes.slice(1);
    
    // Select expirations based on confluence timing
    const allExpirations = selectExpirationFromConfluence(confluenceResult, scanMode);
    const primaryExpiration = allExpirations.length > 0 ? allExpirations[0] : null;
    const alternativeExpirations = allExpirations.slice(1);
    
    // Entry timing
    const entryTiming = calculateEntryTiming(confluenceResult);
    
    // Greeks advice
    const greeksAdvice = generateGreeksAdvice(
      scanMode, 
      primaryExpiration?.dte || 7, 
      signalStrength
    );
    
    // Risk management (factor in O/I alignment)
    let maxRiskPercent = 2;
    const oiAligned = openInterestAnalysis && (
      (direction === 'bullish' && openInterestAnalysis.sentiment === 'bullish') ||
      (direction === 'bearish' && openInterestAnalysis.sentiment === 'bearish')
    );
    
    if (grade === 'A+') maxRiskPercent = oiAligned ? 3.5 : 3;
    else if (grade === 'A') maxRiskPercent = oiAligned ? 3 : 2.5;
    else if (grade === 'B') maxRiskPercent = 2;
    else if (grade === 'C') maxRiskPercent = 1;
    else maxRiskPercent = 0.5;
    
    const stopLossStrategy = signalStrength === 'strong'
      ? 'Exit if option loses 50% of premium or price crosses against 50% level'
      : 'Tight stop: Exit if option loses 35% of premium';
    
    const profitTargetStrategy = signalStrength === 'strong'
      ? 'Target 100-150% of premium at nearest 50% level cluster'
      : 'Target 50-80% of premium, take profits early';
    
    return {
      symbol,
      currentPrice,
      direction,
      confluenceStack: decompression.activeCount,
      decompressingTFs: decompression.decompressions
        .filter(d => d.isDecompressing)
        .map(d => d.tf),
      pullBias: decompression.pullBias,
      signalStrength,
      tradeQuality: grade,
      qualityReasons,
      primaryStrike,
      alternativeStrikes,
      primaryExpiration,
      alternativeExpirations,
      openInterestAnalysis,
      greeksAdvice,
      maxRiskPercent,
      stopLossStrategy,
      profitTargetStrategy,
      entryTiming,
    };
  }
  
  /**
   * Calculate theoretical P/L for an options setup
   */
  calculateTheoreticalPL(
    setup: OptionsSetup,
    strikeRec: StrikeRecommendation,
    expRec: ExpirationRecommendation,
    estimatedPremium: number,
    targetPrice: number
  ): {
    maxProfit: number;
    maxLoss: number;
    breakeven: number;
    targetReturn: number;
    targetReturnPercent: number;
  } {
    const { currentPrice } = setup;
    const isCall = strikeRec.type === 'call';
    const strike = strikeRec.strike;
    
    // At target price, what's the intrinsic value?
    const intrinsicAtTarget = isCall
      ? Math.max(0, targetPrice - strike)
      : Math.max(0, strike - targetPrice);
    
    // Rough extrinsic decay estimate
    const thetaDecayFactor = Math.max(0.5, 1 - (expRec.dte <= 3 ? 0.3 : 0.15));
    const estimatedValueAtTarget = intrinsicAtTarget + (estimatedPremium * thetaDecayFactor * 0.5);
    
    const maxLoss = estimatedPremium * 100; // Per contract
    const breakeven = isCall ? strike + estimatedPremium : strike - estimatedPremium;
    const targetReturn = (estimatedValueAtTarget - estimatedPremium) * 100;
    const targetReturnPercent = ((estimatedValueAtTarget - estimatedPremium) / estimatedPremium) * 100;
    
    // Theoretical max profit (unlimited for calls, strike - premium for puts)
    const maxProfit = isCall ? Infinity : (strike - estimatedPremium) * 100;
    
    return {
      maxProfit,
      maxLoss,
      breakeven,
      targetReturn,
      targetReturnPercent,
    };
  }
}

// Export singleton instance
export const optionsAnalyzer = new OptionsConfluenceAnalyzer();
