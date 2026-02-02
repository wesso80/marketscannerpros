/**
 * Time Confluence Engine
 * 
 * Elite-level time-based confluence system that tracks:
 * 1. MACRO: Daily, Weekly, Monthly, Quarterly, Yearly candle closes
 * 2. MICRO: Intraday 1m, 2m, 3m, 5m, 10m, 15m, 30m, 60m closes
 * 3. FIBONACCI: 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144 minute intervals
 * 4. EXTENDED HOURS: Pre-market and after-hours alignments
 * 5. INSTITUTIONAL: TWAP-style execution windows
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const NYSE_OPEN_HOUR = 9;
const NYSE_OPEN_MIN = 30;
const NYSE_CLOSE_HOUR = 16;
const NYSE_CLOSE_MIN = 0;

// Fibonacci sequence for time intervals
const FIBONACCI_MINUTES = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
const FIBONACCI_HOURS = [1, 2, 3, 5, 8, 13, 21];

// Standard intraday intervals
const STANDARD_MINUTES = [1, 2, 3, 5, 10, 15, 30, 60];

// Macro timeframe definitions (in trading days)
const MACRO_TIMEFRAMES = {
  // Daily cycles (1-7 days)
  daily: 1,
  '2day': 2,
  '3day': 3,
  '4day': 4,
  '5day': 5,
  '6day': 6,
  '7day': 7,
  // Weekly cycles (1-4 weeks)
  weekly: 5,
  '2week': 10,
  '3week': 15,
  '4week': 20,
  // Monthly cycles (1-12 months in trading days)
  monthly: 21,       // ~21 trading days
  '2month': 42,      // ~42 trading days
  '3month': 63,      // Quarterly
  '4month': 84,
  '5month': 105,
  '6month': 126,     // Semi-annual
  '7month': 147,
  '8month': 168,
  '9month': 189,
  '10month': 210,
  '11month': 231,
  yearly: 252,       // ~252 trading days
};

// ═══════════════════════════════════════════════════════════════════════════
// DECOMPRESSION WINDOWS
// When candles START decompressing toward their 50% level before close
// Once triggered, decompression is active until the candle closes
// ═══════════════════════════════════════════════════════════════════════════

// Minutes before close when decompression STARTS (once triggered, active until close)
const DECOMPRESSION_START: Record<string, number> = {
  // Micro timeframes - same formula pattern
  '5m': 1,           // ~1 min before close
  '10m': 1.5,        // ~1.5 mins before close
  '15m': 2,          // ~2 mins before close
  '30m': 4,          // ~4-5 mins before close
  
  // Intraday - minutes before close when decompression begins
  '1H': 9,           // Starts decompressing 7-9 mins before close
  '2H': 12,          // Starts ~12 mins before close
  '3H': 15,          // Starts ~15 mins before close
  '4H': 12,          // Starts 9-12 mins before close
  '6H': 20,          // Starts 15-20 mins before close
  '8H': 20,          // Starts 15-20 mins before close
  
  // Daily cycles (1-7 days) - each day adds ~1 hour
  '1D': 60,          // 1 hour before close
  '2D': 120,         // 2 hours before close
  '3D': 180,         // 3 hours before close
  '4D': 240,         // 4 hours before close
  '5D': 300,         // 5 hours before close
  '6D': 360,         // 6 hours before close
  '7D': 390,         // 6.5 hours before close
  
  // Weekly cycles (1-4 weeks)
  '1W': 390,         // 6.5 hours before close
  '2W': 780,         // 13 hours before close
  '3W': 1170,        // 19.5 hours before close
  '4W': 1560,        // 26 hours before close
  
  // Monthly cycles (1-12 months) - in minutes
  '1M': 1560,        // 26 hours before close
  '2M': 3120,        // 52 hours before close
  '3M': 4680,        // 78 hours before close (quarterly)
  '4M': 6240,        // 104 hours
  '5M': 7800,        // 130 hours
  '6M': 9360,        // 156 hours (semi-annual)
  '7M': 10920,       // 182 hours
  '8M': 12480,       // 208 hours
  '9M': 14040,       // 234 hours
  '10M': 15600,      // 260 hours
  '11M': 17160,      // 286 hours
  '1Y': 18720,       // 312 hours (yearly)
  
  // Legacy/extended (for compatibility)
  '2Y': 37440,       // 26 trading days
  '4Y': 74880,       // 52 trading days
  '8Y': 149760,      // 104 trading days
};

export interface DecompressionStatus {
  timeframe: string;
  isDecompressing: boolean;
  minutesToClose: number;
  startedDecompressingAt: number; // minutes before close when it started
  phase: 'not_started' | 'active' | 'imminent'; // imminent = last 25% of window
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TimeConfluence {
  time: Date;
  timeET: string;
  closingCandles: string[];
  confluenceScore: number;
  impactLevel: 'low' | 'medium' | 'high' | 'extreme';
  isFibonacci: boolean;
  isStandard: boolean;
  isMacro: boolean;
  description: string;
}

export interface MacroConfluence {
  date: Date;
  closingCandles: string[];
  confluenceScore: number;
  impactLevel: 'high' | 'very_high' | 'maximum';
  isQuarterly: boolean;
  isYearly: boolean;
  description: string;
}

export interface TimeConfluenceState {
  currentTime: Date;
  marketOpen: boolean;
  sessionType: 'pre' | 'regular' | 'after' | 'closed';
  
  // What's closing NOW
  nowClosing: string[];
  nowConfluenceScore: number;
  nowImpact: 'low' | 'medium' | 'high' | 'extreme';
  
  // DECOMPRESSION - what's actively decompressing toward 50%
  decompressing: DecompressionStatus[];
  decompressionCount: number;
  
  // TEMPORAL COMPRESSION - the REAL confluence metric
  temporalCompression: TemporalCompressionState;
  
  // Next major confluence
  nextMajor: TimeConfluence | null;
  minutesToNextMajor: number;
  
  // Today's upcoming confluences
  todayConfluences: TimeConfluence[];
  
  // Macro calendar
  nextMacroConfluence: MacroConfluence | null;
  daysToNextMacro: number;
  
  // Institutional windows
  twapWindows: { start: string; end: string; description: string }[];
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Convert UTC date to Eastern Time
 */
function toET(date: Date): Date {
  const etString = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return new Date(etString);
}

/**
 * Get minutes since NYSE open (9:30 AM ET)
 */
function getMinutesSinceOpen(date: Date): number {
  const et = toET(date);
  const hours = et.getHours();
  const mins = et.getMinutes();
  return (hours - NYSE_OPEN_HOUR) * 60 + (mins - NYSE_OPEN_MIN);
}

/**
 * Check if market is open
 */
function isMarketOpen(date: Date): boolean {
  const et = toET(date);
  const day = et.getDay();
  if (day === 0 || day === 6) return false; // Weekend
  
  const hours = et.getHours();
  const mins = et.getMinutes();
  const totalMins = hours * 60 + mins;
  const openMins = NYSE_OPEN_HOUR * 60 + NYSE_OPEN_MIN;
  const closeMins = NYSE_CLOSE_HOUR * 60 + NYSE_CLOSE_MIN;
  
  return totalMins >= openMins && totalMins < closeMins;
}

/**
 * Get session type
 */
function getSessionType(date: Date): 'pre' | 'regular' | 'after' | 'closed' {
  const et = toET(date);
  const day = et.getDay();
  if (day === 0 || day === 6) return 'closed';
  
  const hours = et.getHours();
  const mins = et.getMinutes();
  const totalMins = hours * 60 + mins;
  
  const preOpen = 4 * 60; // 4:00 AM
  const open = NYSE_OPEN_HOUR * 60 + NYSE_OPEN_MIN; // 9:30
  const close = NYSE_CLOSE_HOUR * 60; // 16:00
  const afterClose = 20 * 60; // 8:00 PM
  
  if (totalMins >= preOpen && totalMins < open) return 'pre';
  if (totalMins >= open && totalMins < close) return 'regular';
  if (totalMins >= close && totalMins < afterClose) return 'after';
  return 'closed';
}

/**
 * Format time as ET string
 */
function formatET(date: Date): string {
  const et = toET(date);
  return et.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York'
  }) + ' ET';
}

// ═══════════════════════════════════════════════════════════════════════════
// MICRO CONFLUENCE (INTRADAY)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get which standard candles are closing at a given minute mark from open
 */
function getStandardCandlesClosing(minutesSinceOpen: number): string[] {
  if (minutesSinceOpen <= 0) return [];
  
  const closing: string[] = [];
  
  for (const interval of STANDARD_MINUTES) {
    if (minutesSinceOpen % interval === 0) {
      if (interval === 60) {
        closing.push('1H');
      } else {
        closing.push(`${interval}m`);
      }
    }
  }
  
  // Check for larger hour intervals
  if (minutesSinceOpen % 120 === 0) closing.push('2H');
  if (minutesSinceOpen % 180 === 0) closing.push('3H');
  if (minutesSinceOpen % 240 === 0) closing.push('4H');
  if (minutesSinceOpen % 360 === 0) closing.push('6H');
  
  return closing;
}

/**
 * Get which Fibonacci candles are closing at a given minute mark
 */
function getFibonacciCandlesClosing(minutesSinceOpen: number): string[] {
  if (minutesSinceOpen <= 0) return [];
  
  const closing: string[] = [];
  
  for (const interval of FIBONACCI_MINUTES) {
    if (minutesSinceOpen % interval === 0) {
      closing.push(`Fib${interval}m`);
    }
  }
  
  // Fibonacci hours (converted to minutes)
  for (const hours of FIBONACCI_HOURS) {
    const mins = hours * 60;
    if (minutesSinceOpen % mins === 0) {
      closing.push(`Fib${hours}H`);
    }
  }
  
  return closing;
}

// ═══════════════════════════════════════════════════════════════════════════
// DECOMPRESSION DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * All trackable intraday timeframes for clustering
 */
const ALL_INTRADAY_TFS = ['5m', '10m', '15m', '30m', '1H', '2H', '3H', '4H', '6H', '8H', '1D'];

/**
 * Get timeframe interval in minutes
 */
function getTFIntervalMins(tf: string): number {
  switch (tf) {
    case '5m': return 5;
    case '10m': return 10;
    case '15m': return 15;
    case '30m': return 30;
    case '1H': return 60;
    case '2H': return 120;
    case '3H': return 180;
    case '4H': return 240;
    case '6H': return 360;
    case '8H': return 390; // Full trading day
    case '1D': return 390; // Full trading day
    default: return 9999;
  }
}

/**
 * Calculate minutes until a specific timeframe candle closes
 */
function getMinutesToClose(date: Date, timeframe: string): number {
  const et = toET(date);
  const totalMins = et.getHours() * 60 + et.getMinutes();
  const marketCloseMins = NYSE_CLOSE_HOUR * 60; // 4:00 PM = 960 mins
  const minutesSinceOpen = getMinutesSinceOpen(date);
  
  // Handle pre-market and after-hours
  if (minutesSinceOpen < 0 || minutesSinceOpen > 390) {
    return 99999;
  }
  
  const interval = getTFIntervalMins(timeframe);
  
  // Daily and 8H close at market close
  if (timeframe === '1D' || timeframe === '8H') {
    return Math.max(0, marketCloseMins - totalMins);
  }
  
  // For other timeframes, find next close
  const nextClose = Math.ceil(minutesSinceOpen / interval) * interval;
  
  // Cap at market close (390 mins = 6.5 hours)
  if (nextClose > 390) {
    return 99999; // Won't close today
  }
  
  return Math.max(0, nextClose - minutesSinceOpen);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORAL COMPRESSION MODEL (Pro Version)
// 
// Real confluence = how many candle closes occur within a tight time window
// Not just "how many timeframes exist"
// ═══════════════════════════════════════════════════════════════════════════

export interface TemporalCluster {
  minutesToClose: number;      // Minutes until cluster center
  timeframes: string[];        // TFs closing in this cluster
  size: number;               // Number of TFs in cluster
  intensity: 'low' | 'moderate' | 'strong' | 'very_strong' | 'explosive';
  score: number;              // 0-100 score
  label: string;              // Human-readable label
}

export interface TemporalCompressionState {
  // The dominant cluster (highest count within window)
  mainCluster: TemporalCluster;
  
  // All clusters found
  allClusters: TemporalCluster[];
  
  // For countdown display
  nextClusterTime: number;    // Minutes to next meaningful cluster
  activeNow: boolean;         // Is a cluster closing right now (within 1 min)?
  
  // Summary
  compressionLabel: string;   // "4 TFs closing in 3 min" or "Low alignment"
}

/**
 * Calculate temporal compression - the REAL time confluence
 * Clusters candle closes that occur within a rolling window
 */
export function calcTemporalCompression(date: Date, windowMinutes: number = 5): TemporalCompressionState {
  const minutesSinceOpen = getMinutesSinceOpen(date);
  
  // Get minutes-to-close for all timeframes
  const closeTimings: { tf: string; minsToClose: number }[] = [];
  
  for (const tf of ALL_INTRADAY_TFS) {
    const minsToClose = getMinutesToClose(date, tf);
    if (minsToClose < 9999 && minsToClose >= 0) {
      closeTimings.push({ tf, minsToClose });
    }
  }
  
  // Sort by minutes to close
  closeTimings.sort((a, b) => a.minsToClose - b.minsToClose);
  
  // Find clusters within the window
  const clusters: TemporalCluster[] = [];
  const used = new Set<number>();
  
  for (let i = 0; i < closeTimings.length; i++) {
    if (used.has(i)) continue;
    
    const clusterCenter = closeTimings[i].minsToClose;
    const clusterTFs: string[] = [closeTimings[i].tf];
    used.add(i);
    
    // Find all other TFs closing within ±windowMinutes of this one
    for (let j = i + 1; j < closeTimings.length; j++) {
      if (used.has(j)) continue;
      
      const diff = Math.abs(closeTimings[j].minsToClose - clusterCenter);
      if (diff <= windowMinutes) {
        clusterTFs.push(closeTimings[j].tf);
        used.add(j);
      }
    }
    
    // Score the cluster based on size
    const size = clusterTFs.length;
    let score: number;
    let intensity: TemporalCluster['intensity'];
    let label: string;
    
    if (size >= 6) {
      score = 95;
      intensity = 'explosive';
      label = '🔥 Explosive Compression';
    } else if (size >= 5) {
      score = 80;
      intensity = 'very_strong';
      label = '⚡ Very Strong';
    } else if (size >= 4) {
      score = 65;
      intensity = 'strong';
      label = '💪 Strong';
    } else if (size >= 3) {
      score = 40;
      intensity = 'moderate';
      label = '📊 Moderate';
    } else if (size >= 2) {
      score = 25;
      intensity = 'low';
      label = '📉 Low';
    } else {
      score = 10;
      intensity = 'low';
      label = '⏸️ Quiet';
    }
    
    clusters.push({
      minutesToClose: clusterCenter,
      timeframes: clusterTFs,
      size,
      intensity,
      score,
      label,
    });
  }
  
  // Sort clusters by size (descending) then by time (ascending)
  clusters.sort((a, b) => {
    if (b.size !== a.size) return b.size - a.size;
    return a.minutesToClose - b.minutesToClose;
  });
  
  // Get main cluster (largest, or nearest if tie)
  const mainCluster = clusters[0] || {
    minutesToClose: 999,
    timeframes: [],
    size: 0,
    intensity: 'low' as const,
    score: 0,
    label: '⏸️ No Active Clusters',
  };
  
  // Find next meaningful cluster (size >= 3)
  const meaningfulClusters = clusters.filter(c => c.size >= 3);
  const nextMeaningful = meaningfulClusters.find(c => c.minutesToClose > 0) || mainCluster;
  
  // Check if closing right now
  const activeNow = mainCluster.minutesToClose <= 1 && mainCluster.size >= 2;
  
  // Build summary label
  let compressionLabel: string;
  if (activeNow) {
    compressionLabel = `🔴 ${mainCluster.size} TFs closing NOW`;
  } else if (mainCluster.size >= 3 && mainCluster.minutesToClose <= 10) {
    compressionLabel = `${mainCluster.size} TFs closing in ${mainCluster.minutesToClose}m`;
  } else if (mainCluster.size >= 2) {
    compressionLabel = `${mainCluster.size} TFs align in ${mainCluster.minutesToClose}m`;
  } else {
    compressionLabel = 'Low temporal alignment';
  }
  
  return {
    mainCluster,
    allClusters: clusters,
    nextClusterTime: nextMeaningful.minutesToClose,
    activeNow,
    compressionLabel,
  };
}

/**
 * Get all timeframes currently in decompression phase
 * UPDATED: Now uses temporal clustering to show real confluence
 */
export function getDecompressionStatus(date: Date): DecompressionStatus[] {
  const results: DecompressionStatus[] = [];
  
  // Get temporal compression for context
  const compression = calcTemporalCompression(date, 5);
  
  // Only return TFs that are part of a meaningful cluster (size >= 2)
  const mainClusterTFs = new Set(compression.mainCluster.timeframes);
  
  for (const tf of ALL_INTRADAY_TFS) {
    const startMins = DECOMPRESSION_START[tf];
    if (!startMins) continue;
    
    const minsToClose = getMinutesToClose(date, tf);
    
    // Skip if too far from close or already closed
    if (minsToClose > startMins || minsToClose <= 0) {
      continue;
    }
    
    // Only include if part of the main cluster (actual confluence)
    if (!mainClusterTFs.has(tf) && compression.mainCluster.size >= 2) {
      continue;
    }
    
    // This timeframe is decompressing!
    const phase = minsToClose <= startMins * 0.25 ? 'imminent' : 'active';
    
    results.push({
      timeframe: tf,
      isDecompressing: true,
      minutesToClose: minsToClose,
      startedDecompressingAt: startMins,
      phase,
    });
  }
  
  return results;
}

/**
 * Get human-readable decompression summary
 */
export function getDecompressionSummary(statuses: DecompressionStatus[]): string {
  if (statuses.length === 0) return 'No active decompression';
  
  const imminent = statuses.filter(s => s.phase === 'imminent');
  const active = statuses.filter(s => s.phase === 'active');
  
  const parts: string[] = [];
  
  if (imminent.length > 0) {
    parts.push(`🔴 IMMINENT: ${imminent.map(s => `${s.timeframe} (${s.minutesToClose}m)`).join(', ')}`);
  }
  if (active.length > 0) {
    parts.push(`🟡 ACTIVE: ${active.map(s => `${s.timeframe} (${s.minutesToClose}m)`).join(', ')}`);
  }
  
  return parts.join(' | ');
}

/**
 * Get all intraday confluences for a given time
 */
export function getIntradayConfluence(date: Date): TimeConfluence {
  const minutesSinceOpen = getMinutesSinceOpen(date);
  const et = toET(date);
  
  const standardClosing = getStandardCandlesClosing(minutesSinceOpen);
  const fibClosing = getFibonacciCandlesClosing(minutesSinceOpen);
  
  // Remove duplicates (1m, 2m, 3m, 5m appear in both)
  const allClosing = [...new Set([...standardClosing, ...fibClosing])];
  
  // Calculate confluence score
  let score = allClosing.length;
  
  // Bonus for major intervals
  if (allClosing.includes('1H')) score += 2;
  if (allClosing.includes('2H')) score += 3;
  if (allClosing.includes('4H')) score += 4;
  if (allClosing.includes('30m')) score += 1;
  if (allClosing.includes('15m')) score += 1;
  
  // Determine impact level
  let impact: 'low' | 'medium' | 'high' | 'extreme' = 'low';
  if (score >= 12) impact = 'extreme';
  else if (score >= 8) impact = 'high';
  else if (score >= 5) impact = 'medium';
  
  // Build description
  let desc = '';
  if (minutesSinceOpen === 30) desc = 'First 30-min candle close';
  else if (minutesSinceOpen === 60) desc = 'First hour close - key pivot';
  else if (minutesSinceOpen === 180) desc = '3-hour close';
  else if (minutesSinceOpen === 360) desc = '6-hour close - major confluence';
  else if (minutesSinceOpen === 390) desc = 'Market close - daily candle';
  else if (allClosing.length >= 5) desc = `${allClosing.length}-way confluence`;
  else desc = `${allClosing.length} candles closing`;
  
  return {
    time: date,
    timeET: formatET(date),
    closingCandles: allClosing,
    confluenceScore: score,
    impactLevel: impact,
    isFibonacci: fibClosing.length > standardClosing.length,
    isStandard: standardClosing.length > 0,
    isMacro: false,
    description: desc,
  };
}

/**
 * Get all major intraday confluences for today
 */
export function getTodayConfluences(date: Date): TimeConfluence[] {
  const et = toET(date);
  const confluences: TimeConfluence[] = [];
  
  // Start from 9:30 AM
  const start = new Date(et);
  start.setHours(NYSE_OPEN_HOUR, NYSE_OPEN_MIN, 0, 0);
  
  // Go through every 5-minute mark until 4:00 PM
  for (let mins = 5; mins <= 390; mins += 5) {
    const checkTime = new Date(start.getTime() + mins * 60000);
    const confluence = getIntradayConfluence(checkTime);
    
    // Only include medium+ impact
    if (confluence.impactLevel !== 'low') {
      confluences.push(confluence);
    }
  }
  
  return confluences;
}

/**
 * Get next major intraday confluence
 */
export function getNextMajorConfluence(date: Date): { confluence: TimeConfluence | null; minutesAway: number } {
  const et = toET(date);
  const currentMins = et.getHours() * 60 + et.getMinutes();
  const openMins = NYSE_OPEN_HOUR * 60 + NYSE_OPEN_MIN;
  const closeMins = NYSE_CLOSE_HOUR * 60;
  
  // Key confluence times (minutes since midnight)
  const keyTimes = [
    openMins + 30,   // 10:00 AM
    openMins + 60,   // 10:30 AM
    openMins + 90,   // 11:00 AM
    openMins + 120,  // 11:30 AM
    openMins + 150,  // 12:00 PM
    openMins + 180,  // 12:30 PM
    openMins + 210,  // 1:00 PM
    openMins + 240,  // 1:30 PM
    openMins + 270,  // 2:00 PM
    openMins + 300,  // 2:30 PM
    openMins + 330,  // 3:00 PM
    openMins + 360,  // 3:30 PM - QUADRUPLE
    openMins + 390,  // 4:00 PM - CLOSE
  ];
  
  for (const targetMins of keyTimes) {
    if (targetMins > currentMins && targetMins <= closeMins) {
      const checkTime = new Date(et);
      checkTime.setHours(Math.floor(targetMins / 60), targetMins % 60, 0, 0);
      const confluence = getIntradayConfluence(checkTime);
      
      if (confluence.confluenceScore >= 5) {
        return {
          confluence,
          minutesAway: targetMins - currentMins,
        };
      }
    }
  }
  
  return { confluence: null, minutesAway: 0 };
}

// ═══════════════════════════════════════════════════════════════════════════
// MACRO CONFLUENCE (SWING/POSITION)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if date is last trading day of month
 */
function isLastTradingDayOfMonth(date: Date): boolean {
  const et = toET(date);
  const nextDay = new Date(et);
  nextDay.setDate(nextDay.getDate() + 1);
  
  // Skip weekends
  while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
    nextDay.setDate(nextDay.getDate() + 1);
  }
  
  return nextDay.getMonth() !== et.getMonth();
}

/**
 * Check if date is last trading day of quarter
 */
function isLastTradingDayOfQuarter(date: Date): boolean {
  if (!isLastTradingDayOfMonth(date)) return false;
  const et = toET(date);
  const month = et.getMonth();
  return month === 2 || month === 5 || month === 8 || month === 11; // Mar, Jun, Sep, Dec
}

/**
 * Check if date is last trading day of year
 */
function isLastTradingDayOfYear(date: Date): boolean {
  if (!isLastTradingDayOfMonth(date)) return false;
  const et = toET(date);
  return et.getMonth() === 11; // December
}

/**
 * Check if date is a Friday
 */
function isFriday(date: Date): boolean {
  return toET(date).getDay() === 5;
}

/**
 * Get week number of year (for n-week candle calculations)
 */
function getWeekOfYear(date: Date): number {
  const et = toET(date);
  const startOfYear = new Date(et.getFullYear(), 0, 1);
  const days = Math.floor((et.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}

/**
 * Get macro candles closing on a given date
 * Now tracks ALL 35 timeframes for complete confluence detection
 */
export function getMacroClosingCandles(date: Date): string[] {
  const closing: string[] = [];
  const dayOfYear = getDayOfYear(date);
  const weekNum = getWeekOfYear(date);
  const month = date.getMonth(); // 0-indexed
  const dayOfMonth = date.getDate();
  const daysInMonth = new Date(date.getFullYear(), month + 1, 0).getDate();
  const isLastDayOfMonth = dayOfMonth === daysInMonth || 
    (dayOfMonth >= daysInMonth - 2 && (date.getDay() === 5 || isLastTradingDayOfMonth(date)));
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY CYCLES (1D - 7D)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 1D: Always closes every trading day
  closing.push('1D');
  
  // 2D: Closes every 2nd day
  if (dayOfYear % 2 === 0) closing.push('2D');
  
  // 3D: Closes every 3rd day
  if (dayOfYear % 3 === 0) closing.push('3D');
  
  // 4D: Closes every 4th day
  if (dayOfYear % 4 === 0) closing.push('4D');
  
  // 5D: Closes every 5th day
  if (dayOfYear % 5 === 0) closing.push('5D');
  
  // 6D: Closes every 6th day
  if (dayOfYear % 6 === 0) closing.push('6D');
  
  // 7D: Closes every 7th day (calendar week)
  if (dayOfYear % 7 === 0) closing.push('7D');
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WEEKLY CYCLES (1W - 4W) - All close on Friday
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (isFriday(date)) {
    // 1W: Every Friday
    closing.push('1W');
    
    // 2W: Every 2nd Friday
    if (weekNum % 2 === 0) closing.push('2W');
    
    // 3W: Every 3rd Friday
    if (weekNum % 3 === 0) closing.push('3W');
    
    // 4W: Every 4th Friday
    if (weekNum % 4 === 0) closing.push('4W');
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // MONTHLY CYCLES (1M - 12M)
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (isLastTradingDayOfMonth(date)) {
    // 1M: Every month end
    closing.push('1M');
    
    // 2M: Feb, Apr, Jun, Aug, Oct, Dec (bi-monthly)
    if ([1, 3, 5, 7, 9, 11].includes(month)) closing.push('2M');
    
    // 3M: Mar, Jun, Sep, Dec (quarterly)
    if ([2, 5, 8, 11].includes(month)) closing.push('3M');
    
    // 4M: Apr, Aug, Dec
    if ([3, 7, 11].includes(month)) closing.push('4M');
    
    // 5M: May, Oct
    if ([4, 9].includes(month)) closing.push('5M');
    
    // 6M: Jun, Dec (semi-annual)
    if ([5, 11].includes(month)) closing.push('6M');
    
    // 7M: Jul
    if (month === 6) closing.push('7M');
    
    // 8M: Aug
    if (month === 7) closing.push('8M');
    
    // 9M: Sep
    if (month === 8) closing.push('9M');
    
    // 10M: Oct
    if (month === 9) closing.push('10M');
    
    // 11M: Nov
    if (month === 10) closing.push('11M');
    
    // 1Y: Dec (yearly)
    if (month === 11) closing.push('1Y');
  }
  
  return closing;
}

/**
 * Helper: Get day of year (1-365/366)
 */
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

/**
 * Get macro confluence for a date
 */
export function getMacroConfluence(date: Date): MacroConfluence {
  const closing = getMacroClosingCandles(date);
  const isQuarterly = closing.includes('3M');
  const isYearly = closing.includes('1Y');
  const isSemiAnnual = closing.includes('6M');
  const isMonthly = closing.includes('1M');
  const isWeekly = closing.includes('1W');
  
  // Score based on how many TFs are closing
  let score = closing.length;
  
  // Bonus for significant periods
  if (isYearly) score += 10;
  else if (isSemiAnnual) score += 6;
  else if (isQuarterly) score += 4;
  else if (isMonthly) score += 2;
  
  let impact: 'high' | 'very_high' | 'maximum' = 'high';
  if (isYearly) impact = 'maximum';
  else if (isSemiAnnual || isQuarterly) impact = 'very_high';
  else if (closing.length >= 6) impact = 'very_high';
  
  let desc = '';
  if (isYearly) desc = `YEAR END - ${closing.length} timeframes closing together`;
  else if (isSemiAnnual) desc = `SEMI-ANNUAL - ${closing.length} timeframes align`;
  else if (isQuarterly) desc = `QUARTER END - ${closing.length} timeframes converge`;
  else if (isMonthly) desc = `Month end - ${closing.length} TFs closing`;
  else if (isWeekly) desc = `Weekly close - ${closing.length} TFs align`;
  else desc = `Daily - ${closing.length} timeframes closing`;
  
  return {
    date,
    closingCandles: closing,
    confluenceScore: score,
    impactLevel: impact,
    isQuarterly,
    isYearly,
    description: desc,
  };
}

/**
 * Get next major macro confluence
 */
export function getNextMacroConfluence(fromDate: Date): { confluence: MacroConfluence; daysAway: number } {
  const et = toET(fromDate);
  let checkDate = new Date(et);
  let daysAway = 0;
  
  // Look up to 90 days ahead
  for (let i = 1; i <= 90; i++) {
    checkDate.setDate(checkDate.getDate() + 1);
    daysAway++;
    
    // Skip weekends
    if (checkDate.getDay() === 0 || checkDate.getDay() === 6) continue;
    
    const macro = getMacroConfluence(checkDate);
    
    // Return if quarterly or better
    if (macro.isQuarterly || macro.closingCandles.length >= 4) {
      return { confluence: macro, daysAway };
    }
  }
  
  // Fallback
  return { confluence: getMacroConfluence(checkDate), daysAway };
}

// ═══════════════════════════════════════════════════════════════════════════
// TWAP / INSTITUTIONAL WINDOWS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get institutional TWAP execution windows
 */
export function getTWAPWindows(): { start: string; end: string; description: string }[] {
  return [
    { start: '9:30 AM', end: '10:00 AM', description: 'Opening Range - High volatility, TWAP algos active' },
    { start: '10:00 AM', end: '10:30 AM', description: 'Post-Open - Economic data reactions' },
    { start: '11:30 AM', end: '12:00 PM', description: 'Europe Close - Volume shift' },
    { start: '2:00 PM', end: '2:30 PM', description: 'Fed Window - Announcements often here' },
    { start: '3:00 PM', end: '3:30 PM', description: 'MOC Orders Begin - Institutional positioning' },
    { start: '3:30 PM', end: '4:00 PM', description: 'Power Hour - Maximum TWAP activity' },
  ];
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT: GET FULL CONFLUENCE STATE
// ═══════════════════════════════════════════════════════════════════════════

export function getTimeConfluenceState(date: Date = new Date()): TimeConfluenceState {
  const et = toET(date);
  const sessionType = getSessionType(date);
  const marketOpen = sessionType === 'regular';
  
  // Get current intraday confluence
  const now = getIntradayConfluence(date);
  
  // Get decompression status - which TFs are decompressing toward 50%
  const decompressing = marketOpen ? getDecompressionStatus(date) : [];
  
  // Get TEMPORAL COMPRESSION - the real confluence metric
  const temporalCompression = marketOpen 
    ? calcTemporalCompression(date, 5) 
    : {
        mainCluster: { minutesToClose: 999, timeframes: [], size: 0, intensity: 'low' as const, score: 0, label: '⏸️ Market Closed' },
        allClusters: [],
        nextClusterTime: 999,
        activeNow: false,
        compressionLabel: 'Market closed',
      };
  
  // Get next major intraday
  const { confluence: nextMajor, minutesAway: minutesToNextMajor } = getNextMajorConfluence(date);
  
  // Get today's confluences
  const todayConfluences = getTodayConfluences(date);
  
  // Get macro confluence
  const { confluence: nextMacro, daysAway: daysToNextMacro } = getNextMacroConfluence(date);
  
  // TWAP windows
  const twapWindows = getTWAPWindows();
  
  return {
    currentTime: date,
    marketOpen,
    sessionType,
    
    nowClosing: now.closingCandles,
    nowConfluenceScore: now.confluenceScore,
    nowImpact: now.impactLevel,
    
    // Decompression tracking
    decompressing,
    decompressionCount: decompressing.length,
    
    // Temporal compression (the REAL confluence)
    temporalCompression,
    
    nextMajor,
    minutesToNextMajor,
    
    todayConfluences,
    
    nextMacroConfluence: nextMacro,
    daysToNextMacro,
    
    twapWindows,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// HIGH-IMPACT DATES (Precomputed for 2025-2026)
// ═══════════════════════════════════════════════════════════════════════════

export const HIGH_IMPACT_DATES_2025 = [
  { date: '2025-01-31', description: 'Monthly close', candles: ['Daily', 'Weekly', 'Monthly'] },
  { date: '2025-03-28', description: 'Q1 End - Major', candles: ['Daily', 'Weekly', 'Bi-weekly', '3-Week', 'Monthly', 'Quarterly'] },
  { date: '2025-06-27', description: 'Q2 End - Major', candles: ['Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'] },
  { date: '2025-09-26', description: 'Q3 End - Major', candles: ['Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'] },
  { date: '2025-12-26', description: 'YEAR END - Maximum', candles: ['Daily', 'Weekly', 'Bi-weekly', '3-Week', 'Monthly', 'Quarterly', 'Yearly'] },
];

export const HIGH_IMPACT_DATES_2026 = [
  { date: '2026-01-30', description: 'Monthly close', candles: ['Daily', 'Weekly', 'Monthly'] },
  { date: '2026-03-27', description: 'Q1 End - Major', candles: ['Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'] },
  { date: '2026-06-26', description: 'Q2 End - Major', candles: ['Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'] },
  { date: '2026-09-25', description: 'Q3 End - Major', candles: ['Daily', 'Weekly', 'Bi-weekly', 'Monthly', 'Quarterly'] },
  { date: '2026-12-31', description: 'YEAR END - Maximum', candles: ['Daily', 'Weekly', 'Bi-weekly', '3-Week', 'Monthly', 'Quarterly', 'Yearly'] },
];
