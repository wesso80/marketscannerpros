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

import { HierarchicalScanResult, ConfluenceLearningAgent, ScanMode, CandleCloseConfluence } from './confluence-learning-agent';

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
  
  // PRO TRADER FEATURES
  ivAnalysis: IVAnalysis | null;
  unusualActivity: UnusualActivity | null;
  expectedMove: ExpectedMove | null;
  tradeLevels: TradeLevels | null;
  
  // COMPOSITE SCORING (NEW)
  compositeScore: CompositeScore | null;
  strategyRecommendation: StrategyRecommendation | null;
  
  // CANDLE CLOSE CONFLUENCE (NEW) - When multiple TFs close together
  candleCloseConfluence: CandleCloseConfluence | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE SCORING SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

export interface SignalComponent {
  name: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  weight: number;           // 0-100 how much this factor contributes
  score: number;           // -100 to +100 (negative=bearish, positive=bullish)
  reason: string;
}

export interface CompositeScore {
  finalDirection: 'bullish' | 'bearish' | 'neutral';
  directionScore: number;   // -100 to +100
  confidence: number;       // 0-100% based on signal alignment
  components: SignalComponent[];
  conflicts: string[];      // List of conflicting signals
  alignedCount: number;     // How many signals agree
  totalSignals: number;
}

export interface StrategyRecommendation {
  strategy: string;         // e.g., "Bull Put Spread", "Long Call", etc.
  strategyType: 'buy_premium' | 'sell_premium' | 'neutral';
  reason: string;
  strikes?: {
    long?: number;
    short?: number;
  };
  riskProfile: 'defined' | 'undefined';
  maxRisk: string;
  maxReward: string;
}

export interface OpenInterestData {
  totalCallOI: number;
  totalPutOI: number;
  pcRatio: number;              // Put/Call ratio
  sentiment: 'bullish' | 'bearish' | 'neutral';
  sentimentReason: string;
  maxPainStrike: number | null;
  highOIStrikes: { strike: number; openInterest: number; type: 'call' | 'put'; delta?: number; gamma?: number; theta?: number; vega?: number; iv?: number }[];
  expirationDate: string;       // The expiration date being analyzed
}

export interface GreeksAdvice {
  deltaTarget: string;          // e.g., "0.50-0.70 for directional"
  thetaWarning: string | null;
  vegaConsideration: string | null;
  gammaAdvice: string | null;
  overallAdvice: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRO TRADER TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface IVAnalysis {
  currentIV: number;              // Current implied volatility (avg across ATM options)
  ivRank: number;                 // 0-100: Where is IV vs last 52 weeks
  ivPercentile: number;           // 0-100: % of days IV was lower
  ivSignal: 'sell_premium' | 'buy_premium' | 'neutral';
  ivReason: string;
}

export interface UnusualActivity {
  hasUnusualActivity: boolean;
  unusualStrikes: {
    strike: number;
    type: 'call' | 'put';
    volume: number;
    openInterest: number;
    volumeOIRatio: number;        // Volume / OI ratio
    signal: 'bullish' | 'bearish';
    reason: string;
  }[];
  smartMoneyDirection: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  alertLevel: 'high' | 'moderate' | 'low' | 'none';
  // Aggregate premium flow estimates
  callPremiumTotal: number;
  putPremiumTotal: number;
}

export interface ExpectedMove {
  weekly: number;                 // Expected $ move for weekly expiry
  weeklyPercent: number;          // Expected % move
  monthly: number;                // Expected $ move for monthly expiry
  monthlyPercent: number;
  selectedExpiry: number;         // Expected move for user-selected expiry
  selectedExpiryPercent: number;
  calculation: string;            // How it was calculated
}

export interface TradeLevels {
  entryZone: { low: number; high: number };
  stopLoss: number;
  stopLossPercent: number;
  target1: { price: number; reason: string; takeProfit: number };  // Take profit %
  target2: { price: number; reason: string; takeProfit: number } | null;
  target3: { price: number; reason: string; takeProfit: number } | null;
  riskRewardRatio: number;
  reasoning: string;
}

export interface EntryTimingAdvice {
  idealEntryWindow: string;     // e.g., "Next 5-15 minutes"
  urgency: 'immediate' | 'within_hour' | 'wait' | 'no_trade';
  reason: string;
  avoidWindows: string[];
  marketSession?: 'premarket' | 'regular' | 'afterhours' | 'closed';
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

async function fetchOptionsChain(symbol: string, targetExpiration?: string): Promise<{
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
    console.log(`📊 Fetching EOD options chain for ${symbol} (historical/delayed)${targetExpiration ? ` for expiry ${targetExpiration}` : ''}...`);
    
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
    
    // Collect all unique expiration dates
    const expiryMap: Record<string, number> = {};
    for (const opt of options) {
      if (opt.expiration) {
        expiryMap[opt.expiration] = (expiryMap[opt.expiration] || 0) + 1;
      }
    }
    
    // Use user-specified expiration if provided and valid, otherwise auto-select
    let bestExpiry: string;
    
    if (targetExpiration && expiryMap[targetExpiration]) {
      // User specified a valid expiration date
      bestExpiry = targetExpiration;
      console.log(`📅 Using user-specified expiration: ${bestExpiry} (${expiryMap[bestExpiry]} contracts)`);
    } else {
      // Auto-select: Find expiration closest to this Friday with the most contracts
      const targetFriday = getThisWeekFriday();
      const targetDateStr = targetFriday.toISOString().split('T')[0];
      
      bestExpiry = Object.keys(expiryMap)[0];
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
      console.log(`📅 Target Friday: ${targetDateStr}, Auto-selected expiry: ${bestExpiry}`);
    }
    
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
  // Calculate DTE for Greeks estimation fallback
  const expiryDate = new Date(expirationDate);
  const today = new Date();
  const daysToExpiry = Math.max(1, Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
  
  // Calculate total OI
  let totalCallOI = 0;
  let totalPutOI = 0;
  
  const strikeOI: Map<number, { callOI: number; putOI: number }> = new Map();
  
  // Store contracts with Greeks for high OI analysis
  const contractsWithGreeks: Array<{
    strike: number;
    openInterest: number;
    type: 'call' | 'put';
    delta?: number;
    gamma?: number;
    theta?: number;
    vega?: number;
    iv?: number;
  }> = [];
  
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
  let debugFirstCall = true;
  
  for (const call of calls) {
    // Alpha Vantage may use 'open_interest' or 'openInterest'
    const oiValue = call.open_interest || (call as unknown as Record<string, string>).openInterest || '0';
    const oi = parseInt(String(oiValue), 10) || 0;
    const strikeValue = call.strike || '0';
    const strike = parseFloat(String(strikeValue)) || 0;
    
    // Debug first call contract
    if (debugFirstCall && calls.length > 0) {
      console.log(`📊 DEBUG First call contract: strike=${strike}, open_interest field="${call.open_interest}", parsed OI=${oi}`);
      console.log(`📊 DEBUG Call fields: ${Object.keys(call).join(', ')}`);
      debugFirstCall = false;
    }
    
    if (strike > 0) allRawStrikes.push(strike);
    
    // Filter to reasonable strike range around current price
    if (strike > 0 && strike >= minStrike && strike <= maxStrike) {
      totalCallOI += oi;
      if (!strikeOI.has(strike)) strikeOI.set(strike, { callOI: 0, putOI: 0 });
      strikeOI.get(strike)!.callOI += oi;
      
      // Capture contract with Greeks - include all ATM/near-ATM contracts even with 0 OI
      // This ensures we always show Greeks data
      const isNearATM = Math.abs(strike - currentPrice) / currentPrice <= 0.10;  // Within 10% of price
      if (oi > 0 || isNearATM) {
        // Parse API Greeks if available
        const apiDelta = call.delta ? parseFloat(call.delta) : undefined;
        const apiGamma = call.gamma ? parseFloat(call.gamma) : undefined;
        const apiTheta = call.theta ? parseFloat(call.theta) : undefined;
        const apiVega = call.vega ? parseFloat(call.vega) : undefined;
        const iv = call.implied_volatility ? parseFloat(call.implied_volatility) : 0.25;  // Default 25% IV
        
        // Use estimateGreeks as fallback when API doesn't provide Greeks
        let delta = apiDelta, gamma = apiGamma, theta = apiTheta, vega = apiVega;
        if (apiDelta === undefined || apiGamma === undefined || apiTheta === undefined || apiVega === undefined) {
          const estimated = estimateGreeks(currentPrice, strike, daysToExpiry, 0.05, iv, true);
          delta = apiDelta ?? estimated.delta;
          gamma = apiGamma ?? estimated.gamma;
          theta = apiTheta ?? estimated.theta;
          vega = apiVega ?? estimated.vega;
        }
        
        contractsWithGreeks.push({
          strike,
          openInterest: oi,
          type: 'call',
          delta,
          gamma,
          theta,
          vega,
          iv,
        });
      }
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
      
      // Capture contract with Greeks - include all ATM/near-ATM contracts even with 0 OI
      const isNearATM = Math.abs(strike - currentPrice) / currentPrice <= 0.10;  // Within 10% of price
      if (oi > 0 || isNearATM) {
        // Parse API Greeks if available
        const apiDelta = put.delta ? parseFloat(put.delta) : undefined;
        const apiGamma = put.gamma ? parseFloat(put.gamma) : undefined;
        const apiTheta = put.theta ? parseFloat(put.theta) : undefined;
        const apiVega = put.vega ? parseFloat(put.vega) : undefined;
        const iv = put.implied_volatility ? parseFloat(put.implied_volatility) : 0.25;  // Default 25% IV
        
        // Use estimateGreeks as fallback when API doesn't provide Greeks
        let delta = apiDelta, gamma = apiGamma, theta = apiTheta, vega = apiVega;
        if (apiDelta === undefined || apiGamma === undefined || apiTheta === undefined || apiVega === undefined) {
          const estimated = estimateGreeks(currentPrice, strike, daysToExpiry, 0.05, iv, false);  // false = put
          delta = apiDelta ?? estimated.delta;
          gamma = apiGamma ?? estimated.gamma;
          theta = apiTheta ?? estimated.theta;
          vega = apiVega ?? estimated.vega;
        }
        
        contractsWithGreeks.push({
          strike,
          openInterest: oi,
          type: 'put',
          delta,
          gamma,
          theta,
          vega,
          iv,
        });
      }
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
  
  // Sort contracts: prioritize by OI, but if OI is 0 for all, sort by proximity to ATM
  const hasAnyOI = contractsWithGreeks.some(c => c.openInterest > 0);
  
  if (hasAnyOI) {
    // Normal sort by OI
    contractsWithGreeks.sort((a, b) => b.openInterest - a.openInterest);
  } else {
    // No OI data - sort by proximity to current price (ATM first)
    contractsWithGreeks.sort((a, b) => {
      const distA = Math.abs(a.strike - currentPrice);
      const distB = Math.abs(b.strike - currentPrice);
      return distA - distB;
    });
  }
  
  // Filter to strikes within 15% of current price for display (more relevant to traders)
  // This prevents showing far OTM lottery tickets that distort the view
  const relevantStrikes = contractsWithGreeks.filter(c => {
    const distance = Math.abs(c.strike - currentPrice) / currentPrice;
    return distance <= 0.15;  // Within 15% of current price
  });
  
  // If filtering removes too many, fall back to proximity-based selection
  const topStrikes = relevantStrikes.length >= 6 
    ? relevantStrikes.slice(0, 10)
    : contractsWithGreeks
        .sort((a, b) => Math.abs(a.strike - currentPrice) - Math.abs(b.strike - currentPrice))
        .slice(0, 10);
  
  console.log(`📊 O/I Summary (${expirationDate}): Calls=${totalCallOI.toLocaleString()}, Puts=${totalPutOI.toLocaleString()}, P/C=${pcRatio.toFixed(2)}, MaxPain=$${maxPainStrike}, Top strikes within 15%: ${topStrikes.length}`);
  
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
// PRO TRADER: IV RANK / PERCENTILE ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

function analyzeIV(
  calls: AVOptionContract[],
  puts: AVOptionContract[],
  currentPrice: number
): IVAnalysis {
  // Find ATM options (within 2% of current price) for accurate IV reading
  const atmRange = currentPrice * 0.02;
  const atmOptions = [...calls, ...puts].filter(opt => {
    const strike = parseFloat(opt.strike || '0');
    return Math.abs(strike - currentPrice) <= atmRange;
  });
  
  // Calculate average IV from ATM options
  let totalIV = 0;
  let ivCount = 0;
  for (const opt of atmOptions) {
    const iv = parseFloat(opt.implied_volatility || '0');
    if (iv > 0 && iv < 5) {  // Sanity check: IV between 0 and 500%
      totalIV += iv;
      ivCount++;
    }
  }
  
  const currentIV = ivCount > 0 ? totalIV / ivCount : 0.25;  // Default 25% if no data
  
  // IV Rank approximation based on typical stock IV ranges
  // Without historical data, we estimate based on absolute levels
  // < 15% = very low, 15-25% = low, 25-40% = normal, 40-60% = elevated, > 60% = high
  let ivRank: number;
  let ivPercentile: number;
  
  if (currentIV < 0.15) {
    ivRank = 10;
    ivPercentile = 15;
  } else if (currentIV < 0.25) {
    ivRank = 25;
    ivPercentile = 30;
  } else if (currentIV < 0.35) {
    ivRank = 45;
    ivPercentile = 50;
  } else if (currentIV < 0.50) {
    ivRank = 65;
    ivPercentile = 70;
  } else if (currentIV < 0.70) {
    ivRank = 80;
    ivPercentile = 85;
  } else {
    ivRank = 95;
    ivPercentile = 95;
  }
  
  // Determine signal
  let ivSignal: 'sell_premium' | 'buy_premium' | 'neutral';
  let ivReason: string;
  
  if (ivRank >= 70) {
    ivSignal = 'sell_premium';
    ivReason = `IV Rank ${ivRank}% is elevated. Consider credit spreads, iron condors, or selling premium.`;
  } else if (ivRank <= 30) {
    ivSignal = 'buy_premium';
    ivReason = `IV Rank ${ivRank}% is low. Buying options is relatively cheap. Consider long calls/puts or debit spreads.`;
  } else {
    ivSignal = 'neutral';
    ivReason = `IV Rank ${ivRank}% is in normal range. Both buying and selling strategies viable.`;
  }
  
  console.log(`📊 IV Analysis: Current IV=${(currentIV * 100).toFixed(1)}%, Rank=${ivRank}%, Signal=${ivSignal}`);
  
  return {
    currentIV,
    ivRank,
    ivPercentile,
    ivSignal,
    ivReason,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRO TRADER: UNUSUAL OPTIONS ACTIVITY DETECTION
// ═══════════════════════════════════════════════════════════════════════════

function detectUnusualActivity(
  calls: AVOptionContract[],
  puts: AVOptionContract[],
  currentPrice: number
): UnusualActivity {
  const unusualStrikes: UnusualActivity['unusualStrikes'] = [];
  const VOLUME_OI_THRESHOLD = 2.0;  // Volume > 2x Open Interest = unusual
  const MIN_VOLUME = 500;           // Minimum volume to consider
  
  // Check all options for unusual activity
  const allOptions = [...calls.map(c => ({ ...c, type: 'call' as const })), 
                      ...puts.map(p => ({ ...p, type: 'put' as const }))];
  
  for (const opt of allOptions) {
    const strike = parseFloat(opt.strike || '0');
    const volume = parseInt(opt.volume || '0', 10);
    const openInterest = parseInt(opt.open_interest || '0', 10);
    
    // Filter to reasonable strike range (within 15% of price)
    const distancePercent = Math.abs((strike - currentPrice) / currentPrice);
    if (distancePercent > 0.15) continue;
    
    // Check for unusual volume
    if (volume >= MIN_VOLUME && openInterest > 0) {
      const volumeOIRatio = volume / openInterest;
      
      if (volumeOIRatio >= VOLUME_OI_THRESHOLD) {
        const signal = opt.type === 'call' ? 'bullish' : 'bearish';
        const reason = volumeOIRatio >= 5 
          ? `🚨 EXTREME: ${volume.toLocaleString()} vol vs ${openInterest.toLocaleString()} OI (${volumeOIRatio.toFixed(1)}x)`
          : `⚡ High activity: ${volume.toLocaleString()} vol vs ${openInterest.toLocaleString()} OI (${volumeOIRatio.toFixed(1)}x)`;
        
        unusualStrikes.push({
          strike,
          type: opt.type,
          volume,
          openInterest,
          volumeOIRatio,
          signal,
          reason,
        });
      }
    }
  }
  
  // Sort by volume/OI ratio (most unusual first)
  unusualStrikes.sort((a, b) => b.volumeOIRatio - a.volumeOIRatio);
  
  // Determine smart money direction and estimate premium flow
  let bullishWeight = 0;
  let bearishWeight = 0;
  let callPremiumTotal = 0;
  let putPremiumTotal = 0;
  
  for (const strike of unusualStrikes) {
    const weight = strike.volumeOIRatio * (strike.volume / 1000);  // Weight by ratio and size
    // Estimate premium as volume * average premium (rough estimate based on distance from price)
    const distanceFromPrice = Math.abs(strike.strike - currentPrice);
    const estimatedPremium = Math.max(0.50, currentPrice * 0.02 - distanceFromPrice * 0.1) * strike.volume;
    
    if (strike.type === 'call') {
      bullishWeight += weight;
      callPremiumTotal += estimatedPremium;
    } else {
      bearishWeight += weight;
      putPremiumTotal += estimatedPremium;
    }
  }
  
  let smartMoneyDirection: 'bullish' | 'bearish' | 'neutral' | 'mixed';
  if (bullishWeight > bearishWeight * 1.5) {
    smartMoneyDirection = 'bullish';
  } else if (bearishWeight > bullishWeight * 1.5) {
    smartMoneyDirection = 'bearish';
  } else if (bullishWeight > 0 && bearishWeight > 0) {
    smartMoneyDirection = 'mixed';
  } else {
    smartMoneyDirection = 'neutral';
  }
  
  // Alert level
  let alertLevel: 'high' | 'moderate' | 'low' | 'none';
  const maxRatio = unusualStrikes.length > 0 ? unusualStrikes[0].volumeOIRatio : 0;
  
  if (maxRatio >= 5) {
    alertLevel = 'high';
  } else if (maxRatio >= 3) {
    alertLevel = 'moderate';
  } else if (maxRatio >= 2) {
    alertLevel = 'low';
  } else {
    alertLevel = 'none';
  }
  
  console.log(`📊 Unusual Activity: ${unusualStrikes.length} strikes flagged, Alert=${alertLevel}, Smart Money=${smartMoneyDirection}`);
  
  return {
    hasUnusualActivity: unusualStrikes.length > 0,
    unusualStrikes: unusualStrikes.slice(0, 5),  // Top 5 most unusual
    smartMoneyDirection,
    alertLevel,
    callPremiumTotal: Math.round(callPremiumTotal),
    putPremiumTotal: Math.round(putPremiumTotal),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRO TRADER: EXPECTED MOVE CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

function calculateExpectedMove(
  currentPrice: number,
  avgIV: number,
  selectedExpiryDTE: number
): ExpectedMove {
  // Expected Move Formula: Stock Price × IV × √(DTE/365)
  // This is based on 1 standard deviation move (68% probability)
  
  const weeklyDTE = 7;
  const monthlyDTE = 30;
  
  const weeklyMove = currentPrice * avgIV * Math.sqrt(weeklyDTE / 365);
  const weeklyPercent = (weeklyMove / currentPrice) * 100;
  
  const monthlyMove = currentPrice * avgIV * Math.sqrt(monthlyDTE / 365);
  const monthlyPercent = (monthlyMove / currentPrice) * 100;
  
  const selectedMove = currentPrice * avgIV * Math.sqrt(selectedExpiryDTE / 365);
  const selectedPercent = (selectedMove / currentPrice) * 100;
  
  console.log(`📊 Expected Move: Weekly ±$${weeklyMove.toFixed(2)} (${weeklyPercent.toFixed(1)}%), Monthly ±$${monthlyMove.toFixed(2)} (${monthlyPercent.toFixed(1)}%)`);
  
  return {
    weekly: weeklyMove,
    weeklyPercent,
    monthly: monthlyMove,
    monthlyPercent,
    selectedExpiry: selectedMove,
    selectedExpiryPercent: selectedPercent,
    calculation: `Price × IV × √(DTE/365) = $${currentPrice.toFixed(2)} × ${(avgIV * 100).toFixed(0)}% × √(${selectedExpiryDTE}/365)`,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// PRO TRADER: SPECIFIC ENTRY/EXIT LEVELS
// ═══════════════════════════════════════════════════════════════════════════

function calculateTradeLevels(
  confluenceResult: HierarchicalScanResult,
  direction: 'bullish' | 'bearish' | 'neutral',
  maxPainStrike: number | null
): TradeLevels | null {
  if (direction === 'neutral') return null;
  
  const { currentPrice, mid50Levels, clusters, decompression } = confluenceResult;
  const isLong = direction === 'bullish';
  
  // Entry Zone: Current price with small buffer based on volatility
  const entryBuffer = currentPrice * 0.005;  // 0.5% buffer
  const entryZone = {
    low: isLong ? currentPrice - entryBuffer : currentPrice,
    high: isLong ? currentPrice : currentPrice + entryBuffer,
  };
  
  // Stop Loss: Below/above nearest support/resistance or 50% level
  const opposingLevels = mid50Levels
    .filter(l => isLong ? l.level < currentPrice : l.level > currentPrice)
    .sort((a, b) => isLong 
      ? b.level - a.level  // Closest below for longs
      : a.level - b.level  // Closest above for shorts
    );
  
  // Find a 50% level as stop reference
  const stopReference = opposingLevels.length > 0 
    ? opposingLevels[0].level 
    : currentPrice * (isLong ? 0.98 : 1.02);
  
  // Add buffer beyond the level
  const stopBuffer = currentPrice * 0.003;  // 0.3% beyond level
  const stopLoss = isLong 
    ? stopReference - stopBuffer 
    : stopReference + stopBuffer;
  const stopLossPercent = Math.abs((stopLoss - currentPrice) / currentPrice) * 100;
  
  // Targets: Based on 50% levels and clusters in direction of trade
  const targetLevels = mid50Levels
    .filter(l => isLong ? l.level > currentPrice : l.level < currentPrice)
    .sort((a, b) => isLong 
      ? a.level - b.level  // Closest first for longs
      : b.level - a.level  // Closest first for shorts
    );
  
  // Target 1: Nearest 50% level or cluster
  const t1Level = targetLevels.length > 0 ? targetLevels[0] : null;
  const t1Price = t1Level?.level || currentPrice * (isLong ? 1.02 : 0.98);
  const target1 = {
    price: t1Price,
    reason: t1Level ? `${t1Level.tf} 50% level` : 'Default 2% target',
    takeProfit: 50,  // Take 50% off at first target
  };
  
  // Target 2: Next 50% level or max pain
  let t2Price = targetLevels.length > 1 ? targetLevels[1].level : null;
  let t2Reason = targetLevels.length > 1 ? `${targetLevels[1].tf} 50% level` : '';
  
  // If max pain is in our direction and beyond T1, use it
  if (maxPainStrike && ((isLong && maxPainStrike > t1Price) || (!isLong && maxPainStrike < t1Price))) {
    if (!t2Price || (isLong && maxPainStrike < t2Price) || (!isLong && maxPainStrike > t2Price)) {
      t2Price = maxPainStrike;
      t2Reason = 'Max Pain level';
    }
  }
  
  // If T2 doesn't exist or is too close to T1, create a scaled target
  // T2 should be at least 1.5x further than T1 from entry
  const t1Distance = Math.abs(t1Price - currentPrice);
  const t2MinDistance = t1Distance * 1.8;  // T2 at least 80% further than T1
  
  if (!t2Price || Math.abs(t2Price - t1Price) < t1Distance * 0.3) {
    // Create T2 at 1.8x the distance of T1
    t2Price = isLong 
      ? currentPrice + t2MinDistance 
      : currentPrice - t2MinDistance;
    t2Reason = 'Extended target (1.8× T1 distance)';
  }
  
  const target2 = t2Price ? {
    price: t2Price,
    reason: t2Reason,
    takeProfit: 30,  // Take 30% at second target
  } : null;
  
  // Target 3: Extended target from clusters
  const clusterTarget = clusters.find(c => 
    isLong ? c.avgLevel > (t2Price || t1Price) : c.avgLevel < (t2Price || t1Price)
  );
  
  const target3 = clusterTarget ? {
    price: clusterTarget.avgLevel,
    reason: `${clusterTarget.tfs.join('/')} cluster convergence`,
    takeProfit: 20,  // Let remaining 20% run to cluster
  } : null;
  
  // Risk/Reward Ratio
  const risk = Math.abs(currentPrice - stopLoss);
  const reward = Math.abs(target1.price - currentPrice);
  const riskRewardRatio = risk > 0 ? reward / risk : 0;
  
  // Build reasoning
  const reasoning = `Entry ${isLong ? 'above' : 'below'} $${entryZone.low.toFixed(2)}-$${entryZone.high.toFixed(2)}. ` +
    `Stop at $${stopLoss.toFixed(2)} (${stopLossPercent.toFixed(1)}% risk). ` +
    `Target 1: $${target1.price.toFixed(2)} (take 50%). ` +
    (target2 ? `Target 2: $${target2.price.toFixed(2)} (take 30%). ` : '') +
    `R:R = ${riskRewardRatio.toFixed(1)}:1`;
  
  console.log(`📊 Trade Levels: Entry $${currentPrice.toFixed(2)}, Stop $${stopLoss.toFixed(2)}, T1 $${target1.price.toFixed(2)}, R:R ${riskRewardRatio.toFixed(1)}:1`);
  
  return {
    entryZone,
    stopLoss,
    stopLossPercent,
    target1,
    target2,
    target3,
    riskRewardRatio,
    reasoning,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPOSITE SCORING SYSTEM - WEIGHTED MULTI-SIGNAL ANALYSIS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * REFACTORED SCORING SYSTEM v2.0
 * 
 * Split into two independent tracks:
 * 
 * TRACK A - DIRECTION SCORE (determines Bull/Bear/Neutral)
 * Only includes signals that are genuinely directional:
 * - Unusual Activity: 35% (smart money premium flow)
 * - O/I Sentiment (P/C ratio): 25%  
 * - Time Confluence: 25%
 * - Max Pain Position: 15% (dynamic by DTE)
 * 
 * TRACK B - SETUP QUALITY SCORE (determines A+/A/B/C grade)
 * Includes factors that affect trade quality, not direction:
 * - IV Environment: 35% (strategy suitability)
 * - Risk:Reward: 35% (trade quality)
 * - Signal Agreement: 30% (how aligned are directional signals)
 * 
 * Confidence = weighted agreement of directional signals with final direction
 */
function calculateCompositeScore(
  confluenceResult: HierarchicalScanResult,
  oiAnalysis: any,
  unusualActivity: any,
  ivRank: any,
  tradeLevels: any,
  maxPainData?: { maxPain: number; currentPrice: number },
  dte?: number  // Days to expiration for dynamic weighting
): CompositeScore {
  const components: SignalComponent[] = [];
  const conflicts: string[] = [];
  
  // ═══════════════════════════════════════════════════════════════════════
  // TRACK A: DIRECTION SCORE (only directional signals)
  // ═══════════════════════════════════════════════════════════════════════
  
  let directionWeightedScore = 0;
  let directionTotalWeight = 0;
  
  // Helper: Smooth score mapping with clamping
  const smoothMap = (value: number, inMin: number, inMax: number, outMin: number, outMax: number): number => {
    const clamped = Math.max(inMin, Math.min(inMax, value));
    return outMin + ((clamped - inMin) / (inMax - inMin)) * (outMax - outMin);
  };
  
  // 1. UNUSUAL ACTIVITY (30% of direction) - Smart money signal
  // Reduced from 35% to prevent flow dominance on big names during news
  const unusualWeight = 0.30;
  let unusualScore = 0;
  let unusualDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (unusualActivity && unusualActivity.hasUnusualActivity) {
    const callPremium = unusualActivity.callPremiumTotal || 0;
    const putPremium = unusualActivity.putPremiumTotal || 0;
    const totalPremium = callPremium + putPremium;
    
    // Guardrail: Require minimum premium to trust the signal
    const MIN_PREMIUM_THRESHOLD = 50000; // $50k minimum to avoid noise
    
    if (totalPremium >= MIN_PREMIUM_THRESHOLD) {
      // Calculate net flow ratio: (calls - puts) / total
      // Range: -1 (all puts) to +1 (all calls)
      const netFlowRatio = totalPremium > 0 ? (callPremium - putPremium) / totalPremium : 0;
      
      // Winsorize: Cap extreme ratios to prevent single whale from dominating
      const cappedRatio = Math.max(-0.8, Math.min(0.8, netFlowRatio));
      
      // Map to score: -80 to +80 (capped, not full ±100)
      unusualScore = cappedRatio * 100;
      
      // Calculate raw premium ratio for dead zone check
      const premiumRatio = putPremium > 0 ? callPremium / putPremium : (callPremium > 0 ? 10 : 1);
      const isInDeadZone = (premiumRatio >= 0.9 && premiumRatio <= 1.1) || Math.abs(unusualScore) < 15;
      
      if (isInDeadZone) {
        // PRECISE DEAD ZONE: balanced flow or tiny imbalance = neutral
        unusualDirection = 'neutral';
        unusualScore = 0;
      } else if (cappedRatio > 0.15) {
        unusualDirection = 'bullish';
      } else if (cappedRatio < -0.15) {
        unusualDirection = 'bearish';
      } else {
        // Fallback for edge cases
        unusualDirection = 'neutral';
        unusualScore = 0;
      }
      
      components.push({
        name: 'Unusual Activity',
        direction: unusualDirection,
        weight: unusualWeight,
        score: unusualScore,
        reason: `Net flow: $${((callPremium - putPremium) / 1000).toFixed(0)}k (${(netFlowRatio * 100).toFixed(0)}% call bias)`
      });
      
      directionWeightedScore += unusualScore * unusualWeight;
      directionTotalWeight += unusualWeight;
    } else {
      components.push({
        name: 'Unusual Activity',
        direction: 'neutral',
        weight: unusualWeight,
        score: 0,
        reason: `Insufficient volume ($${(totalPremium / 1000).toFixed(0)}k < $50k threshold)`
      });
    }
  } else {
    components.push({
      name: 'Unusual Activity',
      direction: 'neutral',
      weight: unusualWeight,
      score: 0,
      reason: 'No unusual activity detected'
    });
  }

  // 2. O/I SENTIMENT - Put/Call Ratio (25% of direction)
  const oiWeight = 0.25;
  let oiScore = 0;
  let oiDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (oiAnalysis && oiAnalysis.avgPCRatio) {
    const pcRatio = oiAnalysis.avgPCRatio;
    
    // Use z-score-like mapping:
    // P/C 0.5 or less = strongly bullish (+80)
    // P/C 0.7 = moderately bullish (+40)
    // P/C 0.85 = neutral (0)
    // P/C 1.0 = moderately bearish (-40)
    // P/C 1.3+ = strongly bearish (-80)
    
    const neutralPC = 0.85; // Typical baseline
    const deviation = pcRatio - neutralPC;
    
    // Smooth mapping: each 0.1 deviation = ~25 points
    oiScore = -deviation * 250; // Negative because high P/C = bearish
    oiScore = Math.max(-80, Math.min(80, oiScore)); // Cap at ±80
    
    if (oiScore > 20) {
      oiDirection = 'bullish';
    } else if (oiScore < -20) {
      oiDirection = 'bearish';
    } else {
      oiDirection = 'neutral';
    }
    
    components.push({
      name: 'O/I Sentiment',
      direction: oiDirection,
      weight: oiWeight,
      score: oiScore,
      reason: `P/C: ${pcRatio.toFixed(2)} (${oiDirection === 'bullish' ? 'call-heavy' : oiDirection === 'bearish' ? 'put-heavy' : 'balanced'})`
    });
    
    directionWeightedScore += oiScore * oiWeight;
    directionTotalWeight += oiWeight;
  }

  // 3. TIME CONFLUENCE (30% of direction)
  // Increased from 25% - price action confirmation is co-equal king with flow
  const confluenceWeight = 0.30;
  let confluenceScore = 0;
  let confluenceDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (confluenceResult && confluenceResult.prediction) {
    const pred = confluenceResult.prediction;
    confluenceDirection = pred.direction;
    
    // Map confidence (0-100) to score based on direction
    if (pred.direction === 'bullish') {
      confluenceScore = pred.confidence; // 0 to +100
    } else if (pred.direction === 'bearish') {
      confluenceScore = -pred.confidence; // 0 to -100
    } else {
      confluenceScore = 0;
    }
    
    components.push({
      name: 'Time Confluence',
      direction: confluenceDirection,
      weight: confluenceWeight,
      score: confluenceScore,
      reason: `${pred.direction.toUpperCase()} alignment (${pred.confidence.toFixed(0)}% conf)`
    });
    
    directionWeightedScore += confluenceScore * confluenceWeight;
    directionTotalWeight += confluenceWeight;
  }

  // 4. MAX PAIN POSITION (15% of direction, DYNAMIC by DTE)
  // Pinning effects are strongest 0-7 DTE, weak beyond 14 DTE
  const effectiveDte = dte ?? 14; // Default to 14 if not provided
  let maxPainWeight = 0.15;
  
  // Dynamic weight: full weight at DTE 0-3, half at 7, near-zero at 14+
  if (effectiveDte <= 3) {
    maxPainWeight = 0.15;
  } else if (effectiveDte <= 7) {
    maxPainWeight = 0.15 * (1 - (effectiveDte - 3) / 8); // Linear decay
  } else if (effectiveDte <= 14) {
    maxPainWeight = 0.05 * (1 - (effectiveDte - 7) / 14);
  } else {
    maxPainWeight = 0; // Ignore max pain for longer-dated
  }
  
  let maxPainScore = 0;
  let maxPainDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  
  if (maxPainData && maxPainData.maxPain > 0 && maxPainWeight > 0) {
    const priceDiffPercent = ((maxPainData.currentPrice - maxPainData.maxPain) / maxPainData.maxPain) * 100;
    
    // Price below max pain = pull upward (bullish)
    // Price above max pain = pull downward (bearish)
    // Smooth mapping: ±10% from max pain = ±100 score
    maxPainScore = -priceDiffPercent * 10; // Negative because above max pain = bearish pull
    maxPainScore = Math.max(-100, Math.min(100, maxPainScore));
    
    // Dead zone: if within 1.5% of max pain, consider neutral
    if (Math.abs(priceDiffPercent) < 1.5) {
      maxPainScore = 0;
      maxPainDirection = 'neutral';
    } else if (maxPainScore > 0) {
      maxPainDirection = 'bullish';
    } else {
      maxPainDirection = 'bearish';
    }
    
    components.push({
      name: 'Max Pain Position',
      direction: maxPainDirection,
      weight: maxPainWeight,
      score: maxPainScore,
      reason: `${priceDiffPercent > 0 ? 'Above' : 'Below'} max pain ($${maxPainData.maxPain.toFixed(2)}) by ${Math.abs(priceDiffPercent).toFixed(1)}% [DTE: ${effectiveDte}]`
    });
    
    if (maxPainWeight > 0) {
      directionWeightedScore += maxPainScore * maxPainWeight;
      directionTotalWeight += maxPainWeight;
    }
  }

  // Calculate normalized direction score
  const normalizedDirectionScore = directionTotalWeight > 0 
    ? directionWeightedScore / directionTotalWeight 
    : 0;
  
  // Determine final direction based on direction score only
  let finalDirection: 'bullish' | 'bearish' | 'neutral';
  if (normalizedDirectionScore > 15) {
    finalDirection = 'bullish';
  } else if (normalizedDirectionScore < -15) {
    finalDirection = 'bearish';
  } else {
    finalDirection = 'neutral';
  }

  // ═══════════════════════════════════════════════════════════════════════
  // TRACK B: SETUP QUALITY SCORE (non-directional factors)
  // ═══════════════════════════════════════════════════════════════════════
  
  let qualityScore = 0;
  let qualityMaxScore = 0;
  
  // 5. IV ENVIRONMENT (35% of quality) - Strategy suitability, NOT direction
  const ivQualityWeight = 0.35;
  let ivScore = 0;
  
  if (ivRank) {
    const ivPercentile = ivRank.rank || 50;
    
    // Quality scoring for IV:
    // Low IV (<30) = great for buying premium = high quality
    // High IV (>70) = great for selling premium = high quality  
    // Mid IV (30-70) = either works, moderate quality
    
    if (ivPercentile <= 30) {
      ivScore = 80 + (30 - ivPercentile); // 80-110 → capped at 100
    } else if (ivPercentile >= 70) {
      ivScore = 80 + (ivPercentile - 70); // 80-110 → capped at 100
    } else {
      // Mid IV: moderate quality
      ivScore = 50;
    }
    ivScore = Math.min(100, ivScore);
    
    const ivStrategy = ivPercentile > 70 ? 'SELL premium (spreads)' : ivPercentile < 30 ? 'BUY premium (directional)' : 'Either approach';
    
    components.push({
      name: 'IV Environment',
      direction: 'neutral', // IV is never directional
      weight: ivQualityWeight,
      score: ivScore,
      reason: `IV Rank: ${ivPercentile.toFixed(0)}% → ${ivStrategy}`
    });
    
    qualityScore += ivScore * ivQualityWeight;
    qualityMaxScore += 100 * ivQualityWeight;
  }

  // 6. RISK:REWARD (35% of quality) - Smooth continuous mapping
  const rrQualityWeight = 0.35;
  let rrScore = 0;
  
  if (tradeLevels && tradeLevels.riskRewardRatio) {
    const rr = tradeLevels.riskRewardRatio;
    
    // Smooth continuous mapping (no discontinuities):
    // R:R 0.0 → -50 (terrible)
    // R:R 0.5 → -25
    // R:R 1.0 → +25 (break-even is okay, not great)
    // R:R 1.5 → +50
    // R:R 2.0 → +70
    // R:R 3.0 → +85
    // R:R 4.0+ → +95 (capped)
    
    if (rr <= 0) {
      rrScore = -50;
    } else if (rr <= 1) {
      // 0 to 1: maps -50 to +25
      rrScore = -50 + (rr * 75);
    } else if (rr <= 2) {
      // 1 to 2: maps +25 to +70
      rrScore = 25 + ((rr - 1) * 45);
    } else if (rr <= 4) {
      // 2 to 4: maps +70 to +95
      rrScore = 70 + ((rr - 2) * 12.5);
    } else {
      rrScore = 95; // Cap at 4:1+
    }
    
    const rrGrade = rr >= 2.5 ? 'Excellent' : rr >= 1.5 ? 'Good' : rr >= 1 ? 'Acceptable' : 'POOR';
    
    components.push({
      name: 'Risk:Reward',
      direction: 'neutral', // R:R is quality, not direction
      weight: rrQualityWeight,
      score: rrScore,
      reason: `R:R ${rr.toFixed(1)}:1 - ${rrGrade}`
    });
    
    qualityScore += Math.max(0, rrScore) * rrQualityWeight; // Only positive contributes to quality
    qualityMaxScore += 100 * rrQualityWeight;
  }

  // 7. SIGNAL AGREEMENT (30% of quality)
  // Formula: sum(weight_i × |strength_i| for aligned signals) / sum(weight_i × |strength_i| for all signals)
  const agreementWeight = 0.30;
  
  // Get directional components only (exclude neutral signals)
  const directionalComponents = components.filter(c => 
    ['Unusual Activity', 'O/I Sentiment', 'Time Confluence', 'Max Pain Position'].includes(c.name)
    && c.direction !== 'neutral'
  );
  
  // Calculate weighted agreement with final direction using strength-weighted formula
  let alignedWeightedStrength = 0;
  let totalWeightedStrength = 0;
  
  for (const comp of directionalComponents) {
    const strength = Math.abs(comp.score) / 100; // 0 to 1
    const weightedStrength = comp.weight * strength;
    
    // Add to total for ALL available signals
    totalWeightedStrength += weightedStrength;
    
    // Add to aligned only if agrees with final direction
    if (comp.direction === finalDirection) {
      alignedWeightedStrength += weightedStrength;
    }
  }
  
  // Agreement = aligned / total (handles missing data gracefully)
  const normalizedAgreement = totalWeightedStrength > 0 
    ? (alignedWeightedStrength / totalWeightedStrength) * 100 
    : 50; // Default to 50% if no directional signals
  
  qualityScore += normalizedAgreement * agreementWeight;
  qualityMaxScore += 100 * agreementWeight;

  // ═══════════════════════════════════════════════════════════════════════
  // CONFIDENCE CALCULATION (weighted agreement, not simple count)
  // ═══════════════════════════════════════════════════════════════════════
  
  // Confidence = how much weight agrees with the final direction, scaled by signal strength
  let confidenceNumerator = 0;
  let confidenceDenominator = 0;
  
  for (const comp of directionalComponents) {
    const signalStrength = Math.abs(comp.score) / 100; // 0 to 1
    const weightedStrength = comp.weight * signalStrength;
    
    confidenceDenominator += weightedStrength;
    
    if (comp.direction === finalDirection) {
      confidenceNumerator += weightedStrength;
    } else if (comp.direction !== 'neutral') {
      // Opposing signal reduces confidence
      confidenceNumerator -= weightedStrength * 0.5;
    }
  }
  
  let confidence = confidenceDenominator > 0 
    ? Math.max(0, Math.min(100, (confidenceNumerator / confidenceDenominator) * 100))
    : 50;
  
  // If neutral direction, confidence is low by definition
  if (finalDirection === 'neutral') {
    confidence = Math.min(confidence, 40);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CONFLICT DETECTION
  // ═══════════════════════════════════════════════════════════════════════
  
  const bullishSignals = directionalComponents.filter(c => c.direction === 'bullish');
  const bearishSignals = directionalComponents.filter(c => c.direction === 'bearish');
  
  if (bullishSignals.length > 0 && bearishSignals.length > 0) {
    const bullNames = bullishSignals.map(c => c.name).join(', ');
    const bearNames = bearishSignals.map(c => c.name).join(', ');
    conflicts.push(`⚠️ CONFLICT: ${bullNames} → BULLISH but ${bearNames} → BEARISH`);
  }
  
  // IV warning
  if (ivRank && ivRank.rank > 70 && finalDirection !== 'neutral') {
    conflicts.push(`⚠️ HIGH IV (${ivRank.rank.toFixed(0)}%): Consider spreads instead of naked ${finalDirection === 'bullish' ? 'calls' : 'puts'}`);
  }
  
  // Poor R:R warning
  if (tradeLevels && tradeLevels.riskRewardRatio < 1) {
    conflicts.push(`⚠️ POOR R:R (${tradeLevels.riskRewardRatio.toFixed(1)}:1): Risk exceeds potential reward`);
  }

  console.log(`🎯 Direction: ${normalizedDirectionScore.toFixed(1)} → ${finalDirection.toUpperCase()} | Quality: ${(qualityScore/qualityMaxScore*100).toFixed(0)}% | Confidence: ${confidence.toFixed(0)}%`);

  return {
    finalDirection,
    directionScore: normalizedDirectionScore,
    confidence,
    components,
    conflicts,
    alignedCount: finalDirection === 'bullish' ? bullishSignals.length : bearishSignals.length,
    totalSignals: components.length
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STRATEGY RECOMMENDATION BASED ON IV ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════

function recommendStrategy(
  compositeScore: CompositeScore,
  ivRank: any,
  currentPrice: number,
  atmStrike?: number
): StrategyRecommendation {
  const direction = compositeScore.finalDirection;
  const ivPercentile = ivRank?.rank || 50;
  const confidence = compositeScore.confidence;
  
  const strike = atmStrike || Math.round(currentPrice);
  const spreadWidth = Math.round(currentPrice * 0.02); // ~2% width for spreads

  // High IV environment (>70%) - SELL premium
  if (ivPercentile > 70) {
    if (direction === 'bullish') {
      return {
        strategy: 'Bull Put Spread',
        strategyType: 'sell_premium',
        reason: `High IV (${ivPercentile.toFixed(0)}%) + Bullish bias → Sell put spreads to collect premium`,
        strikes: { short: strike, long: strike - spreadWidth },
        riskProfile: 'defined',
        maxRisk: `$${(spreadWidth * 100).toFixed(0)} per contract (spread width)`,
        maxReward: `Premium collected (typically 30-40% of width)`
      };
    } else if (direction === 'bearish') {
      return {
        strategy: 'Bear Call Spread',
        strategyType: 'sell_premium',
        reason: `High IV (${ivPercentile.toFixed(0)}%) + Bearish bias → Sell call spreads to collect premium`,
        strikes: { short: strike, long: strike + spreadWidth },
        riskProfile: 'defined',
        maxRisk: `$${(spreadWidth * 100).toFixed(0)} per contract (spread width)`,
        maxReward: `Premium collected (typically 30-40% of width)`
      };
    } else {
      return {
        strategy: 'Iron Condor',
        strategyType: 'sell_premium',
        reason: `High IV (${ivPercentile.toFixed(0)}%) + Neutral bias → Sell both sides`,
        strikes: { short: strike, long: undefined },
        riskProfile: 'defined',
        maxRisk: `Spread width minus premium collected`,
        maxReward: `Total premium collected from both spreads`
      };
    }
  }
  
  // Low IV environment (<30%) - BUY premium
  if (ivPercentile < 30) {
    if (direction === 'bullish') {
      if (confidence > 70) {
        return {
          strategy: 'Long Call',
          strategyType: 'buy_premium',
          reason: `Low IV (${ivPercentile.toFixed(0)}%) + Strong Bullish (${confidence.toFixed(0)}% conf) → Buy calls for max upside`,
          strikes: { long: strike },
          riskProfile: 'defined',
          maxRisk: `Premium paid (100% of investment)`,
          maxReward: `Unlimited upside`
        };
      } else {
        return {
          strategy: 'Call Debit Spread',
          strategyType: 'buy_premium',
          reason: `Low IV (${ivPercentile.toFixed(0)}%) + Moderate Bullish → Reduced cost spread`,
          strikes: { long: strike, short: strike + spreadWidth },
          riskProfile: 'defined',
          maxRisk: `Net debit paid`,
          maxReward: `$${(spreadWidth * 100).toFixed(0)} per contract minus debit`
        };
      }
    } else if (direction === 'bearish') {
      if (confidence > 70) {
        return {
          strategy: 'Long Put',
          strategyType: 'buy_premium',
          reason: `Low IV (${ivPercentile.toFixed(0)}%) + Strong Bearish (${confidence.toFixed(0)}% conf) → Buy puts for max downside capture`,
          strikes: { long: strike },
          riskProfile: 'defined',
          maxRisk: `Premium paid (100% of investment)`,
          maxReward: `Strike price minus premium (stock to zero)`
        };
      } else {
        return {
          strategy: 'Put Debit Spread',
          strategyType: 'buy_premium',
          reason: `Low IV (${ivPercentile.toFixed(0)}%) + Moderate Bearish → Reduced cost spread`,
          strikes: { long: strike, short: strike - spreadWidth },
          riskProfile: 'defined',
          maxRisk: `Net debit paid`,
          maxReward: `$${(spreadWidth * 100).toFixed(0)} per contract minus debit`
        };
      }
    } else {
      return {
        strategy: 'Long Straddle',
        strategyType: 'buy_premium',
        reason: `Low IV (${ivPercentile.toFixed(0)}%) + Neutral → Bet on volatility expansion`,
        strikes: { long: strike },
        riskProfile: 'defined',
        maxRisk: `Total premium paid for call + put`,
        maxReward: `Unlimited in either direction`
      };
    }
  }
  
  // Medium IV environment (30-70%) - Either approach based on direction strength
  if (direction === 'bullish') {
    if (confidence > 60) {
      return {
        strategy: 'Call Debit Spread',
        strategyType: 'buy_premium',
        reason: `Medium IV (${ivPercentile.toFixed(0)}%) + Bullish → Balanced risk/reward with spread`,
        strikes: { long: strike, short: strike + spreadWidth },
        riskProfile: 'defined',
        maxRisk: `Net debit paid`,
        maxReward: `$${(spreadWidth * 100).toFixed(0)} per contract minus debit`
      };
    } else {
      return {
        strategy: 'Bull Put Spread',
        strategyType: 'sell_premium',
        reason: `Medium IV (${ivPercentile.toFixed(0)}%) + Weak Bullish → Collect some premium while bullish`,
        strikes: { short: strike, long: strike - spreadWidth },
        riskProfile: 'defined',
        maxRisk: `$${(spreadWidth * 100).toFixed(0)} per contract (spread width)`,
        maxReward: `Premium collected`
      };
    }
  } else if (direction === 'bearish') {
    if (confidence > 60) {
      return {
        strategy: 'Put Debit Spread',
        strategyType: 'buy_premium',
        reason: `Medium IV (${ivPercentile.toFixed(0)}%) + Bearish → Balanced risk/reward with spread`,
        strikes: { long: strike, short: strike - spreadWidth },
        riskProfile: 'defined',
        maxRisk: `Net debit paid`,
        maxReward: `$${(spreadWidth * 100).toFixed(0)} per contract minus debit`
      };
    } else {
      return {
        strategy: 'Bear Call Spread',
        strategyType: 'sell_premium',
        reason: `Medium IV (${ivPercentile.toFixed(0)}%) + Weak Bearish → Collect some premium while bearish`,
        strikes: { short: strike, long: strike + spreadWidth },
        riskProfile: 'defined',
        maxRisk: `$${(spreadWidth * 100).toFixed(0)} per contract (spread width)`,
        maxReward: `Premium collected`
      };
    }
  }
  
  // Default neutral
  return {
    strategy: 'Iron Condor',
    strategyType: 'neutral',
    reason: `Neutral bias with medium IV → Sell both sides for premium`,
    strikes: { short: strike },
    riskProfile: 'defined',
    maxRisk: `Spread width minus premium collected`,
    maxReward: `Total premium collected`
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
  
  // Calculate target level with sanity check - must be within 20% of current price
  let targetLevel = relevantLevels[0]?.level || (isCallDirection ? currentPrice * 1.02 : currentPrice * 0.98);
  const maxReasonableTarget = currentPrice * 1.20;
  const minReasonableTarget = currentPrice * 0.80;
  if (targetLevel > maxReasonableTarget || targetLevel < minReasonableTarget) {
    console.warn(`⚠️ Target level $${targetLevel} out of range, defaulting to 2% move`);
    targetLevel = isCallDirection ? currentPrice * 1.02 : currentPrice * 0.98;
  }

  recommendations.push({
    strike: atmStrike,
    type: isCallDirection ? 'call' : 'put',
    reason: 'ATM strike - highest gamma, balanced delta',
    distanceFromPrice: ((atmStrike - currentPrice) / currentPrice) * 100,
    moneyness: 'ATM',
    estimatedDelta: atmGreeks.delta,
    confidenceScore: prediction.confidence,
    targetLevel,
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
  
  // Use clusteredCount (TFs closing together) for urgency, not just active count
  const decompCount = confluenceResult.decompression.clusteredCount ?? confluenceResult.decompression.activeCount;
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
  
  // Use clusteredCount (TFs closing together) for real confluence score
  // Fall back to activeCount for backwards compatibility
  const decompCount = confluenceResult.decompression.clusteredCount ?? confluenceResult.decompression.activeCount;
  const clusterRatio = confluenceResult.decompression.clusteringRatio ?? 100;
  
  // Confluence stack (0-25 points) - based on CLUSTERED count now
  if (decompCount >= 5) {
    score += 25;
    reasons.push(`✅ Mega confluence: ${decompCount} TFs closing together`);
  } else if (decompCount >= 3) {
    score += 18;
    reasons.push(`✅ Strong confluence: ${decompCount} TFs closing together`);
  } else if (decompCount >= 2) {
    score += 10;
    reasons.push(`⚡ Moderate confluence: ${decompCount} TFs aligned`);
  } else if (decompCount === 1) {
    score += 3;
    reasons.push(`⚠️ Low confluence: 1 TF active (no clustering)`);
  } else {
    reasons.push(`❌ No active confluence - wait for TF alignment`);
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
  confluenceResult: HierarchicalScanResult,
  candleCloseConfluence?: CandleCloseConfluence | null
): EntryTimingAdvice {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const currentHourDecimal = hour + minute / 60;
  
  // Convert to EST (Eastern Standard Time)
  // Note: This is a simplified conversion - in production you'd use a timezone library
  const estOffset = -5; // EST is UTC-5 (or -4 during DST)
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const estHour = (utcHour + 24 + estOffset) % 24;
  const estTimeDecimal = estHour + utcMin / 60;
  
  // Use clusteredCount (TFs closing together) for real confluence
  const decompCount = confluenceResult.decompression.clusteredCount ?? confluenceResult.decompression.activeCount;
  const activeDecomps = confluenceResult.decompression.decompressions.filter(d => d.isDecompressing);
  
  // Get cluster info for display
  const clusterTimeframes = confluenceResult.decompression.temporalCluster?.timeframes || [];
  const clusterMinsToClose = confluenceResult.decompression.temporalCluster?.clusterCenter || 0;
  
  // Find nearest decompression close from clustered TFs
  const nearestClose = clusterMinsToClose > 0 ? clusterMinsToClose : activeDecomps
    .map(d => d.minsToClose)
    .filter(m => m > 0)
    .sort((a, b) => a - b)[0];
  
  const avoidWindows: string[] = [];
  
  // ═══════════════════════════════════════════════════════════════════════
  // EXTENDED HOURS DETECTION (EST)
  // Pre-market:  4:00 AM - 9:30 AM EST
  // Regular:     9:30 AM - 4:00 PM EST
  // After-hours: 4:00 PM - 8:00 PM EST
  // Closed:      8:00 PM - 4:00 AM EST
  // ═══════════════════════════════════════════════════════════════════════
  
  type MarketSession = 'premarket' | 'regular' | 'afterhours' | 'closed';
  let marketSession: MarketSession = 'closed';
  let sessionWarning: string | null = null;
  
  if (estTimeDecimal >= 4 && estTimeDecimal < 9.5) {
    marketSession = 'premarket';
    sessionWarning = '🌅 PRE-MARKET SESSION (4am-9:30am EST) - Lower liquidity, wider spreads. Options typically don\'t trade until regular hours.';
  } else if (estTimeDecimal >= 9.5 && estTimeDecimal < 16) {
    marketSession = 'regular';
    // No warning for regular hours
  } else if (estTimeDecimal >= 16 && estTimeDecimal < 20) {
    marketSession = 'afterhours';
    sessionWarning = '🌙 AFTER-HOURS SESSION (4pm-8pm EST) - Lower liquidity, wider bid/ask spreads. Avoid large orders. Options may not execute.';
  } else {
    marketSession = 'closed';
    sessionWarning = '🔒 MARKET CLOSED - Current prices may gap at next open. Extended hours trading has very low liquidity.';
  }
  
  if (sessionWarning) {
    avoidWindows.push(sessionWarning);
  }
  
  // First 30 mins (9:30-10:00am EST) - high volatility
  if (estTimeDecimal >= 9.5 && estTimeDecimal < 10) {
    avoidWindows.push('🚀 Opening volatility (9:30-10am EST) - Wait for direction to establish');
  }
  
  // Last 30 mins (3:30-4:00pm EST) - position squaring
  if (estTimeDecimal >= 15.5 && estTimeDecimal < 16) {
    avoidWindows.push('⏰ Power hour (3:30-4pm EST) - Increased volatility from position squaring');
  }
  
  // Lunch lull (12pm-2pm EST)
  if (estTimeDecimal >= 12 && estTimeDecimal < 14) {
    avoidWindows.push('😴 Lunch lull (12-2pm EST) - Lower volume, choppy price action');
  }
  
  // Get candle close confluence score (0-100)
  const candleScore = candleCloseConfluence?.confluenceScore || 0;
  const hasStrongCandleConfluence = candleScore >= 25;
  const hasWeakCandleConfluence = candleScore < 15;
  
  // Determine urgency - now factors in candle close confluence AND market session
  let urgency: 'immediate' | 'within_hour' | 'wait' | 'no_trade' = 'wait';
  let reason = '';
  let idealWindow = '';
  
  // ═══════════════════════════════════════════════════════════════════════
  // EXTENDED HOURS OVERRIDE - downgrade urgency outside regular hours
  // ═══════════════════════════════════════════════════════════════════════
  const isExtendedHours = marketSession !== 'regular';
  const isMarketClosed = marketSession === 'closed';
  
  if (isMarketClosed) {
    // Market fully closed - no trading
    urgency = 'wait';
    reason = 'Market closed - prepare order for next session';
    idealWindow = 'Next regular market open (9:30am EST)';
  } else if (confluenceResult.signalStrength === 'no_signal' || 
      confluenceResult.decompression.netPullDirection === 'neutral') {
    urgency = 'no_trade';
    reason = 'No clear directional signal - wait for confluence';
    idealWindow = 'Wait for TFs to align';
  } else if (hasWeakCandleConfluence && decompCount < 3) {
    // LOW CANDLE CONFLUENCE - suppress urgency even if other signals good
    urgency = 'wait';
    reason = `Low candle confluence (${candleScore}%) - wait for multiple TF closes to align`;
    // Format the best entry window from the object
    const bestWindow = candleCloseConfluence?.bestEntryWindow;
    idealWindow = bestWindow ? `In ${bestWindow.startMins}-${bestWindow.endMins} mins` : 'Wait for TF alignment';
    avoidWindows.push(`⚠️ Candle Close Score only ${candleScore}% - higher probability when TFs close together`);
  } else if (decompCount >= 3 && Math.abs(confluenceResult.decompression.pullBias) >= 60 && hasStrongCandleConfluence) {
    // Prime conditions - but check extended hours
    if (isExtendedHours) {
      urgency = 'wait';
      reason = `Strong confluence but in ${marketSession === 'premarket' ? 'pre-market' : 'after-hours'} - wait for regular hours for options liquidity`;
      idealWindow = marketSession === 'premarket' ? 'At market open (9:30am EST)' : 'Tomorrow at open';
    } else {
      urgency = 'immediate';
      reason = `${decompCount} TFs closing together + ${candleScore}% candle confluence - prime entry window`;
      idealWindow = nearestClose ? `Before ${nearestClose}m TF close` : 'Now';
    }
  } else if (decompCount >= 3 && Math.abs(confluenceResult.decompression.pullBias) >= 60) {
    // Good decompression but weak candle confluence - downgrade to within_hour
    if (isExtendedHours) {
      urgency = 'wait';
      reason = `Good confluence but in ${marketSession === 'premarket' ? 'pre-market' : 'after-hours'} - options lack liquidity`;
      idealWindow = marketSession === 'premarket' ? 'At market open (9:30am EST)' : 'Tomorrow at open';
    } else {
      urgency = 'within_hour';
      reason = `${decompCount} TFs closing together but candle confluence only ${candleScore}% - wait for better alignment`;
      const bestWindow = candleCloseConfluence?.bestEntryWindow;
      idealWindow = bestWindow ? `In ${bestWindow.startMins}-${bestWindow.endMins} mins` : 'Within 30 minutes';
    }
  } else if (decompCount >= 2) {
    if (isExtendedHours) {
      urgency = 'wait';
      reason = `Confluence building but ${marketSession === 'premarket' ? 'pre-market' : 'after-hours'} session - prepare for regular hours`;
      idealWindow = marketSession === 'premarket' ? 'At or after 9:30am EST' : 'Tomorrow';
    } else {
      urgency = 'within_hour';
      reason = 'Good confluence building - enter on slight pullback';
      idealWindow = nearestClose ? `Within ${Math.min(nearestClose, 30)} minutes` : 'Within 30 minutes';
    }
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
    marketSession, // Include session info in response
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
   * @param expirationDate Optional specific expiration date (YYYY-MM-DD) to use instead of auto-selecting
   */
  async analyzeForOptions(
    symbol: string,
    scanMode: ScanMode,
    expirationDate?: string
  ): Promise<OptionsSetup> {
    // Get confluence analysis
    const confluenceResult = await this.confluenceAgent.scanHierarchical(symbol, scanMode);
    
    const { currentPrice, decompression, prediction, signalStrength, clusters, mid50Levels, candleCloseConfluence } = confluenceResult;
    
    // Fetch options chain for O/I analysis (stocks only, not crypto)
    let openInterestAnalysis: OpenInterestData | null = null;
    let ivAnalysis: IVAnalysis | null = null;
    let unusualActivity: UnusualActivity | null = null;
    let expectedMove: ExpectedMove | null = null;
    const isCrypto = symbol.includes('USD') && !symbol.includes('/');
    
    if (!isCrypto) {
      try {
        const optionsChain = await fetchOptionsChain(symbol, expirationDate);
        if (optionsChain) {
          openInterestAnalysis = analyzeOpenInterest(optionsChain.calls, optionsChain.puts, currentPrice, optionsChain.selectedExpiry);
          console.log(`📊 O/I Analysis (${optionsChain.selectedExpiry}): P/C=${openInterestAnalysis.pcRatio.toFixed(2)}, Sentiment=${openInterestAnalysis.sentiment}, Max Pain=$${openInterestAnalysis.maxPainStrike || 'N/A'}`);
          
          // PRO TRADER: IV Analysis
          ivAnalysis = analyzeIV(optionsChain.calls, optionsChain.puts, currentPrice);
          
          // PRO TRADER: Unusual Activity Detection
          unusualActivity = detectUnusualActivity(optionsChain.calls, optionsChain.puts, currentPrice);
          
          // PRO TRADER: Expected Move Calculation
          const avgIV = ivAnalysis.currentIV;
          const selectedDTE = expirationDate 
            ? Math.max(1, Math.ceil((new Date(expirationDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : 7;
          expectedMove = calculateExpectedMove(currentPrice, avgIV, selectedDTE);
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
    
    // Entry timing - now factors in candle close confluence score
    const entryTiming = calculateEntryTiming(confluenceResult, candleCloseConfluence);
    
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
    
    // PRO TRADER: Calculate specific entry/exit levels
    const tradeLevels = calculateTradeLevels(
      confluenceResult,
      direction,
      openInterestAnalysis?.maxPainStrike || null
    );
    
    // PRO TRADER: Calculate composite score from all signals
    const compositeScore = calculateCompositeScore(
      confluenceResult,
      openInterestAnalysis ? {
        avgPCRatio: openInterestAnalysis.pcRatio,
        sentiment: openInterestAnalysis.sentiment
      } : null,
      unusualActivity || { hasUnusualActivity: false, callPremiumTotal: 0, putPremiumTotal: 0 },
      ivAnalysis ? { rank: ivAnalysis.ivRank } : null,
      tradeLevels,
      openInterestAnalysis ? { 
        maxPain: openInterestAnalysis.maxPainStrike || 0, 
        currentPrice 
      } : undefined,
      primaryExpiration?.dte || 14  // Pass DTE for dynamic max pain weighting
    );
    
    // PRO TRADER: Get strategy recommendation based on IV environment and composite score
    const strategyRecommendation = recommendStrategy(
      compositeScore,
      ivAnalysis ? { rank: ivAnalysis.ivRank } : null,
      currentPrice,
      primaryStrike?.strike
    );
    
    // Use composite direction - if composite says neutral, respect it (don't force a direction)
    // Only fall back to confluence direction if composite has very low confidence
    let finalDirection: 'bullish' | 'bearish' | 'neutral';
    if (compositeScore.confidence >= 50) {
      finalDirection = compositeScore.finalDirection;
    } else if (compositeScore.conflicts.length >= 2) {
      // Too many conflicts - show neutral even if composite picked a direction
      finalDirection = 'neutral';
    } else {
      finalDirection = compositeScore.finalDirection || direction;
    }
    
    // Use clusteredCount (TFs closing together) instead of activeCount (all decompressing)
    // This reflects REAL temporal confluence, not just "how many TFs exist"
    const realConfluenceCount = decompression.clusteredCount ?? decompression.activeCount;
    
    // Only show TFs that are part of the main temporal cluster
    const clusteredTFSet = new Set(decompression.temporalCluster?.timeframes || []);
    const clusteredDecompressingTFs = decompression.decompressions
      .filter(d => d.isDecompressing && clusteredTFSet.has(d.tf))
      .map(d => d.tf);
    
    return {
      symbol,
      currentPrice,
      direction: finalDirection,
      confluenceStack: realConfluenceCount,
      decompressingTFs: clusteredDecompressingTFs.length > 0 
        ? clusteredDecompressingTFs 
        : decompression.decompressions.filter(d => d.isDecompressing).map(d => d.tf),
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
      // PRO TRADER FEATURES
      ivAnalysis,
      unusualActivity,
      expectedMove,
      tradeLevels,
      compositeScore,
      strategyRecommendation,
      candleCloseConfluence,
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
