/**
 * Decompression Timing Engine
 * 
 * Based on your handwritten Time → 50% decompression timing model.
 * 
 * This tells traders WHEN a move to the midpoint is likely to happen,
 * preventing early entries during the compression phase.
 * 
 * Timing Windows (from your sheet):
 * - 1H:  7–9 min from open
 * - 4H:  9–12 min from open
 * - 6H:  15–20 min from open
 * - 8H:  15–20 min from open
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
 */

// ═══════════════════════════════════════════════════════════════════════════
// DECOMPRESSION TIMING WINDOWS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Decompression window definition
 * startMin/startMax: When decompression window BEGINS (minutes from open or before close)
 * fromOpen: true = measure from candle open, false = measure before candle close
 */
interface DecompressionWindow {
  timeframe: string;
  startMin: number;  // Minimum time (minutes)
  startMax: number;  // Maximum time (minutes)
  fromOpen: boolean; // true = from open, false = before close
}

/**
 * Complete decompression timing map
 */
export const DECOMPRESSION_WINDOWS: Record<string, DecompressionWindow> = {
  // Intraday (from candle open)
  '1H': { timeframe: '1H', startMin: 7, startMax: 9, fromOpen: true },
  '2H': { timeframe: '2H', startMin: 8, startMax: 11, fromOpen: true },
  '3H': { timeframe: '3H', startMin: 8, startMax: 12, fromOpen: true },
  '4H': { timeframe: '4H', startMin: 9, startMax: 12, fromOpen: true },
  '6H': { timeframe: '6H', startMin: 15, startMax: 20, fromOpen: true },
  '8H': { timeframe: '8H', startMin: 15, startMax: 20, fromOpen: true },
  
  // Daily+ (before candle close)
  '1D': { timeframe: '1D', startMin: 60, startMax: 60, fromOpen: false },      // 1 hr before close
  '2D': { timeframe: '2D', startMin: 120, startMax: 120, fromOpen: false },    // 2 hrs before close
  '3D': { timeframe: '3D', startMin: 180, startMax: 180, fromOpen: false },    // 3 hrs before close
  '4D': { timeframe: '4D', startMin: 240, startMax: 240, fromOpen: false },    // 4 hrs before close
  '5D': { timeframe: '5D', startMin: 312, startMax: 312, fromOpen: false },    // 5.2 hrs before close
  '1W': { timeframe: '1W', startMin: 390, startMax: 390, fromOpen: false },    // 6.5 hrs before close
  '2W': { timeframe: '2W', startMin: 780, startMax: 780, fromOpen: false },    // 13 hrs before close
  '1M': { timeframe: '1M', startMin: 1560, startMax: 1560, fromOpen: false },  // 26 hrs before close
  '2M': { timeframe: '2M', startMin: 3120, startMax: 3120, fromOpen: false },  // 52 hrs before close
  '6M': { timeframe: '6M', startMin: 9360, startMax: 9360, fromOpen: false },  // 6.5 days before close
  '1Y': { timeframe: '1Y', startMin: 18720, startMax: 18720, fromOpen: false }, // 13 days before close
  '2Y': { timeframe: '2Y', startMin: 37440, startMax: 37440, fromOpen: false }, // 26 days before close
  '4Y': { timeframe: '4Y', startMin: 74880, startMax: 74880, fromOpen: false }, // 52 days before close
  '5Y': { timeframe: '5Y', startMin: 149760, startMax: 149760, fromOpen: false }, // 104 days before close
};

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
 * Calculate decompression state for a given timeframe
 */
export function calculateDecompressionState(
  timeframe: string,
  candleOpenTime: Date,
  candleCloseTime: Date,
  currentTime: Date = new Date(),
  midpointTagged: boolean = false
): DecompressionState {
  const window = DECOMPRESSION_WINDOWS[timeframe];
  
  if (!window) {
    // Unknown timeframe, return neutral state
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
  
  // If midpoint already tagged, mark as TAGGED
  if (midpointTagged) {
    return {
      timeframe,
      status: 'TAGGED',
      minutesIntoCandle: (currentTime.getTime() - candleOpenTime.getTime()) / (1000 * 60),
      minutesUntilClose: (candleCloseTime.getTime() - currentTime.getTime()) / (1000 * 60),
      minutesUntilWindowStart: null,
      minutesUntilWindowEnd: null,
      isInWindow: false,
      windowProgress: 100,
      visualIndicator: '⚪',
    };
  }
  
  const msIntoCandle = currentTime.getTime() - candleOpenTime.getTime();
  const msUntilClose = candleCloseTime.getTime() - currentTime.getTime();
  const minutesIntoCandle = msIntoCandle / (1000 * 60);
  const minutesUntilClose = msUntilClose / (1000 * 60);
  
  let minutesUntilWindowStart: number | null = null;
  let minutesUntilWindowEnd: number | null = null;
  let isInWindow = false;
  let status: DecompressionStatus = 'COMPRESSION';
  
  if (window.fromOpen) {
    // Window measured from candle open (intraday timeframes)
    const windowStartTime = window.startMin;
    const windowEndTime = window.startMax;
    
    minutesUntilWindowStart = windowStartTime - minutesIntoCandle;
    minutesUntilWindowEnd = windowEndTime - minutesIntoCandle;
    
    if (minutesIntoCandle >= windowStartTime && minutesIntoCandle <= windowEndTime) {
      isInWindow = true;
      status = 'ACTIVE';
    } else if (minutesIntoCandle < windowStartTime) {
      // Approaching window
      if (minutesUntilWindowStart <= 3) {
        status = 'PRE_WINDOW';
      } else {
        status = 'COMPRESSION';
      }
    } else {
      status = 'POST_WINDOW';
    }
  } else {
    // Window measured before candle close (daily+ timeframes)
    const windowStartBeforeClose = window.startMin;
    const windowEndBeforeClose = window.startMax * 0.8; // End slightly before
    
    minutesUntilWindowStart = minutesUntilClose - windowStartBeforeClose;
    minutesUntilWindowEnd = minutesUntilClose - windowEndBeforeClose;
    
    if (minutesUntilClose <= windowStartBeforeClose && minutesUntilClose >= windowEndBeforeClose) {
      isInWindow = true;
      status = 'ACTIVE';
    } else if (minutesUntilClose > windowStartBeforeClose) {
      // Approaching window
      const hoursUntilWindow = (minutesUntilClose - windowStartBeforeClose) / 60;
      if (hoursUntilWindow <= 2) {
        status = 'PRE_WINDOW';
      } else {
        status = 'COMPRESSION';
      }
    } else {
      status = 'POST_WINDOW';
    }
  }
  
  // Calculate window progress (0-100%)
  let windowProgress = 0;
  if (window.fromOpen) {
    const windowDuration = window.startMax - window.startMin;
    if (minutesIntoCandle < window.startMin) {
      windowProgress = 0;
    } else if (minutesIntoCandle > window.startMax) {
      windowProgress = 100;
    } else {
      windowProgress = ((minutesIntoCandle - window.startMin) / windowDuration) * 100;
    }
  } else {
    const windowDuration = window.startMin - (window.startMax * 0.8);
    if (minutesUntilClose > window.startMin) {
      windowProgress = 0;
    } else if (minutesUntilClose < window.startMax * 0.8) {
      windowProgress = 100;
    } else {
      windowProgress = ((window.startMin - minutesUntilClose) / windowDuration) * 100;
    }
  }
  
  // Visual indicator
  let visualIndicator = '⚪'; // Default (COMPRESSION)
  if (status === 'ACTIVE') {
    visualIndicator = '🟢'; // Green - active window
  } else if (status === 'PRE_WINDOW') {
    visualIndicator = '🟡'; // Yellow - approaching
  } else if (status === 'POST_WINDOW') {
    visualIndicator = '🔴'; // Red - window passed
  }
  // Note: TAGGED status is handled by early return above
  
  return {
    timeframe,
    status,
    minutesIntoCandle,
    minutesUntilClose,
    minutesUntilWindowStart,
    minutesUntilWindowEnd,
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
 * Example usage
 */
export function exampleDecompressionTiming() {
  const now = new Date();
  const candleOpen = new Date(now.getTime() - 30 * 60 * 1000); // 30 min ago
  const candleClose = new Date(now.getTime() + 30 * 60 * 1000); // 30 min from now
  
  const state1H = calculateDecompressionState('1H', candleOpen, candleClose, now, false);
  
  console.log('=== DECOMPRESSION TIMING EXAMPLE ===');
  console.log(`Timeframe: ${state1H.timeframe}`);
  console.log(`Status: ${state1H.status} ${state1H.visualIndicator}`);
  console.log(`Minutes into candle: ${state1H.minutesIntoCandle.toFixed(1)}`);
  console.log(`Window progress: ${generateProgressBar(state1H.windowProgress)} ${state1H.windowProgress.toFixed(0)}%`);
  console.log(`Next window: ${getNextWindowTiming(state1H)}`);
  
  return state1H;
}
