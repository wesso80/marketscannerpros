/**
 * Decompression Timing Engine
 * 
 * Based on your handwritten Time → 50% decompression timing model.
 * 
 * Decompression happens BEFORE the candle CLOSES — ALL timeframes.
 * The window is when price is most likely to reach the 50% midpoint.
 * 
 * Timing Windows (minutes before candle close):
 * - 1H:  7–9 min before close
 * - 4H:  9–12 min before close
 * - 6H:  15–20 min before close
 * - 8H:  15–20 min before close
 * - 1D:  ~1 hr before close
 * - 2D:  ~2 hrs before close
 * - 3D:  ~3 hrs before close
 * - 4D:  ~4 hrs before close
 * - 5D:  ~5.2 hrs before close
 * - 1W:  ~6.5 hrs before close
 * - 2W:  ~13 hrs before close
 * - 1M:  ~26 hrs before close
 * - 2M:  ~52 hrs before close
 * - 6M:  ~6.5 days before close
 * - 1Y:  ~13 days before close
 * - 2Y:  ~26 days before close
 * - 4Y:  ~52 days before close
 * - 5Y:  ~104 days before close
 * 
 * IMPORTANT: Decompression is checked against the CURRENT live candle,
 * not the historical candle that created the midpoint.
 */

// ═══════════════════════════════════════════════════════════════════════════
// DECOMPRESSION TIMING WINDOWS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Decompression window definition — ALL measured before candle CLOSE.
 * windowStart: Window OPENS this many minutes before close (outer edge)
 * windowEnd:   Window CLOSES this many minutes before close (inner edge, closer to close)
 */
interface DecompressionWindow {
  timeframe: string;
  windowStart: number;  // Minutes before close when window OPENS
  windowEnd: number;    // Minutes before close when window CLOSES
}

/**
 * Complete decompression timing map — all before candle close
 */
export const DECOMPRESSION_WINDOWS: Record<string, DecompressionWindow> = {
  // Intraday — decompression in final minutes before close
  '1H': { timeframe: '1H', windowStart: 9, windowEnd: 7 },       // 7–9 min before close
  '2H': { timeframe: '2H', windowStart: 11, windowEnd: 8 },      // 8–11 min before close
  '3H': { timeframe: '3H', windowStart: 12, windowEnd: 8 },      // 8–12 min before close
  '4H': { timeframe: '4H', windowStart: 12, windowEnd: 9 },      // 9–12 min before close
  '6H': { timeframe: '6H', windowStart: 20, windowEnd: 15 },     // 15–20 min before close
  '8H': { timeframe: '8H', windowStart: 20, windowEnd: 15 },     // 15–20 min before close
  
  // Daily+ — decompression in final hours/days before close
  '1D': { timeframe: '1D', windowStart: 60, windowEnd: 48 },       // ~1 hr before close
  '2D': { timeframe: '2D', windowStart: 120, windowEnd: 96 },      // ~2 hrs before close
  '3D': { timeframe: '3D', windowStart: 180, windowEnd: 144 },     // ~3 hrs before close
  '4D': { timeframe: '4D', windowStart: 240, windowEnd: 192 },     // ~4 hrs before close
  '5D': { timeframe: '5D', windowStart: 312, windowEnd: 250 },     // ~5.2 hrs before close
  '1W': { timeframe: '1W', windowStart: 390, windowEnd: 312 },     // ~6.5 hrs before close
  '2W': { timeframe: '2W', windowStart: 780, windowEnd: 624 },     // ~13 hrs before close
  '1M': { timeframe: '1M', windowStart: 1560, windowEnd: 1248 },   // ~26 hrs before close
  '2M': { timeframe: '2M', windowStart: 3120, windowEnd: 2496 },   // ~52 hrs before close
  '6M': { timeframe: '6M', windowStart: 9360, windowEnd: 7488 },   // ~6.5 days before close
  '1Y': { timeframe: '1Y', windowStart: 18720, windowEnd: 14976 }, // ~13 days before close
  '2Y': { timeframe: '2Y', windowStart: 37440, windowEnd: 29952 }, // ~26 days before close
  '4Y': { timeframe: '4Y', windowStart: 74880, windowEnd: 59904 }, // ~52 days before close
  '5Y': { timeframe: '5Y', windowStart: 149760, windowEnd: 119808 }, // ~104 days before close
};

// ═══════════════════════════════════════════════════════════════════════════
// CURRENT CANDLE BOUNDARY CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

const MS_HOUR = 3_600_000;
const MS_DAY = 86_400_000;

/** Duration lookup for simple epoch-aligned timeframes */
const TF_DURATION_MS: Record<string, number> = {
  '1H': MS_HOUR,
  '2H': MS_HOUR * 2,
  '3H': MS_HOUR * 3,
  '4H': MS_HOUR * 4,
  '6H': MS_HOUR * 6,
  '8H': MS_HOUR * 8,
  '1D': MS_DAY,
  '2D': MS_DAY * 2,
  '3D': MS_DAY * 3,
  '4D': MS_DAY * 4,
  '5D': MS_DAY * 5,
};

/**
 * Get the CURRENT live candle boundaries for a given timeframe.
 * Decompression timing must be checked against the current bar, not the
 * historical candle that generated the midpoint.
 */
export function getCurrentCandleBoundaries(
  timeframe: string,
  currentTime: Date = new Date()
): { open: Date; close: Date } {
  const t = currentTime.getTime();

  // Epoch-aligned timeframes (1H–5D)
  const duration = TF_DURATION_MS[timeframe];
  if (duration) {
    const open = Math.floor(t / duration) * duration;
    return { open: new Date(open), close: new Date(open + duration) };
  }

  // Weekly: Monday 00:00 UTC → Sunday 24:00 UTC
  if (timeframe === '1W') {
    const d = new Date(currentTime);
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay(); // 0=Sun
    const daysBack = day === 0 ? 6 : day - 1;
    d.setUTCDate(d.getUTCDate() - daysBack);
    const open = d.getTime();
    return { open: new Date(open), close: new Date(open + 7 * MS_DAY) };
  }

  if (timeframe === '2W') {
    const twoWeeks = 14 * MS_DAY;
    const open = Math.floor(t / twoWeeks) * twoWeeks;
    return { open: new Date(open), close: new Date(open + twoWeeks) };
  }

  // Monthly
  if (timeframe === '1M') {
    const d = new Date(currentTime);
    const open = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const close = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    return { open, close };
  }
  if (timeframe === '2M') {
    const d = new Date(currentTime);
    const pair = Math.floor(d.getUTCMonth() / 2) * 2;
    const open = new Date(Date.UTC(d.getUTCFullYear(), pair, 1));
    const close = new Date(Date.UTC(d.getUTCFullYear(), pair + 2, 1));
    return { open, close };
  }
  if (timeframe === '6M') {
    const d = new Date(currentTime);
    const half = d.getUTCMonth() < 6 ? 0 : 6;
    const open = new Date(Date.UTC(d.getUTCFullYear(), half, 1));
    const close = new Date(Date.UTC(d.getUTCFullYear(), half + 6, 1));
    return { open, close };
  }
  if (timeframe === '1Y') {
    const d = new Date(currentTime);
    const open = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const close = new Date(Date.UTC(d.getUTCFullYear() + 1, 0, 1));
    return { open, close };
  }
  if (timeframe === '2Y') {
    const d = new Date(currentTime);
    const base = Math.floor(d.getUTCFullYear() / 2) * 2;
    const open = new Date(Date.UTC(base, 0, 1));
    const close = new Date(Date.UTC(base + 2, 0, 1));
    return { open, close };
  }
  if (timeframe === '4Y') {
    const d = new Date(currentTime);
    const base = Math.floor(d.getUTCFullYear() / 4) * 4;
    const open = new Date(Date.UTC(base, 0, 1));
    const close = new Date(Date.UTC(base + 4, 0, 1));
    return { open, close };
  }
  if (timeframe === '5Y') {
    const d = new Date(currentTime);
    const base = Math.floor(d.getUTCFullYear() / 5) * 5;
    const open = new Date(Date.UTC(base, 0, 1));
    const close = new Date(Date.UTC(base + 5, 0, 1));
    return { open, close };
  }

  // Fallback: treat as 1D
  const open = Math.floor(t / MS_DAY) * MS_DAY;
  return { open: new Date(open), close: new Date(open + MS_DAY) };
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type DecompressionStatus = 
  | 'COMPRESSION'      // Too early, still in compression phase
  | 'PRE_WINDOW'       // Approaching decompression window
  | 'ACTIVE'           // In decompression window - HIGH PROBABILITY
  | 'POST_WINDOW'      // Past decompression window
  | 'TAGGED';          // Midpoint already reached

export interface DecompressionState {
  timeframe: string;
  status: DecompressionStatus;
  minutesIntoCandle: number;
  minutesUntilClose: number;
  minutesUntilWindowStart: number | null;
  minutesUntilWindowEnd: number | null;
  isInWindow: boolean;
  windowProgress: number; // 0-100%
  visualIndicator: string; // For UI
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMING CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calculate decompression state for the CURRENT live candle of a given timeframe.
 * Always measured before candle close — all timeframes.
 */
export function calculateDecompressionState(
  timeframe: string,
  candleOpenTime: Date,
  candleCloseTime: Date,
  currentTime: Date = new Date(),
  midpointTagged: boolean = false
): DecompressionState {
  const win = DECOMPRESSION_WINDOWS[timeframe];
  
  if (!win) {
    return {
      timeframe,
      status: 'COMPRESSION',
      minutesIntoCandle: 0,
      minutesUntilClose: 0,
      minutesUntilWindowStart: null,
      minutesUntilWindowEnd: null,
      isInWindow: false,
      windowProgress: 0,
      visualIndicator: '⚪',
    };
  }
  
  const minutesIntoCandle = (currentTime.getTime() - candleOpenTime.getTime()) / 60_000;
  const minutesUntilClose = (candleCloseTime.getTime() - currentTime.getTime()) / 60_000;
  
  // If midpoint already tagged, mark as TAGGED
  if (midpointTagged) {
    return {
      timeframe,
      status: 'TAGGED',
      minutesIntoCandle,
      minutesUntilClose,
      minutesUntilWindowStart: null,
      minutesUntilWindowEnd: null,
      isInWindow: false,
      windowProgress: 100,
      visualIndicator: '⚪',
    };
  }
  
  // All windows: measured BEFORE CLOSE
  // windowStart = outer edge (further from close), windowEnd = inner edge (closer to close)
  // Window is ACTIVE when:  windowEnd <= minutesUntilClose <= windowStart
  const { windowStart, windowEnd } = win;
  
  // How long until we enter the window (positive = still waiting)
  const minutesUntilWindowStart = minutesUntilClose - windowStart;
  // How long until window ends (positive = still in or before window)
  const minutesUntilWindowEnd = minutesUntilClose - windowEnd;
  
  let isInWindow = false;
  let status: DecompressionStatus = 'COMPRESSION';
  
  if (minutesUntilClose <= windowStart && minutesUntilClose >= windowEnd) {
    // Inside the window
    isInWindow = true;
    status = 'ACTIVE';
  } else if (minutesUntilClose > windowStart) {
    // Still in compression — window hasn't started yet
    // PRE_WINDOW if approaching (within 3 min for intraday, 2 hrs for daily+)
    const preThreshold = windowStart <= 20 ? 3 : 120; // 3 min for ≤8H, 2 hrs for daily+
    if (minutesUntilWindowStart <= preThreshold) {
      status = 'PRE_WINDOW';
    } else {
      status = 'COMPRESSION';
    }
  } else {
    // Past the window (minutesUntilClose < windowEnd)
    status = 'POST_WINDOW';
  }
  
  // Window progress (0-100%)
  const windowDuration = windowStart - windowEnd;
  let windowProgress = 0;
  if (minutesUntilClose > windowStart) {
    windowProgress = 0; // Before window
  } else if (minutesUntilClose < windowEnd) {
    windowProgress = 100; // Past window
  } else if (windowDuration > 0) {
    windowProgress = ((windowStart - minutesUntilClose) / windowDuration) * 100;
  }
  
  // Visual indicator
  let visualIndicator = '⚪';
  if (status === 'ACTIVE') {
    visualIndicator = '🟢';
  } else if (status === 'PRE_WINDOW') {
    visualIndicator = '🟡';
  } else if (status === 'POST_WINDOW') {
    visualIndicator = '🔴';
  }
  
  return {
    timeframe,
    status,
    minutesIntoCandle,
    minutesUntilClose,
    minutesUntilWindowStart: minutesUntilWindowStart > 0 ? minutesUntilWindowStart : null,
    minutesUntilWindowEnd: minutesUntilWindowEnd > 0 ? minutesUntilWindowEnd : null,
    isInWindow,
    windowProgress: Math.max(0, Math.min(100, windowProgress)),
    visualIndicator,
  };
}

/**
 * Format time remaining for display
 */
export function formatTimeRemaining(minutes: number | null): string {
  if (minutes === null) return 'N/A';
  
  if (minutes < 0) {
    return 'PASSED';
  } else if (minutes < 1) {
    return '<1m';
  } else if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  } else {
    const days = Math.floor(minutes / 1440);
    const hours = Math.round((minutes % 1440) / 60);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
}

/**
 * Generate progress bar for UI
 */
export function generateProgressBar(progress: number, width: number = 10): string {
  const filled = Math.round((progress / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

/**
 * Check if decompression window is active for any timeframe
 */
export function hasActiveDecompression(states: DecompressionState[]): boolean {
  return states.some(s => s.status === 'ACTIVE');
}

/**
 * Count active decompression windows
 */
export function countActiveWindows(states: DecompressionState[]): number {
  return states.filter(s => s.status === 'ACTIVE').length;
}

/**
 * Get next decompression window timing
 */
export function getNextWindowTiming(state: DecompressionState): string {
  if (state.status === 'ACTIVE') {
    return 'ACTIVE NOW';
  } else if (state.status === 'PRE_WINDOW' && state.minutesUntilWindowStart !== null) {
    return `in ${formatTimeRemaining(state.minutesUntilWindowStart)}`;
  } else if (state.status === 'COMPRESSION' && state.minutesUntilWindowStart !== null) {
    return `in ${formatTimeRemaining(state.minutesUntilWindowStart)}`;
  } else if (state.status === 'TAGGED') {
    return 'TAGGED';
  } else {
    return 'PASSED';
  }
}

/**
 * Example usage — uses CURRENT candle boundaries
 */
export function exampleDecompressionTiming() {
  const now = new Date();
  const { open, close } = getCurrentCandleBoundaries('1H', now);
  
  const state1H = calculateDecompressionState('1H', open, close, now, false);
  
  console.log('=== DECOMPRESSION TIMING EXAMPLE ===');
  console.log(`Timeframe: ${state1H.timeframe}`);
  console.log(`Current 1H candle: ${open.toISOString()} → ${close.toISOString()}`);
  console.log(`Status: ${state1H.status} ${state1H.visualIndicator}`);
  console.log(`Minutes until close: ${state1H.minutesUntilClose.toFixed(1)}`);
  console.log(`Window progress: ${generateProgressBar(state1H.windowProgress)} ${state1H.windowProgress.toFixed(0)}%`);
  console.log(`Next window: ${getNextWindowTiming(state1H)}`);
  
  return state1H;
}
