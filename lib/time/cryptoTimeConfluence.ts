/**
 * Crypto Time Confluence Engine v1.0
 * 
 * For TradingView crypto, every higher timeframe ultimately derives from the daily close at 00:00 UTC.
 * Since you're in Sydney (AEDT / UTC+11), the daily close = 11:00 AM local time.
 * 
 * This engine treats 11:00 AM (00:00 UTC) as the anchor and builds every higher timeframe cycle from it.
 * 
 * Tracks:
 * - 1-7 Day Micro Cycle
 * - 8-30 Day Monthly Cycle
 * - 31-90 Day Macro Rotation
 * - 91-365 Day Institutional Cycle
 * 
 * Scoring System:
 * - 3D close = +1
 * - 5D close = +1
 * - 7D close = +2
 * - 14D close = +1
 * - 21D close = +2
 * - 30D close = +3
 * - 45D close = +2
 * - 60D close = +2
 * - 90D close = +4
 * - 180D close = +4
 * - 365D close = +5
 * 
 * Triggers alerts when confluence score ≥ 6
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Crypto daily close anchor (UTC midnight)
 * For Sydney (UTC+11), this is 11:00 AM local time
 */
const CRYPTO_DAILY_CLOSE_UTC_HOUR = 0;
const CRYPTO_DAILY_CLOSE_UTC_MINUTE = 0;

/**
 * Key crypto time confluence cycles (in days)
 * These are the highest-probability time nodes
 *
 * Tracked crypto timeframes (12 total):
 *   Day-based: 1D, 2D, 3D, 5D, 6D, 9D, 10D, 15D, 18D, 30D
 *   Month-based: 1M, 3M (handled separately via calendar boundaries)
 */
export const CRYPTO_CYCLES = {
  // Micro Cycle (1-6D)
  '1D': 1,
  '2D': 2,
  '3D': 3,   // Short-term trend reversals
  '5D': 5,   // Breakout continuation
  '6D': 6,   // Harmonic expansion
  
  // Extended Cycle (9-30D)
  '9D': 9,   // Harmonic trend acceleration
  '10D': 10, // Momentum exhaustion window
  '15D': 15, // Half-month liquidity pivot
  '18D': 18, // Mid-month structural node
  '30D': 30, // Monthly close
} as const;

/**
 * Cycle importance scores
 * Higher scores indicate more significant time nodes
 */
export const CYCLE_SCORES: Record<string, number> = {
  '1D': 0,
  '2D': 0,
  '3D': 1,   // Short-term trend reversals
  '5D': 1,   // Breakout continuation
  '6D': 0,
  '9D': 1,   // Harmonic acceleration
  '10D': 1,  // Momentum exhaustion
  '15D': 2,  // Half-month pivot
  '18D': 1,  // Mid-month node
  '30D': 3,  // Monthly close
};

/**
 * High-priority confluence nodes
 * These cycles often mark major market turning points
 */
export const HIGH_PRIORITY_CYCLES = [
  '3D', '5D', '10D', '15D', '18D', '30D'
] as const;

/**
 * Confluence score threshold for alerts
 * When score ≥ 6, expect high-probability volatility expansion
 */
export const CONFLUENCE_ALERT_THRESHOLD = 6;

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CryptoTimeNode {
  cycle: string;           // e.g., '3D', '21D', '90D'
  cycleDays: number;       // Number of days in cycle
  score: number;           // Importance score for this cycle
  nextClose: Date;         // Next close time (UTC)
  timeToClose: number;     // Milliseconds until close
  hoursToClose: number;    // Hours until close
  isActive: boolean;       // Is this cycle close happening soon? (within 48h)
  isHighPriority: boolean; // Is this a high-priority node?
}

export interface CryptoTimeConfluenceResult {
  timestamp: Date;                    // Current time
  timestampUTC: string;              // Current time (UTC string)
  nextDailyClose: Date;              // Next 00:00 UTC daily close
  hoursToNextDaily: number;          // Hours until next daily close
  activeCycles: CryptoTimeNode[];    // Cycles closing within 48h
  upcomingCycles: CryptoTimeNode[];  // All upcoming cycles
  confluenceScore: number;           // Total confluence score (sum of active cycles)
  isHighConfluence: boolean;         // score ≥ 6
  confluenceLevel: 'low' | 'medium' | 'high' | 'extreme'; // Categorized level
  alert: string | null;              // Alert message if high confluence detected
  description: string;               // Human-readable confluence summary
  cycleBreakdown: string[];          // List of active cycles for display
}

// ═══════════════════════════════════════════════════════════════════════════
// TIME CALCULATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get the next UTC midnight (daily close for crypto)
 */
function getNextUTCMidnight(now: Date = new Date()): Date {
  const utcDate = new Date(now.toISOString());
  utcDate.setUTCHours(CRYPTO_DAILY_CLOSE_UTC_HOUR, CRYPTO_DAILY_CLOSE_UTC_MINUTE, 0, 0);
  
  // If we're past midnight today, move to tomorrow
  if (utcDate <= now) {
    utcDate.setUTCDate(utcDate.getUTCDate() + 1);
  }
  
  return utcDate;
}

/**
 * Get the next close time for a given cycle (in days)
 * All cycles are multiples of the daily close (00:00 UTC)
 */
function getNextCycleClose(cycleDays: number, now: Date = new Date()): Date {
  // Get today's UTC midnight as reference
  const todayMidnight = new Date(now.toISOString());
  todayMidnight.setUTCHours(0, 0, 0, 0);
  
  // Calculate days since epoch (to determine cycle alignment)
  const epochStart = new Date('1970-01-01T00:00:00Z');
  const daysSinceEpoch = Math.floor((todayMidnight.getTime() - epochStart.getTime()) / (1000 * 60 * 60 * 24));
  
  // Calculate days until next cycle close
  const daysInCurrentCycle = daysSinceEpoch % cycleDays;
  const daysUntilClose = daysInCurrentCycle === 0 ? 0 : cycleDays - daysInCurrentCycle;
  
  // Calculate next close time
  const nextClose = new Date(todayMidnight);
  nextClose.setUTCDate(nextClose.getUTCDate() + daysUntilClose);
  
  // If the close is in the past or now, move to next cycle
  if (nextClose <= now) {
    nextClose.setUTCDate(nextClose.getUTCDate() + cycleDays);
  }
  
  return nextClose;
}

/**
 * Calculate time remaining until a target date
 */
function getTimeToClose(targetDate: Date, now: Date = new Date()): number {
  return targetDate.getTime() - now.getTime();
}

/**
 * Check if a cycle is active (close happening within 48 hours)
 */
function isCycleActive(hoursToClose: number): boolean {
  return hoursToClose >= 0 && hoursToClose <= 48;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CONFLUENCE ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute all crypto time confluence cycles
 * Returns active cycles, scores, and alerts
 */
export function computeCryptoTimeConfluence(now: Date = new Date()): CryptoTimeConfluenceResult {
  const nextDailyClose = getNextUTCMidnight(now);
  const msToDaily = getTimeToClose(nextDailyClose, now);
  const hoursToNextDaily = msToDaily / (1000 * 60 * 60);
  
  // Calculate all cycle nodes
  const allCycles: CryptoTimeNode[] = Object.entries(CRYPTO_CYCLES).map(([cycleKey, cycleDays]) => {
    const nextClose = getNextCycleClose(cycleDays, now);
    const timeToClose = getTimeToClose(nextClose, now);
    const hoursToClose = timeToClose / (1000 * 60 * 60);
    const score = CYCLE_SCORES[cycleKey] || 0;
    const isActive = isCycleActive(hoursToClose);
    const isHighPriority = HIGH_PRIORITY_CYCLES.includes(cycleKey as any);
    
    return {
      cycle: cycleKey,
      cycleDays,
      score,
      nextClose,
      timeToClose,
      hoursToClose,
      isActive,
      isHighPriority,
    };
  });
  
  // Filter active cycles (closing within 48h)
  const activeCycles = allCycles
    .filter(cycle => cycle.isActive)
    .sort((a, b) => a.hoursToClose - b.hoursToClose);
  
  // Calculate confluence score (sum of active cycle scores)
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
  
  const isHighConfluence = confluenceScore >= CONFLUENCE_ALERT_THRESHOLD;
  
  // Generate cycle breakdown for display
  const cycleBreakdown = activeCycles.map(cycle => 
    `${cycle.cycle} (${cycle.hoursToClose.toFixed(1)}h, score: ${cycle.score})`
  );
  
  // Generate alert message if high confluence
  let alert: string | null = null;
  if (isHighConfluence) {
    const topCycles = activeCycles
      .filter(c => c.score > 0)
      .map(c => c.cycle)
      .join(' + ');
    alert = `⚠️ HIGH TIME CONFLUENCE DETECTED: ${topCycles} closing within 48h. Score: ${confluenceScore}. Expect volatility expansion window.`;
  }
  
  // Generate human-readable description
  let description = '';
  if (activeCycles.length === 0) {
    description = 'No major cycle closes in next 48h. Low time confluence.';
  } else if (confluenceLevel === 'extreme') {
    description = `EXTREME confluence (score ${confluenceScore}): ${activeCycles.length} cycles closing. Major decompression window likely.`;
  } else if (confluenceLevel === 'high') {
    description = `HIGH confluence (score ${confluenceScore}): ${activeCycles.length} cycles closing. Watch for breakout/breakdown.`;
  } else if (confluenceLevel === 'medium') {
    description = `MEDIUM confluence (score ${confluenceScore}): ${activeCycles.length} cycles closing. Moderate time edge.`;
  } else {
    description = `LOW confluence (score ${confluenceScore}): ${activeCycles.length} minor cycles closing.`;
  }
  
  // Sort all cycles by time to close for "upcoming" view
  const upcomingCycles = [...allCycles].sort((a, b) => a.hoursToClose - b.hoursToClose);
  
  return {
    timestamp: now,
    timestampUTC: now.toISOString(),
    nextDailyClose,
    hoursToNextDaily,
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
 * Get upcoming high-priority cycle closes (next 7 days)
 */
export function getUpcomingHighPriorityCycles(now: Date = new Date()): CryptoTimeNode[] {
  const result = computeCryptoTimeConfluence(now);
  const sevenDaysInHours = 7 * 24;
  
  return result.upcomingCycles
    .filter(cycle => cycle.isHighPriority && cycle.hoursToClose <= sevenDaysInHours)
    .slice(0, 10); // Top 10
}

/**
 * Format time remaining in human-readable form
 */
export function formatTimeRemaining(hours: number): string {
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  } else if (hours < 24) {
    return `${hours.toFixed(1)}h`;
  } else {
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
  }
}

/**
 * Check if a specific symbol should receive a confluence alert
 * This can be extended to filter by symbol-specific criteria
 */
export function shouldAlertSymbol(
  symbol: string,
  confluenceResult: CryptoTimeConfluenceResult,
  options: {
    minScore?: number;
    requireHighPriority?: boolean;
  } = {}
): boolean {
  const { minScore = CONFLUENCE_ALERT_THRESHOLD, requireHighPriority = false } = options;
  
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
 * Example usage and testing
 */
export function exampleUsage() {
  const result = computeCryptoTimeConfluence();
  
  console.log('=== CRYPTO TIME CONFLUENCE REPORT ===');
  console.log(`Current Time (UTC): ${result.timestampUTC}`);
  console.log(`Next Daily Close: ${result.nextDailyClose.toISOString()}`);
  console.log(`Hours to Next Daily: ${result.hoursToNextDaily.toFixed(1)}h`);
  console.log('');
  console.log('=== ACTIVE CYCLES (Next 48h) ===');
  if (result.activeCycles.length === 0) {
    console.log('No cycles closing in next 48h');
  } else {
    result.activeCycles.forEach(cycle => {
      console.log(`${cycle.cycle}: ${formatTimeRemaining(cycle.hoursToClose)} (score: ${cycle.score})${cycle.isHighPriority ? ' ⭐' : ''}`);
    });
  }
  console.log('');
  console.log(`Confluence Score: ${result.confluenceScore}`);
  console.log(`Confluence Level: ${result.confluenceLevel.toUpperCase()}`);
  console.log(`Description: ${result.description}`);
  if (result.alert) {
    console.log('');
    console.log(result.alert);
  }
  
  return result;
}
