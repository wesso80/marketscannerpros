/**
 * Cross-Market Time Confluence Engine v1.0
 * 
 * Tracks confluence across multiple markets simultaneously:
 * 1. Crypto cycles (UTC midnight anchor, calendar days)
 * 2. Equity cycles (session close anchor, trading days)
 * 3. Options expiry cycles (monthly, quarterly, yearly OPEX)
 * 4. Economic calendar events (FOMC, NFP, CPI, etc.)
 * 
 * This is the institutional edge: detecting when multiple time cycles
 * across different markets cluster together.
 * 
 * Example High-Confluence Event:
 * - BTC 21D close
 * - SPX 21 trading day close
 * - Monthly OPEX
 * - FOMC meeting
 * → EXTREME cross-market confluence = Major market move likely
 */

import {
  computeCryptoTimeConfluence,
  type CryptoTimeConfluenceResult,
  type CryptoTimeNode,
} from './cryptoTimeConfluence';

import {
  computeEquityTimeConfluence,
  type EquityTimeConfluenceResult,
  type EquityTimeNode,
} from './equityTimeConfluence';

// ═══════════════════════════════════════════════════════════════════════════
// OPTIONS EXPIRY CALENDAR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Options expiry types and their importance scores
 */
export const OPTIONS_EXPIRY_TYPES = {
  WEEKLY: { score: 1, label: 'Weekly OPEX' },
  MONTHLY: { score: 3, label: 'Monthly OPEX' },
  QUARTERLY: { score: 5, label: 'Quarterly OPEX (OpEx)' },
  YEARLY: { score: 7, label: 'Yearly OPEX (Leaps)' },
} as const;

/**
 * Get third Friday of a given month (options expiry day)
 */
function getThirdFriday(year: number, month: number): Date {
  const date = new Date(year, month, 1);
  
  // Find first Friday
  while (date.getDay() !== 5) {
    date.setDate(date.getDate() + 1);
  }
  
  // Move to third Friday
  date.setDate(date.getDate() + 14);
  
  return date;
}

/**
 * Check if a date is an options expiry day and return type
 */
function getOptionsExpiryType(date: Date): keyof typeof OPTIONS_EXPIRY_TYPES | null {
  const thirdFriday = getThirdFriday(date.getFullYear(), date.getMonth());
  
  // Not third Friday = not an expiry
  if (date.getDate() !== thirdFriday.getDate()) {
    return null;
  }
  
  const month = date.getMonth();
  
  // Quarterly OPEX: March (2), June (5), September (8), December (11)
  if (month === 2 || month === 5 || month === 8 || month === 11) {
    // December = yearly OPEX
    if (month === 11) {
      return 'YEARLY';
    }
    return 'QUARTERLY';
  }
  
  // Monthly OPEX (end of month)
  return 'MONTHLY';
}

/**
 * Get next options expiry date and type
 */
function getNextOptionsExpiry(now: Date = new Date()): { date: Date; type: keyof typeof OPTIONS_EXPIRY_TYPES } {
  let checkDate = new Date(now);
  
  // Check current month first
  for (let i = 0; i < 12; i++) {
    const thirdFriday = getThirdFriday(checkDate.getFullYear(), checkDate.getMonth());
    
    if (thirdFriday > now) {
      const type = getOptionsExpiryType(thirdFriday);
      return {
        date: thirdFriday,
        type: type || 'MONTHLY',
      };
    }
    
    // Move to next month
    checkDate.setMonth(checkDate.getMonth() + 1);
  }
  
  // Fallback (should never reach here)
  return {
    date: getThirdFriday(now.getFullYear(), now.getMonth() + 1),
    type: 'MONTHLY',
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ECONOMIC CALENDAR EVENTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * High-impact economic events and their scores
 */
export const ECONOMIC_EVENTS = {
  FOMC: { score: 5, label: 'FOMC Meeting' },
  NFP: { score: 4, label: 'Non-Farm Payrolls' },
  CPI: { score: 4, label: 'CPI Release' },
  PPI: { score: 3, label: 'PPI Release' },
  RETAIL_SALES: { score: 3, label: 'Retail Sales' },
  GDP: { score: 4, label: 'GDP Release' },
  UNEMPLOYMENT: { score: 3, label: 'Unemployment Claims' },
} as const;

/**
 * Placeholder for economic calendar integration
 * In production, this would query a real economic calendar API
 */
function getUpcomingEconomicEvents(now: Date, daysAhead: number = 7): Array<{
  date: Date;
  type: keyof typeof ECONOMIC_EVENTS;
  hoursAway: number;
}> {
  // TODO: Integrate with actual economic calendar API
  // For now, return empty array
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-MARKET CONFLUENCE TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface CrossMarketEvent {
  type: 'crypto' | 'equity' | 'options' | 'economic';
  label: string;
  score: number;
  hoursAway: number;
  daysAway: number;
  isHighPriority: boolean;
  details: string;
}

export interface CrossMarketConfluenceResult {
  timestamp: Date;
  timestampUTC: string;
  
  // Individual market results
  crypto: CryptoTimeConfluenceResult;
  equity: EquityTimeConfluenceResult;
  
  // Options expiry
  nextOptionsExpiry: {
    date: Date;
    type: keyof typeof OPTIONS_EXPIRY_TYPES;
    label: string;
    hoursAway: number;
    score: number;
  };
  
  // Economic events
  upcomingEconomicEvents: Array<{
    date: Date;
    type: keyof typeof ECONOMIC_EVENTS;
    label: string;
    hoursAway: number;
    score: number;
  }>;
  
  // Cross-market analysis
  allEvents: CrossMarketEvent[];
  activeEvents: CrossMarketEvent[]; // Events within 48h
  totalConfluenceScore: number;
  isExtremeConfluence: boolean;
  confluenceLevel: 'low' | 'medium' | 'high' | 'extreme';
  alert: string | null;
  description: string;
  
  // Market breakdown
  cryptoContribution: number;
  equityContribution: number;
  optionsContribution: number;
  economicContribution: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN CROSS-MARKET ENGINE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute cross-market time confluence across all markets
 */
export function computeCrossMarketConfluence(now: Date = new Date()): CrossMarketConfluenceResult {
  // 1. Get individual market confluence results
  const crypto = computeCryptoTimeConfluence(now);
  const equity = computeEquityTimeConfluence(now);
  
  // 2. Get options expiry info
  const optionsExpiry = getNextOptionsExpiry(now);
  const optionsHoursAway = (optionsExpiry.date.getTime() - now.getTime()) / (1000 * 60 * 60);
  const optionsScore = OPTIONS_EXPIRY_TYPES[optionsExpiry.type].score;
  
  // 3. Get economic events
  const economicEvents = getUpcomingEconomicEvents(now, 7);
  
  // 4. Build unified event list
  const allEvents: CrossMarketEvent[] = [];
  
  // Add crypto cycles
  crypto.activeCycles.forEach(cycle => {
    allEvents.push({
      type: 'crypto',
      label: `Crypto ${cycle.cycle}`,
      score: cycle.score,
      hoursAway: cycle.hoursToClose,
      daysAway: cycle.hoursToClose / 24,
      isHighPriority: cycle.isHighPriority,
      details: `BTC/crypto ${cycle.cycle} cycle close`,
    });
  });
  
  // Add equity cycles
  equity.activeCycles.forEach(cycle => {
    allEvents.push({
      type: 'equity',
      label: `Equity ${cycle.cycle}`,
      score: cycle.score,
      hoursAway: cycle.hoursToClose,
      daysAway: cycle.tradingDaysToClose,
      isHighPriority: cycle.isHighPriority,
      details: `SPX/equity ${cycle.cycle} cycle close (${cycle.tradingDaysToClose} trading days)`,
    });
  });
  
  // Add options expiry if within 48h
  if (optionsHoursAway <= 48) {
    allEvents.push({
      type: 'options',
      label: OPTIONS_EXPIRY_TYPES[optionsExpiry.type].label,
      score: optionsScore,
      hoursAway: optionsHoursAway,
      daysAway: optionsHoursAway / 24,
      isHighPriority: optionsExpiry.type === 'QUARTERLY' || optionsExpiry.type === 'YEARLY',
      details: `${OPTIONS_EXPIRY_TYPES[optionsExpiry.type].label} - ${optionsExpiry.date.toLocaleDateString()}`,
    });
  }
  
  // Add economic events
  economicEvents.forEach(event => {
    allEvents.push({
      type: 'economic',
      label: ECONOMIC_EVENTS[event.type].label,
      score: ECONOMIC_EVENTS[event.type].score,
      hoursAway: event.hoursAway,
      daysAway: event.hoursAway / 24,
      isHighPriority: true,
      details: `${ECONOMIC_EVENTS[event.type].label} - ${event.date.toLocaleDateString()}`,
    });
  });
  
  // 5. Filter active events (within 48h)
  const activeEvents = allEvents
    .filter(e => e.hoursAway <= 48 && e.hoursAway >= 0)
    .sort((a, b) => a.hoursAway - b.hoursAway);
  
  // 6. Calculate total confluence score
  const totalConfluenceScore = activeEvents.reduce((sum, event) => sum + event.score, 0);
  
  // 7. Calculate contributions by market
  const cryptoContribution = activeEvents
    .filter(e => e.type === 'crypto')
    .reduce((sum, e) => sum + e.score, 0);
  
  const equityContribution = activeEvents
    .filter(e => e.type === 'equity')
    .reduce((sum, e) => sum + e.score, 0);
  
  const optionsContribution = activeEvents
    .filter(e => e.type === 'options')
    .reduce((sum, e) => sum + e.score, 0);
  
  const economicContribution = activeEvents
    .filter(e => e.type === 'economic')
    .reduce((sum, e) => sum + e.score, 0);
  
  // 8. Determine confluence level
  let confluenceLevel: 'low' | 'medium' | 'high' | 'extreme';
  if (totalConfluenceScore >= 15) {
    confluenceLevel = 'extreme';
  } else if (totalConfluenceScore >= 10) {
    confluenceLevel = 'high';
  } else if (totalConfluenceScore >= 5) {
    confluenceLevel = 'medium';
  } else {
    confluenceLevel = 'low';
  }
  
  const isExtremeConfluence = totalConfluenceScore >= 15;
  
  // 9. Generate alert
  let alert: string | null = null;
  if (isExtremeConfluence) {
    const markets = [];
    if (cryptoContribution > 0) markets.push('Crypto');
    if (equityContribution > 0) markets.push('Equities');
    if (optionsContribution > 0) markets.push('Options');
    if (economicContribution > 0) markets.push('Economic');
    
    alert = `🚨 EXTREME CROSS-MARKET CONFLUENCE: ${markets.join(' + ')} cycles aligning. Score: ${totalConfluenceScore}. Major market volatility expected.`;
  } else if (confluenceLevel === 'high') {
    alert = `⚠️ HIGH CROSS-MARKET CONFLUENCE: Score ${totalConfluenceScore}. Multiple markets aligning within 48h.`;
  }
  
  // 10. Generate description
  let description = '';
  if (activeEvents.length === 0) {
    description = 'No major cross-market confluence detected.';
  } else {
    const marketCount = new Set(activeEvents.map(e => e.type)).size;
    description = `${confluenceLevel.toUpperCase()} cross-market confluence: ${activeEvents.length} events across ${marketCount} markets. Score: ${totalConfluenceScore}.`;
  }
  
  return {
    timestamp: now,
    timestampUTC: now.toISOString(),
    crypto,
    equity,
    nextOptionsExpiry: {
      date: optionsExpiry.date,
      type: optionsExpiry.type,
      label: OPTIONS_EXPIRY_TYPES[optionsExpiry.type].label,
      hoursAway: optionsHoursAway,
      score: optionsScore,
    },
    upcomingEconomicEvents: economicEvents.map(e => ({
      date: e.date,
      type: e.type,
      label: ECONOMIC_EVENTS[e.type].label,
      hoursAway: e.hoursAway,
      score: ECONOMIC_EVENTS[e.type].score,
    })),
    allEvents,
    activeEvents,
    totalConfluenceScore,
    isExtremeConfluence,
    confluenceLevel,
    alert,
    description,
    cryptoContribution,
    equityContribution,
    optionsContribution,
    economicContribution,
  };
}

/**
 * Get summary of cross-market confluence for quick checks
 */
export function getCrossMarketSummary(now: Date = new Date()): {
  score: number;
  level: string;
  cryptoScore: number;
  equityScore: number;
  optionsScore: number;
  economicScore: number;
  alert: boolean;
} {
  const result = computeCrossMarketConfluence(now);
  
  return {
    score: result.totalConfluenceScore,
    level: result.confluenceLevel,
    cryptoScore: result.cryptoContribution,
    equityScore: result.equityContribution,
    optionsScore: result.optionsContribution,
    economicScore: result.economicContribution,
    alert: result.isExtremeConfluence,
  };
}

/**
 * Example usage
 */
export function exampleCrossMarketUsage() {
  const result = computeCrossMarketConfluence();
  
  console.log('═══════════════════════════════════════════');
  console.log('CROSS-MARKET TIME CONFLUENCE REPORT');
  console.log('═══════════════════════════════════════════\n');
  
  console.log(`Timestamp: ${result.timestampUTC}`);
  console.log(`Total Score: ${result.totalConfluenceScore}`);
  console.log(`Level: ${result.confluenceLevel.toUpperCase()}\n`);
  
  console.log('─── Market Breakdown ───');
  console.log(`Crypto:    ${result.cryptoContribution} (${result.crypto.confluenceScore})`);
  console.log(`Equities:  ${result.equityContribution} (${result.equity.confluenceScore})`);
  console.log(`Options:   ${result.optionsContribution}`);
  console.log(`Economic:  ${result.economicContribution}\n`);
  
  console.log('─── Active Events (48h) ───');
  if (result.activeEvents.length === 0) {
    console.log('No active events\n');
  } else {
    result.activeEvents.forEach(event => {
      console.log(`${event.label.padEnd(25)} ${event.hoursAway.toFixed(1)}h (score: ${event.score})${event.isHighPriority ? ' ⭐' : ''}`);
    });
    console.log();
  }
  
  if (result.alert) {
    console.log(result.alert);
    console.log();
  }
  
  console.log(`Description: ${result.description}`);
  console.log('\n═══════════════════════════════════════════\n');
  
  return result;
}
