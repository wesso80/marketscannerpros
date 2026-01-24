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
  daily: 1,
  '2day': 2,
  '3day': 3,
  '4day': 4,
  weekly: 5,
  biweekly: 10,
  '3week': 15,
  '5week': 25,
  '7week': 35,
  '9week': 45,
  monthly: 21, // ~21 trading days
  quarterly: 63, // ~63 trading days
  yearly: 252, // ~252 trading days
};

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
 */
export function getMacroClosingCandles(date: Date): string[] {
  const closing: string[] = [];
  
  // Daily always closes
  closing.push('Daily');
  
  // Weekly (Friday)
  if (isFriday(date)) {
    closing.push('Weekly');
    
    // Check for bi-weekly, 3-week, etc.
    const weekNum = getWeekOfYear(date);
    if (weekNum % 2 === 0) closing.push('Bi-weekly');
    if (weekNum % 3 === 0) closing.push('3-Week');
    if (weekNum % 5 === 0) closing.push('5-Week');
    if (weekNum % 7 === 0) closing.push('7-Week');
    if (weekNum % 9 === 0) closing.push('9-Week');
  }
  
  // Monthly
  if (isLastTradingDayOfMonth(date)) {
    closing.push('Monthly');
  }
  
  // Quarterly
  if (isLastTradingDayOfQuarter(date)) {
    closing.push('Quarterly');
  }
  
  // Yearly
  if (isLastTradingDayOfYear(date)) {
    closing.push('Yearly');
  }
  
  return closing;
}

/**
 * Get macro confluence for a date
 */
export function getMacroConfluence(date: Date): MacroConfluence {
  const closing = getMacroClosingCandles(date);
  const isQuarterly = closing.includes('Quarterly');
  const isYearly = closing.includes('Yearly');
  
  let score = closing.length;
  if (isQuarterly) score += 3;
  if (isYearly) score += 5;
  
  let impact: 'high' | 'very_high' | 'maximum' = 'high';
  if (isYearly) impact = 'maximum';
  else if (isQuarterly) impact = 'very_high';
  
  let desc = '';
  if (isYearly) desc = 'YEAR END - All timeframes align';
  else if (isQuarterly) desc = 'Quarter end - major pivot';
  else if (closing.includes('Monthly')) desc = 'Month end - swing pivot';
  else if (closing.includes('Weekly')) desc = 'Weekly close';
  else desc = 'Daily close';
  
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
