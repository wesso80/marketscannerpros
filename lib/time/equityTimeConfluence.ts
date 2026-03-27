/**
 * Equity Time Confluence Engine v1.0
 * 
 * For equities, candles are built from TRADING SESSIONS, not calendar days.
 * 
 * Key Differences from Crypto:
 * - Crypto: 24/7 continuous, anchored to UTC midnight
 * - Equities: Session-based (9:30-16:00 ET), weekends/holidays excluded
 * 
 * This engine tracks cycles using TRADING DAY INDEX instead of calendar days.
 * 
 * Example:
 * - 21D equity candle = 21 trading sessions (NOT 21 calendar days)
 * - Weekends and holidays break the cycle
 * - Cycles close at market close (16:00 ET / 21:00 UTC)
 * 
 * Tracks same cycles as crypto (3D, 7D, 21D, etc.) but using trading sessions.
 */

// ═══════════════════════════════════════════════════════════════════════════
// MARKET CALENDAR (NYSE)
// ═══════════════════════════════════════════════════════════════════════════

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

const NYSE_HALF_DAYS: Set<string> = new Set([
  // 2025
  '2025-07-03', // Day before Independence Day
  '2025-11-28', // Day after Thanksgiving
  '2025-12-24', // Christmas Eve
  // 2026
  '2026-11-27', // Day after Thanksgiving
  '2026-12-24', // Christmas Eve
]);

const NYSE_CLOSE_HOUR_ET = 16; // 4:00 PM ET
const NYSE_CLOSE_MINUTE_ET = 0;

/**
 * Check if a date is a trading day (not weekend or holiday)
 */
function isTradingDay(date: Date): boolean {
  const dayOfWeek = date.getDay();
  
  // Weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  // Holiday
  const dateStr = date.toISOString().split('T')[0];
  if (NYSE_HOLIDAYS.has(dateStr)) {
    return false;
  }
  
  return true;
}

/**
 * Get next trading day from a given date
 */
function getNextTradingDay(from: Date): Date {
  const next = new Date(from);
  next.setDate(next.getDate() + 1);
  
  while (!isTradingDay(next)) {
    next.setDate(next.getDate() + 1);
  }
  
  return next;
}

/**
 * Build a trading day calendar (array of trading dates)
 * Used to calculate trading day index
 */
function buildTradingDayCalendar(startDate: Date, numDays: number): Date[] {
  const calendar: Date[] = [];
  let current = new Date(startDate);
  
  while (calendar.length < numDays) {
    if (isTradingDay(current)) {
      calendar.push(new Date(current));
    }
    current.setDate(current.getDate() + 1);
  }
  
  return calendar;
}

/**
 * Get trading day index for a given date
 * Returns the number of trading days since a reference epoch
 */
function getTradingDayIndex(date: Date): number {
  // Reference epoch: Jan 2, 2020 (first trading day of 2020)
  const epoch = new Date('2020-01-02');
  
  let count = 0;
  const current = new Date(epoch);
  
  // Count trading days from epoch to target date
  while (current < date) {
    if (isTradingDay(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

// ═══════════════════════════════════════════════════════════════════════════
// EQUITY CYCLES
// Day-based cycles use trading day index; week-based close on Fridays.
//
// Tracked equity timeframes (12 total):
//   Day-based: 1D, 2D, 4D, 8D, 11D, 22D
//   Week-based: 1W, 2W, 3W, 4W, 6W, 12W
// ═══════════════════════════════════════════════════════════════════════════

export const EQUITY_CYCLES = {
  // Day-based (trading sessions)
  '1D': 1,
  '2D': 2,    // 2-session cycle
  '4D': 4,    // Mid-week structural node
  '8D': 8,    // Extended pullback cycle
  '11D': 11,  // Mid-month momentum cycle
  '22D': 22,  // Full month cycle (~22 trading days)
  
  // Week-based (close on Friday at market close)
  '1W': 5,    // 1 week = ~5 trading days
  '2W': 10,   // Bi-weekly
  '3W': 15,   // 3-week cycle
  '4W': 20,   // Monthly (4 weeks)
  '6W': 30,   // 6-week intermediate cycle
  '12W': 60,  // Quarterly cycle (~12 weeks)
} as const;

/**
 * Cycle importance scores
 */
export const EQUITY_CYCLE_SCORES: Record<string, number> = {
  '1D': 0,
  '2D': 0,
  '4D': 1,    // Mid-week node
  '8D': 1,    // Extended pullback
  '11D': 1,   // Mid-month
  '22D': 3,   // Full month cycle
  '1W': 2,    // Weekly close (major)
  '2W': 1,    // Bi-weekly
  '3W': 1,    // 3-week
  '4W': 2,    // Monthly close
  '6W': 3,    // Intermediate cycle
  '12W': 4,   // Quarterly close
};

export const HIGH_PRIORITY_EQUITY_CYCLES = [
  '4D', '22D', '1W', '4W', '6W', '12W'
] as const;

export const EQUITY_CONFLUENCE_ALERT_THRESHOLD = 6;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface EquityTimeNode {
  cycle: string;
  cycleDays: number;        // Trading days in cycle
  score: number;
  nextClose: Date;          // Next market close (4:00 PM ET)
  timeToClose: number;      // Milliseconds until close
  hoursToClose: number;     // Hours until close
  tradingDaysToClose: number; // Trading days until close
  isActive: boolean;        // Closing within 2 trading days?
  isHighPriority: boolean;
}

export interface EquityTimeConfluenceResult {
  timestamp: Date;
  timestampET: string;
  nextSessionClose: Date;
  hoursToNextClose: number;
  tradingDayIndex: number;  // Current trading day index
  activeCycles: EquityTimeNode[];
  upcomingCycles: EquityTimeNode[];
  confluenceScore: number;
  isHighConfluence: boolean;
  confluenceLevel: 'low' | 'medium' | 'high' | 'extreme';
  alert: string | null;
  description: string;
  cycleBreakdown: string[];
}

// ═══════════════════════════════════════════════════════════════════════════
// TIME CALCULATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get next market close (4:00 PM ET)
 */
function getNextMarketClose(now: Date = new Date()): Date {
  // Convert to ET
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etString);
  
  // Set to 4:00 PM today
  const closeToday = new Date(etDate);
  closeToday.setHours(NYSE_CLOSE_HOUR_ET, NYSE_CLOSE_MINUTE_ET, 0, 0);
  
  // If we're past today's close or today is not a trading day, get next trading day's close
  if (closeToday <= etDate || !isTradingDay(closeToday)) {
    const nextTradingDate = getNextTradingDay(closeToday);
    nextTradingDate.setHours(NYSE_CLOSE_HOUR_ET, NYSE_CLOSE_MINUTE_ET, 0, 0);
    return nextTradingDate;
  }
  
  return closeToday;
}

/**
 * Get the next cycle close based on trading day index
 */
function getNextEquityCycleClose(cycleTradingDays: number, now: Date = new Date()): Date {
  const currentTDIndex = getTradingDayIndex(now);
  
  // Calculate trading days into current cycle
  const daysInCurrentCycle = currentTDIndex % cycleTradingDays;
  const tradingDaysUntilClose = daysInCurrentCycle === 0 ? 0 : cycleTradingDays - daysInCurrentCycle;
  
  // Find the Nth trading day from now
  let targetDate = new Date(now);
  let remaining = tradingDaysUntilClose;
  
  while (remaining > 0) {
    targetDate = getNextTradingDay(targetDate);
    remaining--;
  }
  
  // Set to market close time (4:00 PM ET)
  targetDate.setHours(NYSE_CLOSE_HOUR_ET, NYSE_CLOSE_MINUTE_ET, 0, 0);
  
  // If the close is in the past, move to next cycle
  if (targetDate <= now) {
    remaining = cycleTradingDays;
    while (remaining > 0) {
      targetDate = getNextTradingDay(targetDate);
      remaining--;
    }
    targetDate.setHours(NYSE_CLOSE_HOUR_ET, NYSE_CLOSE_MINUTE_ET, 0, 0);
  }
  
  return targetDate;
}

/**
 * Count trading days between two dates
 */
function countTradingDaysBetween(from: Date, to: Date): number {
  let count = 0;
  const current = new Date(from);
  
  while (current < to) {
    if (isTradingDay(current)) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return count;
}

/**
 * Check if cycle is active (closing within 2 trading days)
 */
function isEquityCycleActive(tradingDaysToClose: number): boolean {
  return tradingDaysToClose >= 0 && tradingDaysToClose <= 2;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CONFLUENCE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute equity time confluence based on trading day cycles
 */
export function computeEquityTimeConfluence(now: Date = new Date()): EquityTimeConfluenceResult {
  const nextSessionClose = getNextMarketClose(now);
  const msToClose = nextSessionClose.getTime() - now.getTime();
  const hoursToNextClose = msToClose / (1000 * 60 * 60);
  const tradingDayIndex = getTradingDayIndex(now);
  
  // Calculate all cycle nodes
  const allCycles: EquityTimeNode[] = Object.entries(EQUITY_CYCLES).map(([cycleKey, cycleDays]) => {
    const nextClose = getNextEquityCycleClose(cycleDays, now);
    const timeToClose = nextClose.getTime() - now.getTime();
    const hoursToClose = timeToClose / (1000 * 60 * 60);
    const tradingDaysToClose = countTradingDaysBetween(now, nextClose);
    const score = EQUITY_CYCLE_SCORES[cycleKey] || 0;
    const isActive = isEquityCycleActive(tradingDaysToClose);
    const isHighPriority = HIGH_PRIORITY_EQUITY_CYCLES.includes(cycleKey as any);
    
    return {
      cycle: cycleKey,
      cycleDays,
      score,
      nextClose,
      timeToClose,
      hoursToClose,
      tradingDaysToClose,
      isActive,
      isHighPriority,
    };
  });
  
  // Filter active cycles (closing within 2 trading days)
  const activeCycles = allCycles
    .filter(cycle => cycle.isActive)
    .sort((a, b) => a.tradingDaysToClose - b.tradingDaysToClose);
  
  // Calculate confluence score
  const confluenceScore = activeCycles.reduce((sum, cycle) => sum + cycle.score, 0);
  
  // Determine confluence level
  let confluenceLevel: 'low' | 'medium' | 'high' | 'extreme';
  if (confluenceScore >= 10) {
    confluenceLevel = 'extreme';
  } else if (confluenceScore >= 6) {
    confluenceLevel = 'high';
  } else if (confluenceScore >= 3) {
    confluenceLevel = 'medium';
  } else {
    confluenceLevel = 'low';
  }
  
  const isHighConfluence = confluenceScore >= EQUITY_CONFLUENCE_ALERT_THRESHOLD;
  
  // Generate cycle breakdown
  const cycleBreakdown = activeCycles.map(cycle => 
    `${cycle.cycle} (${cycle.tradingDaysToClose}TD, score: ${cycle.score})`
  );
  
  // Generate alert
  let alert: string | null = null;
  if (isHighConfluence) {
    const topCycles = activeCycles
      .filter(c => c.score > 0)
      .map(c => c.cycle)
      .join(' + ');
    alert = `⚠️ HIGH EQUITY TIME CONFLUENCE: ${topCycles} closing within 2 trading days. Score: ${confluenceScore}. Watch for market volatility.`;
  }
  
  // Generate description
  let description = '';
  if (activeCycles.length === 0) {
    description = 'No major equity cycles closing in next 2 trading days.';
  } else if (confluenceLevel === 'extreme') {
    description = `EXTREME confluence (score ${confluenceScore}): ${activeCycles.length} cycles closing. Major market move likely.`;
  } else if (confluenceLevel === 'high') {
    description = `HIGH confluence (score ${confluenceScore}): ${activeCycles.length} cycles closing. Watch for breakout/breakdown.`;
  } else if (confluenceLevel === 'medium') {
    description = `MEDIUM confluence (score ${confluenceScore}): ${activeCycles.length} cycles closing. Moderate time edge.`;
  } else {
    description = `LOW confluence (score ${confluenceScore}): ${activeCycles.length} minor cycles closing.`;
  }
  
  const upcomingCycles = [...allCycles].sort((a, b) => a.tradingDaysToClose - b.tradingDaysToClose);
  
  return {
    timestamp: now,
    timestampET: now.toLocaleString('en-US', { timeZone: 'America/New_York' }),
    nextSessionClose,
    hoursToNextClose,
    tradingDayIndex,
    activeCycles,
    upcomingCycles,
    confluenceScore,
    isHighConfluence,
    confluenceLevel,
    alert,
    description,
    cycleBreakdown,
  };
}

/**
 * Get upcoming high-priority equity cycles
 */
export function getUpcomingHighPriorityEquityCycles(now: Date = new Date()): EquityTimeNode[] {
  const result = computeEquityTimeConfluence(now);
  
  return result.upcomingCycles
    .filter(cycle => cycle.isHighPriority && cycle.tradingDaysToClose <= 10)
    .slice(0, 10);
}

/**
 * Format trading days remaining
 */
export function formatTradingDaysRemaining(tradingDays: number, hours: number): string {
  if (tradingDays === 0) {
    if (hours < 1) {
      const minutes = Math.round(hours * 60);
      return `${minutes}m`;
    }
    return `${hours.toFixed(1)}h (today)`;
  } else if (tradingDays === 1) {
    return `1 TD (tomorrow)`;
  } else {
    return `${tradingDays} TD`;
  }
}

/**
 * Check if symbol should receive alert
 */
export function shouldAlertEquitySymbol(
  symbol: string,
  confluenceResult: EquityTimeConfluenceResult,
  options: {
    minScore?: number;
    requireHighPriority?: boolean;
  } = {}
): boolean {
  const { minScore = EQUITY_CONFLUENCE_ALERT_THRESHOLD, requireHighPriority = false } = options;
  
  if (confluenceResult.confluenceScore < minScore) {
    return false;
  }
  
  if (requireHighPriority) {
    const hasHighPriority = confluenceResult.activeCycles.some(c => c.isHighPriority && c.score > 0);
    return hasHighPriority;
  }
  
  return true;
}

/**
 * Example usage
 */
export function exampleEquityUsage() {
  const result = computeEquityTimeConfluence();
  
  console.log('=== EQUITY TIME CONFLUENCE REPORT ===');
  console.log(`Current Time (ET): ${result.timestampET}`);
  console.log(`Next Session Close: ${result.nextSessionClose.toLocaleString()}`);
  console.log(`Hours to Close: ${result.hoursToNextClose.toFixed(1)}h`);
  console.log(`Trading Day Index: ${result.tradingDayIndex}`);
  console.log('');
  console.log('=== ACTIVE CYCLES (Next 2 Trading Days) ===');
  if (result.activeCycles.length === 0) {
    console.log('No cycles closing');
  } else {
    result.activeCycles.forEach(cycle => {
      console.log(`${cycle.cycle}: ${formatTradingDaysRemaining(cycle.tradingDaysToClose, cycle.hoursToClose)} (score: ${cycle.score})${cycle.isHighPriority ? ' ⭐' : ''}`);
    });
  }
  console.log('');
  console.log(`Confluence Score: ${result.confluenceScore}`);
  console.log(`Level: ${result.confluenceLevel.toUpperCase()}`);
  console.log(`Description: ${result.description}`);
  if (result.alert) {
    console.log('');
    console.log(result.alert);
  }
  
  return result;
}
