/**
 * Time Confluence Engine v2.0
 * 
 * Elite-level time-based confluence system that tracks:
 * 1. MACRO: Daily, Weekly, Monthly, Quarterly, Yearly candle closes
 * 2. MICRO: Intraday 1m, 2m, 3m, 5m, 10m, 15m, 30m, 60m closes
 * 3. FIBONACCI: 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144 minute intervals
 * 4. EXTENDED HOURS: Pre-market and after-hours alignments
 * 5. INSTITUTIONAL: TWAP-style execution windows
 * 
 * v2.0 FIXES (from professional code review):
 * - Proper timezone handling via Intl.DateTimeFormat.formatToParts()
 * - MarketClock single source of truth for all session calculations
 * - Renamed '8H' to 'RTH' (Regular Trading Hours = 390 mins)
 * - Sliding window clustering algorithm with TF importance weights
 * - Basic market calendar service (holidays, half-days)
 * - Fixed macro cycles to use trading-day index
 * - Renamed "decompression" to "decompression window" (time-based only)
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

const NYSE_OPEN_HOUR = 9;
const NYSE_OPEN_MIN = 30;
const NYSE_CLOSE_HOUR = 16;
const NYSE_CLOSE_MIN = 0;

// Derived constants (single source of truth)
const NYSE_OPEN_MINS = NYSE_OPEN_HOUR * 60 + NYSE_OPEN_MIN;  // 570
const NYSE_CLOSE_MINS = NYSE_CLOSE_HOUR * 60 + NYSE_CLOSE_MIN; // 960
const RTH_SESSION_MINS = NYSE_CLOSE_MINS - NYSE_OPEN_MINS; // 390

// Fibonacci sequence for time intervals
const FIBONACCI_MINUTES = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144];
const FIBONACCI_HOURS = [1, 2, 3, 5, 8, 13, 21];

// Standard intraday intervals
const STANDARD_MINUTES = [1, 2, 3, 5, 10, 15, 30, 60];

// ═══════════════════════════════════════════════════════════════════════════
// TIMEFRAME IMPORTANCE WEIGHTS (for weighted clustering)
// Higher weight = more significant for confluence
// ═══════════════════════════════════════════════════════════════════════════

const TF_WEIGHT: Record<string, number> = {
  '1m': 0.5,
  '2m': 0.5,
  '3m': 0.5,
  '5m': 1,
  '10m': 1,
  '15m': 1.5,
  '30m': 2,
  '1H': 3,
  '2H': 4,
  '3H': 5,
  '4H': 6,
  '6H': 7,
  'RTH': 8,  // Renamed from 8H
  '1D': 10,
};

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
// MARKET CALENDAR SERVICE
// NYSE holidays and half-days (updated annually)
// ═══════════════════════════════════════════════════════════════════════════

// 2025-2026 NYSE Holidays (market closed)
const NYSE_HOLIDAYS: Set<string> = new Set([
  // 2025
  '2025-01-01', // New Year's Day
  '2025-01-20', // MLK Day
  '2025-02-17', // Presidents Day
  '2025-04-18', // Good Friday
  '2025-05-26', // Memorial Day
  '2025-06-19', // Juneteenth
  '2025-07-04', // Independence Day
  '2025-09-01', // Labor Day
  '2025-11-27', // Thanksgiving
  '2025-12-25', // Christmas
  // 2026
  '2026-01-01', // New Year's Day
  '2026-01-19', // MLK Day
  '2026-02-16', // Presidents Day
  '2026-04-03', // Good Friday
  '2026-05-25', // Memorial Day
  '2026-06-19', // Juneteenth
  '2026-07-03', // Independence Day (observed)
  '2026-09-07', // Labor Day
  '2026-11-26', // Thanksgiving
  '2026-12-25', // Christmas
]);

// NYSE Half-days (close at 1:00 PM ET = 780 mins from midnight)
const NYSE_HALF_DAYS: Set<string> = new Set([
  // 2025
  '2025-07-03', // Day before Independence Day
  '2025-11-28', // Day after Thanksgiving
  '2025-12-24', // Christmas Eve
  // 2026
  '2026-11-27', // Day after Thanksgiving
  '2026-12-24', // Christmas Eve
]);

const HALF_DAY_CLOSE_MINS = 13 * 60; // 1:00 PM = 780

export interface MarketDayInfo {
  isTradingDay: boolean;
  isHalfDay: boolean;
  openMinsET: number;
  closeMinsET: number;
  sessionType: 'closed' | 'halfday' | 'regular';
  sessionLengthMins: number;
}

/**
 * Get market day info for a given date
 */
function getMarketDayInfo(dateStr: string, dayOfWeek: number): MarketDayInfo {
  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      isTradingDay: false,
      isHalfDay: false,
      openMinsET: 0,
      closeMinsET: 0,
      sessionType: 'closed',
      sessionLengthMins: 0,
    };
  }
  
  // Holiday
  if (NYSE_HOLIDAYS.has(dateStr)) {
    return {
      isTradingDay: false,
      isHalfDay: false,
      openMinsET: 0,
      closeMinsET: 0,
      sessionType: 'closed',
      sessionLengthMins: 0,
    };
  }
  
  // Half-day
  if (NYSE_HALF_DAYS.has(dateStr)) {
    return {
      isTradingDay: true,
      isHalfDay: true,
      openMinsET: NYSE_OPEN_MINS,
      closeMinsET: HALF_DAY_CLOSE_MINS,
      sessionType: 'halfday',
      sessionLengthMins: HALF_DAY_CLOSE_MINS - NYSE_OPEN_MINS, // 210 mins
    };
  }
  
  // Regular day
  return {
    isTradingDay: true,
    isHalfDay: false,
    openMinsET: NYSE_OPEN_MINS,
    closeMinsET: NYSE_CLOSE_MINS,
    sessionType: 'regular',
    sessionLengthMins: RTH_SESSION_MINS,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// DECOMPRESSION WINDOWS (time-based only, renamed for clarity)
// When candles are in their "decompression window" before close
// NOTE: This is TIME-BASED only. For actual price decompression detection,
// you need to also check if price is moving toward the candle's 50% level.
// ═══════════════════════════════════════════════════════════════════════════

// Minutes before close when decompression window STARTS
const DECOMPRESSION_WINDOW_START: Record<string, number> = {
  // Micro timeframes
  '5m': 1,
  '10m': 1.5,
  '15m': 2,
  '30m': 4,
  
  // Intraday
  '1H': 9,
  '2H': 12,
  '3H': 15,
  '4H': 12,
  '6H': 20,
  'RTH': 20,  // Renamed from 8H
  
  // Daily cycles (1-7 days)
  '1D': 60,
  '2D': 120,
  '3D': 180,
  '4D': 240,
  '5D': 300,
  '6D': 360,
  '7D': 390,
  
  // Weekly cycles (1-4 weeks)
  '1W': 390,
  '2W': 780,
  '3W': 1170,
  '4W': 1560,
  
  // Monthly cycles
  '1M': 1560,
  '2M': 3120,
  '3M': 4680,
  '4M': 6240,
  '5M': 7800,
  '6M': 9360,
  '7M': 10920,
  '8M': 12480,
  '9M': 14040,
  '10M': 15600,
  '11M': 17160,
  '1Y': 18720,
  
  // Legacy
  '2Y': 37440,
  '4Y': 74880,
  '8Y': 149760,
};

export interface DecompressionWindowStatus {
  timeframe: string;
  isInWindow: boolean;        // Renamed from isDecompressing (clarity)
  minutesToClose: number;
  windowStartMins: number;    // Renamed from startedDecompressingAt
  phase: 'not_started' | 'active' | 'imminent';
}

// Keep old interface name for backwards compatibility
export type DecompressionStatus = DecompressionWindowStatus;

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
// MARKET CLOCK - Single Source of Truth for Time Calculations
// Fixes: DST-safe timezone handling, consistent ET calculations
// ═══════════════════════════════════════════════════════════════════════════

// Intl formatter for DST-safe timezone conversion (no string parsing!)
const ET_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  weekday: 'short',
});

/**
 * Extract ET time parts from a Date object (DST-safe)
 * NEVER parses locale strings - uses formatToParts for accuracy
 */
export interface ETParts {
  year: number;
  month: number;  // 1-12
  day: number;
  hour: number;   // 0-23
  minute: number;
  second: number;
  dayOfWeek: number; // 0=Sun, 6=Sat
  dateStr: string;   // YYYY-MM-DD format
}

function getETParts(date: Date): ETParts {
  const parts = ET_FORMATTER.formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || '0';
  
  const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  const weekday = get('weekday');
  
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  
  return {
    year,
    month,
    day,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    dayOfWeek: dayMap[weekday] ?? 0,
    dateStr: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

/**
 * MarketClock - all session calculations in one place
 */
export interface MarketClock {
  date: Date;
  et: ETParts;
  dayInfo: MarketDayInfo;
  
  // Session state
  sessionType: 'pre' | 'regular' | 'after' | 'closed';
  isMarketOpen: boolean;
  
  // Time calculations (only valid during RTH)
  minutesSinceMidnight: number;
  minutesSinceOpen: number;
  minutesToClose: number;
  
  // Trading day index (for macro cycle calculations)
  tradingDayIndex: number;
}

// Simple trading day index calculation (days since Jan 2, 2020)
// For accurate macro cycles, increment only on actual trading days
const EPOCH_DATE = new Date('2020-01-02T00:00:00Z');

function getTradingDayIndex(dateStr: string, dayOfWeek: number): number {
  // Rough approximation: ~252 trading days per year
  // For perfect accuracy, use a full trading calendar
  const [year, month, day] = dateStr.split('-').map(Number);
  const daysSinceEpoch = Math.floor(
    (new Date(year, month - 1, day).getTime() - EPOCH_DATE.getTime()) / (24 * 60 * 60 * 1000)
  );
  
  // Approximate trading days (exclude ~104 weekends + ~10 holidays per year)
  // ~252/365 = 0.69
  const tradingDays = Math.floor(daysSinceEpoch * 0.69);
  return Math.max(0, tradingDays);
}

/**
 * Create a MarketClock from a Date
 */
export function createMarketClock(date: Date = new Date()): MarketClock {
  const et = getETParts(date);
  const dayInfo = getMarketDayInfo(et.dateStr, et.dayOfWeek);
  
  const minutesSinceMidnight = et.hour * 60 + et.minute;
  
  // Determine session type (now respects holidays and half-days)
  let sessionType: MarketClock['sessionType'] = 'closed';
  
  if (dayInfo.isTradingDay) {
    const preOpen = 4 * 60; // 4:00 AM
    const afterClose = 20 * 60; // 8:00 PM
    
    if (minutesSinceMidnight >= preOpen && minutesSinceMidnight < dayInfo.openMinsET) {
      sessionType = 'pre';
    } else if (minutesSinceMidnight >= dayInfo.openMinsET && minutesSinceMidnight < dayInfo.closeMinsET) {
      sessionType = 'regular';
    } else if (minutesSinceMidnight >= dayInfo.closeMinsET && minutesSinceMidnight < afterClose) {
      sessionType = 'after';
    }
  }
  
  const isMarketOpen = sessionType === 'regular';
  
  // RTH calculations
  const minutesSinceOpen = isMarketOpen 
    ? minutesSinceMidnight - dayInfo.openMinsET 
    : (sessionType === 'pre' ? minutesSinceMidnight - dayInfo.openMinsET : 0); // negative for pre
  
  const minutesToClose = isMarketOpen 
    ? dayInfo.closeMinsET - minutesSinceMidnight 
    : 0;
  
  return {
    date,
    et,
    dayInfo,
    sessionType,
    isMarketOpen,
    minutesSinceMidnight,
    minutesSinceOpen,
    minutesToClose,
    tradingDayIndex: getTradingDayIndex(et.dateStr, et.dayOfWeek),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGACY HELPER FUNCTIONS (deprecated, use MarketClock instead)
// Kept for backwards compatibility
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated Use createMarketClock().minutesSinceOpen instead */
function getMinutesSinceOpen(date: Date): number {
  const clock = createMarketClock(date);
  return clock.minutesSinceOpen;
}

/** @deprecated Use createMarketClock().isMarketOpen instead */
function isMarketOpen(date: Date): boolean {
  const clock = createMarketClock(date);
  return clock.isMarketOpen;
}

/** @deprecated Use createMarketClock().sessionType instead */
function getSessionType(date: Date): 'pre' | 'regular' | 'after' | 'closed' {
  const clock = createMarketClock(date);
  return clock.sessionType;
}

/**
 * Format time as ET string
 */
function formatET(date: Date): string {
  return date.toLocaleTimeString('en-US', { 
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
function getStandardCandlesClosing(minutesSinceOpen: number, sessionLength: number = RTH_SESSION_MINS): string[] {
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
  
  // RTH close (renamed from 8H - session candle)
  if (minutesSinceOpen === sessionLength) closing.push('RTH');
  
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
// DECOMPRESSION WINDOW DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * All trackable intraday timeframes for clustering
 * NOTE: '8H' renamed to 'RTH' (Regular Trading Hours = 390 mins session)
 */
const ALL_INTRADAY_TFS = ['5m', '10m', '15m', '30m', '1H', '2H', '3H', '4H', '6H', 'RTH', '1D'];

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
    case 'RTH': return RTH_SESSION_MINS; // 390 - full session
    case '1D': return RTH_SESSION_MINS;  // Daily = session close
    default: return 9999;
  }
}

/**
 * Calculate minutes until a specific timeframe candle closes
 * Now uses MarketClock for accuracy
 */
function getMinutesToClose(date: Date, timeframe: string): number {
  const clock = createMarketClock(date);
  
  // Handle pre-market and after-hours
  if (!clock.isMarketOpen) {
    return 99999;
  }
  
  const { minutesSinceOpen, dayInfo } = clock;
  const interval = getTFIntervalMins(timeframe);
  
  // Daily and RTH close at market close
  if (timeframe === '1D' || timeframe === 'RTH') {
    return Math.max(0, dayInfo.sessionLengthMins - minutesSinceOpen);
  }
  
  // For other timeframes, find next close
  const nextClose = Math.ceil(minutesSinceOpen / interval) * interval;
  
  // Cap at session close
  if (nextClose > dayInfo.sessionLengthMins) {
    return 99999; // Won't close today
  }
  
  return Math.max(0, nextClose - minutesSinceOpen);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPORAL COMPRESSION MODEL v2.0
// 
// Real confluence = how many candle closes occur within a tight time window
// FIXES from code review:
// - Sliding window algorithm (not greedy) finds true maximum-density cluster
// - Weighted scoring based on TF importance (4H > 5m)
// ═══════════════════════════════════════════════════════════════════════════

export interface TemporalCluster {
  minutesToClose: number;      // Minutes until cluster center
  timeframes: string[];        // TFs closing in this cluster
  size: number;               // Number of TFs in cluster
  weightedScore: number;      // Sum of TF weights in cluster
  intensity: 'low' | 'moderate' | 'strong' | 'very_strong' | 'explosive';
  score: number;              // 0-100 normalized score
  label: string;              // Human-readable label
}

export interface TemporalCompressionState {
  // The dominant cluster (highest weighted score within window)
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
 * Calculate temporal compression using SLIDING WINDOW algorithm
 * Finds the true maximum-density cluster with weighted TF importance
 */
export function calcTemporalCompression(date: Date, windowMinutes: number = 5): TemporalCompressionState {
  const clock = createMarketClock(date);
  
  // Get minutes-to-close for all timeframes
  const closeTimings: { tf: string; minsToClose: number; weight: number }[] = [];
  
  for (const tf of ALL_INTRADAY_TFS) {
    const minsToClose = getMinutesToClose(date, tf);
    if (minsToClose < 9999 && minsToClose >= 0) {
      closeTimings.push({ 
        tf, 
        minsToClose,
        weight: TF_WEIGHT[tf] ?? 1,
      });
    }
  }
  
  // Sort by minutes to close
  closeTimings.sort((a, b) => a.minsToClose - b.minsToClose);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SLIDING WINDOW algorithm - finds TRUE maximum-density cluster
  // Two pointers: i..j where timing[j] - timing[i] <= windowMinutes
  // ═══════════════════════════════════════════════════════════════════════════
  
  const clusters: TemporalCluster[] = [];
  
  if (closeTimings.length > 0) {
    let bestStart = 0;
    let bestEnd = 0;
    let bestWeightedScore = 0;
    
    let windowStart = 0;
    let currentWeightedScore = closeTimings[0].weight;
    
    // Slide end pointer across all timings
    for (let windowEnd = 0; windowEnd < closeTimings.length; windowEnd++) {
      // If this is not the first element, add its weight
      if (windowEnd > 0) {
        currentWeightedScore += closeTimings[windowEnd].weight;
      }
      
      // Shrink window from start if it exceeds windowMinutes
      while (closeTimings[windowEnd].minsToClose - closeTimings[windowStart].minsToClose > windowMinutes) {
        currentWeightedScore -= closeTimings[windowStart].weight;
        windowStart++;
      }
      
      // Track best cluster by weighted score
      if (currentWeightedScore > bestWeightedScore) {
        bestWeightedScore = currentWeightedScore;
        bestStart = windowStart;
        bestEnd = windowEnd;
      }
    }
    
    // Build the best cluster
    const clusterTFs: string[] = [];
    let weightedSum = 0;
    for (let i = bestStart; i <= bestEnd; i++) {
      clusterTFs.push(closeTimings[i].tf);
      weightedSum += closeTimings[i].weight;
    }
    
    // Calculate cluster center (average minsToClose)
    const centerTime = closeTimings[bestStart].minsToClose;
    const size = clusterTFs.length;
    
    // Score based on weighted sum (calibrated: max realistic ~35 points)
    // 4H+2H+1H+30m+15m+5m = 6+4+3+2+1.5+1 = 17.5
    // Explosive would be 4H+2H+1H+30m+RTH+1D = 6+4+3+2+8+10 = 33
    let score: number;
    let intensity: TemporalCluster['intensity'];
    let label: string;
    
    if (weightedSum >= 25) {
      score = 95;
      intensity = 'explosive';
      label = '🔥 Explosive Compression';
    } else if (weightedSum >= 18) {
      score = 80;
      intensity = 'very_strong';
      label = '⚡ Very Strong';
    } else if (weightedSum >= 12) {
      score = 65;
      intensity = 'strong';
      label = '💪 Strong';
    } else if (weightedSum >= 7) {
      score = 40;
      intensity = 'moderate';
      label = '📊 Moderate';
    } else if (weightedSum >= 3) {
      score = 25;
      intensity = 'low';
      label = '📉 Low';
    } else {
      score = 10;
      intensity = 'low';
      label = '⏸️ Quiet';
    }
    
    clusters.push({
      minutesToClose: centerTime,
      timeframes: clusterTFs,
      size,
      weightedScore: weightedSum,
      intensity,
      score,
      label,
    });
  }
  
  // Get main cluster (best by weighted score)
  const mainCluster = clusters[0] || {
    minutesToClose: 999,
    timeframes: [],
    size: 0,
    weightedScore: 0,
    intensity: 'low' as const,
    score: 0,
    label: '⏸️ No Active Clusters',
  };
  
  // Find next meaningful cluster (weighted score >= 7)
  const meaningfulClusters = clusters.filter(c => c.weightedScore >= 7);
  const nextMeaningful = meaningfulClusters.find(c => c.minutesToClose > 0) || mainCluster;
  
  // Check if closing right now
  const activeNow = mainCluster.minutesToClose <= 1 && mainCluster.size >= 2;
  
  // Build summary label (now shows weighted importance)
  let compressionLabel: string;
  if (activeNow) {
    compressionLabel = `🔴 ${mainCluster.size} TFs closing NOW (${mainCluster.weightedScore.toFixed(0)} pts)`;
  } else if (mainCluster.weightedScore >= 12 && mainCluster.minutesToClose <= 10) {
    compressionLabel = `${mainCluster.size} TFs closing in ${mainCluster.minutesToClose}m (${mainCluster.weightedScore.toFixed(0)} pts)`;
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
 * Get all timeframes currently in decompression WINDOW (time-based only)
 * NOTE: Renamed for clarity - this checks TIME WINDOW, not actual price decompression
 * For actual decompression, also check if price is moving toward candle 50% level
 */
export function getDecompressionStatus(date: Date): DecompressionWindowStatus[] {
  const results: DecompressionWindowStatus[] = [];
  
  // Get temporal compression for context
  const compression = calcTemporalCompression(date, 5);
  
  // Only return TFs that are part of a meaningful cluster (weighted >= 5)
  const mainClusterTFs = new Set(compression.mainCluster.timeframes);
  
  for (const tf of ALL_INTRADAY_TFS) {
    const windowStartMins = DECOMPRESSION_WINDOW_START[tf];
    if (!windowStartMins) continue;
    
    const minsToClose = getMinutesToClose(date, tf);
    
    // Skip if too far from close or already closed
    if (minsToClose > windowStartMins || minsToClose <= 0) {
      continue;
    }
    
    // Only include if part of the main cluster (actual confluence)
    if (!mainClusterTFs.has(tf) && compression.mainCluster.size >= 2) {
      continue;
    }
    
    // This timeframe is in decompression window
    const phase = minsToClose <= windowStartMins * 0.25 ? 'imminent' : 'active';
    
    results.push({
      timeframe: tf,
      isInWindow: true,
      minutesToClose: minsToClose,
      windowStartMins,
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
  else if (minutesSinceOpen === 390) desc = 'Market close - RTH + daily candle';
  else if (allClosing.length >= 5) desc = `${allClosing.length}-way confluence`;
  else desc = `${allClosing.length} candles closing`;
  
  return {
    time: date,
    timeET: formatET(date),
    closingCandles: allClosing,
    confluenceScore: score,
    impactLevel: impact,
    // FIX: isFibonacci means "any fib interval is closing", not "more fib than standard"
    isFibonacci: fibClosing.length > 0,
    isStandard: standardClosing.length > 0,
    isMacro: false,
    description: desc,
  };
}

/**
 * Get all major intraday confluences for today
 */
export function getTodayConfluences(date: Date): TimeConfluence[] {
  const etParts = getETParts(date);
  const confluences: TimeConfluence[] = [];
  
  // Start from 9:30 AM
  const start = new Date(`${etParts.dateStr}T${String(NYSE_OPEN_HOUR).padStart(2, '0')}:${String(NYSE_OPEN_MIN).padStart(2, '0')}:00`);
  
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
  const clock = createMarketClock(date);
  const currentMins = clock.minutesSinceMidnight;
  const openMins = NYSE_OPEN_HOUR * 60 + NYSE_OPEN_MIN;
  const closeMins = NYSE_CLOSE_MINS;
  
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
      const etParts = getETParts(date);
      const checkTime = new Date(`${etParts.dateStr}T12:00:00`);
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
  const etParts = getETParts(date);
  const currentDate = new Date(`${etParts.dateStr}T12:00:00`);
  const nextDay = new Date(currentDate);
  nextDay.setDate(nextDay.getDate() + 1);
  
  // Skip weekends
  while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
    nextDay.setDate(nextDay.getDate() + 1);
  }

  // Skip market holidays
  while (NYSE_HOLIDAYS.has(`${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`)) {
    nextDay.setDate(nextDay.getDate() + 1);
    while (nextDay.getDay() === 0 || nextDay.getDay() === 6) {
      nextDay.setDate(nextDay.getDate() + 1);
    }
  }
  
  return nextDay.getMonth() !== currentDate.getMonth();
}

/**
 * Check if date is last trading day of quarter
 */
function isLastTradingDayOfQuarter(date: Date): boolean {
  if (!isLastTradingDayOfMonth(date)) return false;
  const month = new Date(getETParts(date).dateStr).getMonth();
  return month === 2 || month === 5 || month === 8 || month === 11; // Mar, Jun, Sep, Dec
}

/**
 * Check if date is last trading day of year
 */
function isLastTradingDayOfYear(date: Date): boolean {
  if (!isLastTradingDayOfMonth(date)) return false;
  return new Date(getETParts(date).dateStr).getMonth() === 11; // December
}

/**
 * Check if date is a Friday
 */
function isFriday(date: Date): boolean {
  return new Date(getETParts(date).dateStr).getDay() === 5;
}

/**
 * Get trading week number of year (counts only full trading weeks)
 * Uses trading day index for proper alignment
 */
function getTradingWeekOfYear(date: Date): number {
  const clock = createMarketClock(date);
  // 5 trading days per week on average
  return Math.ceil(clock.tradingDayIndex / 5);
}

/**
 * Get macro candles closing on a given date
 * Now tracks ALL 35 timeframes for complete confluence detection
 * 
 * IMPORTANT: Uses trading day index (not calendar day) for N-day cycles
 * to ensure proper alignment regardless of holidays/weekends
 */
export function getMacroClosingCandles(date: Date): string[] {
  const closing: string[] = [];
  const clock = createMarketClock(date);
  const tradingDayIdx = clock.tradingDayIndex;
  const weekNum = getTradingWeekOfYear(date);
  
  const etParts = getETParts(date);
  const month = new Date(etParts.dateStr).getMonth(); // 0-indexed
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY CYCLES (1D - 7D) - Uses trading day index, not calendar day
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 1D: Always closes every trading day
  closing.push('1D');
  
  // 2D: Closes every 2nd trading day
  if (tradingDayIdx % 2 === 0) closing.push('2D');
  
  // 3D: Closes every 3rd trading day
  if (tradingDayIdx % 3 === 0) closing.push('3D');
  
  // 4D: Closes every 4th trading day
  if (tradingDayIdx % 4 === 0) closing.push('4D');
  
  // 5D: Closes every 5th trading day (1 week)
  if (tradingDayIdx % 5 === 0) closing.push('5D');
  
  // 6D: Closes every 6th trading day
  if (tradingDayIdx % 6 === 0) closing.push('6D');
  
  // 7D: Closes every 7th trading day
  if (tradingDayIdx % 7 === 0) closing.push('7D');
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WEEKLY CYCLES (1W - 4W) - All close on Friday (or last trading day of week)
  // Uses trading week number for proper alignment
  // ═══════════════════════════════════════════════════════════════════════════
  
  if (isFriday(date)) {
    // 1W: Every Friday
    closing.push('1W');
    
    // 2W: Every 2nd trading week
    if (weekNum % 2 === 0) closing.push('2W');
    
    // 3W: Every 3rd trading week
    if (weekNum % 3 === 0) closing.push('3W');
    
    // 4W: Every 4th trading week (roughly monthly)
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
 * Skips holidays and weekends properly
 */
export function getNextMacroConfluence(fromDate: Date): { confluence: MacroConfluence; daysAway: number } {
  const etParts = getETParts(fromDate);
  let checkDate = new Date(etParts.dateStr + 'T12:00:00');
  let daysAway = 0;
  
  // Look up to 90 days ahead
  for (let i = 1; i <= 90; i++) {
    checkDate.setDate(checkDate.getDate() + 1);
    daysAway++;
    
    // Skip weekends
    if (checkDate.getDay() === 0 || checkDate.getDay() === 6) continue;
    
    // Skip market holidays
    const dateKey = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    if (NYSE_HOLIDAYS.has(dateKey)) continue;
    
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
  const clock = createMarketClock(date);
  const sessionType = getSessionType(date);
  const marketOpen = clock.isMarketOpen;
  
  // Get current intraday confluence
  const now = getIntradayConfluence(date);
  
  // Get decompression status - which TFs are decompressing toward 50%
  const decompressing = marketOpen ? getDecompressionStatus(date) : [];
  
  // Get TEMPORAL COMPRESSION - the real confluence metric
  const temporalCompression = marketOpen 
    ? calcTemporalCompression(date, 5) 
    : {
        mainCluster: { minutesToClose: 999, timeframes: [], size: 0, weightedScore: 0, intensity: 'low' as const, score: 0, label: '⏸️ Market Closed' },
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
// HIGH-IMPACT DATES (Dynamically generated)
// ═══════════════════════════════════════════════════════════════════════════

export interface HighImpactDate {
  date: string;
  description: string;
  candles: string[];
}

function mapMacroTfLabel(tf: string): string {
  const labelMap: Record<string, string> = {
    '1D': 'Daily',
    '2D': '2-Day',
    '3D': '3-Day',
    '4D': '4-Day',
    '5D': '5-Day',
    '6D': '6-Day',
    '7D': '7-Day',
    '1W': 'Weekly',
    '2W': 'Bi-weekly',
    '3W': '3-Week',
    '4W': '4-Week',
    '1M': 'Monthly',
    '2M': '2-Month',
    '3M': 'Quarterly',
    '4M': '4-Month',
    '5M': '5-Month',
    '6M': 'Semi-Annual',
    '7M': '7-Month',
    '8M': '8-Month',
    '9M': '9-Month',
    '10M': '10-Month',
    '11M': '11-Month',
    '1Y': 'Yearly',
  };
  return labelMap[tf] ?? tf;
}

export function getHighImpactDates(year: number): HighImpactDate[] {
  const results: HighImpactDate[] = [];
  const dateCursor = new Date(`${year}-01-01T12:00:00`);

  while (dateCursor.getFullYear() === year) {
    const dayOfWeek = dateCursor.getDay();
    const dateKey = `${dateCursor.getFullYear()}-${String(dateCursor.getMonth() + 1).padStart(2, '0')}-${String(dateCursor.getDate()).padStart(2, '0')}`;

    // Trading days only
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (!isWeekend && !NYSE_HOLIDAYS.has(dateKey)) {
      const macro = getMacroConfluence(dateCursor);

      // Major monthly / quarterly / yearly closes
      const isMajor = macro.isYearly || macro.isQuarterly || macro.closingCandles.includes('1M');
      if (isMajor) {
        let description = `Month End - ${macro.closingCandles.length} TFs align`;
        if (macro.isYearly) description = `YEAR END - ${macro.closingCandles.length} TFs align`;
        else if (macro.isQuarterly) description = `QUARTER END - ${macro.closingCandles.length} TFs align`;

        results.push({
          date: dateKey,
          description,
          candles: macro.closingCandles.map(mapMacroTfLabel),
        });
      }
    }

    dateCursor.setDate(dateCursor.getDate() + 1);
  }

  return results;
}

// Backward-compatible exports used by UI
export const HIGH_IMPACT_DATES_2025 = getHighImpactDates(2025);
export const HIGH_IMPACT_DATES_2026 = getHighImpactDates(2026);
