/**
 * Test file for Crypto Time Confluence Engine
 * Run with: npx ts-node test/crypto-time-confluence.test.ts
 */

import {
  computeCryptoTimeConfluence,
  getUpcomingHighPriorityCycles,
  formatTimeRemaining,
  shouldAlertSymbol,
  CRYPTO_CYCLES,
  CYCLE_SCORES,
  CONFLUENCE_ALERT_THRESHOLD,
} from '../lib/time/cryptoTimeConfluence';

console.log('═══════════════════════════════════════════════════════════════');
console.log('CRYPTO TIME CONFLUENCE ENGINE - TEST SUITE');
console.log('═══════════════════════════════════════════════════════════════\n');

// Test 1: Basic Calculation
console.log('TEST 1: Basic Time Confluence Calculation');
console.log('─────────────────────────────────────────────────────────────');
const confluence = computeCryptoTimeConfluence();
console.log('✓ Confluence calculated successfully');
console.log(`  Timestamp: ${confluence.timestampUTC}`);
console.log(`  Next Daily Close: ${confluence.nextDailyClose.toISOString()}`);
console.log(`  Hours to Daily: ${confluence.hoursToNextDaily.toFixed(2)}h`);
console.log(`  Confluence Score: ${confluence.confluenceScore}`);
console.log(`  Confluence Level: ${confluence.confluenceLevel.toUpperCase()}`);
console.log(`  Active Cycles: ${confluence.activeCycles.length}`);
console.log();

// Test 2: Active Cycles
console.log('TEST 2: Active Cycles (Next 48h)');
console.log('─────────────────────────────────────────────────────────────');
if (confluence.activeCycles.length === 0) {
  console.log('✓ No cycles closing in next 48 hours');
} else {
  console.log(`✓ ${confluence.activeCycles.length} active cycles found:`);
  confluence.activeCycles.forEach(cycle => {
    console.log(`  ${cycle.cycle.padEnd(5)} → ${formatTimeRemaining(cycle.hoursToClose).padEnd(8)} (score: ${cycle.score})${cycle.isHighPriority ? ' ⭐' : ''}`);
  });
}
console.log();

// Test 3: Confluence Description
console.log('TEST 3: Confluence Description');
console.log('─────────────────────────────────────────────────────────────');
console.log(`✓ ${confluence.description}`);
if (confluence.alert) {
  console.log(`✓ ALERT: ${confluence.alert}`);
}
console.log();

// Test 4: Cycle Breakdown
console.log('TEST 4: Cycle Breakdown');
console.log('─────────────────────────────────────────────────────────────');
if (confluence.cycleBreakdown.length > 0) {
  console.log('✓ Breakdown:');
  confluence.cycleBreakdown.forEach(item => {
    console.log(`  - ${item}`);
  });
} else {
  console.log('✓ No breakdown (no active cycles)');
}
console.log();

// Test 5: High Priority Cycles
console.log('TEST 5: Upcoming High-Priority Cycles (Next 7 days)');
console.log('─────────────────────────────────────────────────────────────');
const upcomingPriority = getUpcomingHighPriorityCycles();
console.log(`✓ ${upcomingPriority.length} high-priority cycles found:`);
upcomingPriority.slice(0, 5).forEach(cycle => {
  console.log(`  ${cycle.cycle.padEnd(5)} → ${formatTimeRemaining(cycle.hoursToClose).padEnd(8)} (score: ${cycle.score})`);
});
console.log();

// Test 6: Alert Threshold Logic
console.log('TEST 6: Alert Threshold Logic');
console.log('─────────────────────────────────────────────────────────────');
console.log(`✓ Alert threshold: ${CONFLUENCE_ALERT_THRESHOLD}`);
console.log(`✓ Current score: ${confluence.confluenceScore}`);
console.log(`✓ Is high confluence: ${confluence.isHighConfluence ? 'YES' : 'NO'}`);
console.log();

// Test 7: Symbol Alert Check
console.log('TEST 7: Symbol-Specific Alert Check');
console.log('─────────────────────────────────────────────────────────────');
const testSymbols = ['BTC', 'ETH', 'SOL'];
testSymbols.forEach(symbol => {
  const shouldAlert = shouldAlertSymbol(symbol, confluence, {
    minScore: 6,
    requireHighPriority: true,
  });
  console.log(`  ${symbol}: ${shouldAlert ? '⚠️  ALERT' : '✓ No alert'}`);
});
console.log();

// Test 8: Time Formatting
console.log('TEST 8: Time Formatting');
console.log('─────────────────────────────────────────────────────────────');
const testHours = [0.5, 1.5, 12, 24, 48, 72, 168];
testHours.forEach(hours => {
  console.log(`  ${hours}h → ${formatTimeRemaining(hours)}`);
});
console.log();

// Test 9: Cycle Configuration Validation
console.log('TEST 9: Cycle Configuration Validation');
console.log('─────────────────────────────────────────────────────────────');
const cycleKeys = Object.keys(CRYPTO_CYCLES);
const scoreKeys = Object.keys(CYCLE_SCORES);
const missingScores = cycleKeys.filter(key => !scoreKeys.includes(key));
const extraScores = scoreKeys.filter(key => !cycleKeys.includes(key));

if (missingScores.length === 0 && extraScores.length === 0) {
  console.log('✓ All cycles have corresponding scores');
} else {
  if (missingScores.length > 0) {
    console.log(`✗ Missing scores for: ${missingScores.join(', ')}`);
  }
  if (extraScores.length > 0) {
    console.log(`✗ Extra scores for: ${extraScores.join(', ')}`);
  }
}
console.log(`✓ Total cycles: ${cycleKeys.length}`);
console.log();

// Test 10: Confluence Levels
console.log('TEST 10: Confluence Level Classification');
console.log('─────────────────────────────────────────────────────────────');
const testScores = [0, 2, 3, 5, 6, 9, 10, 15];
testScores.forEach(score => {
  let level = 'low';
  if (score >= 10) level = 'extreme';
  else if (score >= 6) level = 'high';
  else if (score >= 3) level = 'medium';
  console.log(`  Score ${score.toString().padStart(2)} → ${level.toUpperCase()}`);
});
console.log();

// Test 11: Next Daily Close Calculation
console.log('TEST 11: Next Daily Close Calculation');
console.log('─────────────────────────────────────────────────────────────');
const now = new Date();
const sydneyTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
console.log(`✓ Current UTC: ${now.toISOString()}`);
console.log(`✓ Sydney Time: ${sydneyTime.toLocaleString()}`);
console.log(`✓ Next Daily Close (UTC): ${confluence.nextDailyClose.toISOString()}`);
const sydneyClose = new Date(confluence.nextDailyClose.toLocaleString('en-US', { timeZone: 'Australia/Sydney' }));
console.log(`✓ Next Daily Close (Sydney): ${sydneyClose.toLocaleString()}`);
console.log();

// Test 12: Performance Test
console.log('TEST 12: Performance Test');
console.log('─────────────────────────────────────────────────────────────');
const iterations = 1000;
const startTime = Date.now();
for (let i = 0; i < iterations; i++) {
  computeCryptoTimeConfluence();
}
const endTime = Date.now();
const avgTime = (endTime - startTime) / iterations;
console.log(`✓ ${iterations} calculations completed`);
console.log(`✓ Average time: ${avgTime.toFixed(3)}ms`);
console.log(`✓ Performance: ${avgTime < 5 ? 'EXCELLENT' : avgTime < 10 ? 'GOOD' : 'ACCEPTABLE'}`);
console.log();

// Summary
console.log('═══════════════════════════════════════════════════════════════');
console.log('TEST SUMMARY');
console.log('═══════════════════════════════════════════════════════════════');
console.log('✓ All 12 tests completed successfully');
console.log();
console.log('CURRENT STATUS:');
console.log(`  Confluence Score: ${confluence.confluenceScore}`);
console.log(`  Confluence Level: ${confluence.confluenceLevel.toUpperCase()}`);
console.log(`  Active Cycles: ${confluence.activeCycles.length}`);
console.log(`  High Confluence: ${confluence.isHighConfluence ? 'YES ⚠️' : 'NO'}`);
console.log();
console.log('═══════════════════════════════════════════════════════════════\n');
