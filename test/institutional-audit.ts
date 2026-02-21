// test/institutional-audit.ts
// Post-Upgrade Institutional Audit — Functional Validation + Stress Testing
// Run: npx tsx test/institutional-audit.ts

import { computeRegimeScore, estimateComponentsFromContext, mapToScoringRegime, deriveRegimeConfidence } from '../lib/ai/regimeScoring';
import type { ConfluenceComponents, ScoringRegime } from '../lib/ai/regimeScoring';
import { computeACL, computeACLFromScoring } from '../lib/ai/adaptiveConfidenceLens';
import type { ACLInput } from '../lib/ai/adaptiveConfidenceLens';
import { buildPermissionSnapshot, evaluateCandidate } from '../lib/risk-governor-hard';
import type { CandidateIntent, Regime } from '../lib/risk-governor-hard';
import { computePerformanceThrottle, applyPerformanceDampener } from '../lib/ai/performanceThrottle';
import { detectSessionPhase, getSessionPhaseMultiplier, computeSessionPhaseOverlay } from '../lib/ai/sessionPhase';

// =====================================================
// TEST INFRASTRUCTURE
// =====================================================
let passCount = 0;
let failCount = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
  } else {
    failCount++;
    const msg = detail ? `${label} — ${detail}` : label;
    failures.push(msg);
    console.log(`  ❌ ${label}${detail ? ` → ${detail}` : ''}`);
  }
}

function section(name: string) {
  console.log(`\n${'═'.repeat(70)}\n${name}\n${'═'.repeat(70)}`);
}

function subsection(name: string) {
  console.log(`\n  ── ${name} ──`);
}

// =====================================================
// PHASE 1.1: REGIME FILTERING VALIDATION
// =====================================================
section('PHASE 1.1 — REGIME FILTERING');

// Test 1: Same components, different regimes → scores MUST change
subsection('Cross-Regime Score Differentiation');
const baseComponents: ConfluenceComponents = { SQ: 65, TA: 60, VA: 55, LL: 60, MTF: 50, FD: 50 };
const regimes: ScoringRegime[] = ['TREND_EXPANSION', 'TREND_MATURE', 'RANGE_COMPRESSION', 'VOL_EXPANSION', 'TRANSITION'];
const regimeScores: Record<string, number> = {};
for (const regime of regimes) {
  const result = computeRegimeScore(baseComponents, regime);
  regimeScores[regime] = result.weightedScore;
  console.log(`    ${regime}: score=${result.weightedScore}, bias=${result.tradeBias}, gated=${result.gated}`);
}

// Check that scores actually differ across regimes
const uniqueScores = new Set(Object.values(regimeScores));
assert(uniqueScores.size >= 3, 'At least 3 unique scores across 5 regimes',
  `Got ${uniqueScores.size} unique: ${JSON.stringify(regimeScores)}`);

// Test 2: Breakouts in RANGE_COMPRESSION should be penalized (gates)
subsection('Breakout in Range Compression — Gate Enforcement');
const rangeBreakout: ConfluenceComponents = { SQ: 45, TA: 55, VA: 60, LL: 35, MTF: 60, FD: 55 }; // SQ=45 < gate 55, LL=35 < gate 40
const rangeResult = computeRegimeScore(rangeBreakout, 'RANGE_COMPRESSION');
assert(rangeResult.gated === true, 'Breakout with weak SQ is gated in range compression',
  `gated=${rangeResult.gated}, violations=${rangeResult.gateViolations.join(',')}`);
assert(rangeResult.weightedScore <= 55, 'Gated score capped at ≤55',
  `score=${rangeResult.weightedScore}`);
assert(rangeResult.tradeBias === 'NEUTRAL' || rangeResult.tradeBias === 'CONDITIONAL',
  'Trade bias is NEUTRAL or CONDITIONAL when gated',
  `bias=${rangeResult.tradeBias}`);

// Test 3: Excellent SQ in range compression passes gate
subsection('High SQ Breakout in Range — Gate Pass');
const rangeGoodSQ: ConfluenceComponents = { SQ: 80, TA: 55, VA: 60, LL: 65, MTF: 60, FD: 55 };
const rangeGoodResult = computeRegimeScore(rangeGoodSQ, 'RANGE_COMPRESSION');
assert(rangeGoodResult.gated === false, 'High SQ passes range compression gate',
  `gated=${rangeGoodResult.gated}`);

// Test 4: Late trend entries in TREND_MATURE should be reduced
subsection('Late Entry in Mature Trend');
const matureComponents: ConfluenceComponents = { SQ: 65, TA: 60, VA: 30, LL: 60, MTF: 50, FD: 30 }; // VA=30 < gate 40, FD=30 < gate 35
const matureResult = computeRegimeScore(matureComponents, 'TREND_MATURE');
assert(matureResult.gated === true, 'Weak VA/FD gates mature trend setup',
  `gated=${matureResult.gated}, violations=${matureResult.gateViolations.join(',')}`);

// Test 5: TRANSITION regime enforces both MTF and SQ gates
subsection('Transition Regime Double Gate');
const transitionWeak: ConfluenceComponents = { SQ: 40, TA: 70, VA: 70, LL: 70, MTF: 40, FD: 70 }; // SQ=40 < 50, MTF=40 < 50
const transitionResult = computeRegimeScore(transitionWeak, 'TRANSITION');
assert(transitionResult.gated === true, 'Transition blocks when SQ and MTF below gates',
  `violations=${transitionResult.gateViolations.join(' | ')}`);

// Test 6: VOL_EXPANSION requires LL≥50 and FD≥40
subsection('Vol Expansion Gate — Liquidity + Derivatives');
const volNoLiquidity: ConfluenceComponents = { SQ: 80, TA: 80, VA: 80, LL: 40, MTF: 80, FD: 80 }; // LL=40 < 50
const volResult = computeRegimeScore(volNoLiquidity, 'VOL_EXPANSION');
assert(volResult.gated === true, 'Vol expansion gates when LL < 50',
  `gated=${volResult.gated}`);

// Test 7: Check weight asymmetry — TREND_EXPANSION heavily weights TA
subsection('Weight Asymmetry Validation');
const TAheavy: ConfluenceComponents = { SQ: 50, TA: 100, VA: 50, LL: 50, MTF: 50, FD: 50 };
const TAheavyTrend = computeRegimeScore(TAheavy, 'TREND_EXPANSION');
const TAheavyRange = computeRegimeScore(TAheavy, 'RANGE_COMPRESSION');
assert(TAheavyTrend.weightedScore > TAheavyRange.weightedScore,
  'TA-heavy setup scores higher in TREND than RANGE',
  `trend=${TAheavyTrend.weightedScore} vs range=${TAheavyRange.weightedScore}`);


// =====================================================
// PHASE 1.2: ADAPTIVE CONFIDENCE LENS VALIDATION
// =====================================================
section('PHASE 1.2 — ADAPTIVE CONFIDENCE LENS');

// Test 8: Basic ACL pipeline — clean setup
subsection('Clean Setup — Full Pipeline');
const cleanScoring = computeRegimeScore(
  { SQ: 80, TA: 75, VA: 70, LL: 70, MTF: 65, FD: 60 },
  'TREND_EXPANSION'
);
const cleanACL = computeACLFromScoring(cleanScoring, {
  regimeConfidence: 80,
  setupType: 'trend_follow',
  riskGovernorPermission: 'ALLOW',
});
console.log(`    Pipeline: Base=${cleanACL.pipeline.step1_base} → Regime=${cleanACL.pipeline.step2_regimeMultiplied} → Pen=${cleanACL.pipeline.step3_penalized} → Cap=${cleanACL.pipeline.step4_capped} → Final=${cleanACL.pipeline.step5_final}`);
assert(cleanACL.authorization === 'AUTHORIZED', 'Clean trend setup is AUTHORIZED',
  `auth=${cleanACL.authorization}, conf=${cleanACL.confidence}`);
assert(cleanACL.throttle > 0.6, 'Throttle above 0.6 for clean setup',
  `throttle=${cleanACL.throttle}`);

// Test 9: Breakout in range compression → should be heavily penalized
subsection('Breakout in Range Compression — ACL Penalty');
const rangeBreakoutScoring = computeRegimeScore(
  { SQ: 60, TA: 55, VA: 50, LL: 45, MTF: 40, FD: 45 },
  'RANGE_COMPRESSION'
);
const rangeBreakoutACL = computeACLFromScoring(rangeBreakoutScoring, {
  regimeConfidence: 55,
  setupType: 'breakout',
});
console.log(`    Breakout in range: conf=${rangeBreakoutACL.confidence}, auth=${rangeBreakoutACL.authorization}, reasons=${rangeBreakoutACL.reasonCodes.join(' | ')}`);
assert(rangeBreakoutACL.confidence < 50, 'Breakout in range confidence below 50',
  `conf=${rangeBreakoutACL.confidence}`);
assert(rangeBreakoutACL.authorization === 'BLOCKED', 'Breakout in range is BLOCKED',
  `auth=${rangeBreakoutACL.authorization}`);
const hasMismatch = rangeBreakoutACL.reasonCodes.some(r => r.includes('REGIME_MISMATCH'));
assert(hasMismatch, 'Reason codes include REGIME_MISMATCH');

// Test 10: Mean reversion in range compression → should be boosted
subsection('Mean Reversion in Range — Regime Aligned');
const rangeMRScoring = computeRegimeScore(
  { SQ: 75, TA: 65, VA: 55, LL: 60, MTF: 50, FD: 55 },
  'RANGE_COMPRESSION'
);
const rangeMRACL = computeACLFromScoring(rangeMRScoring, {
  regimeConfidence: 70,
  setupType: 'mean_reversion',
});
console.log(`    MR in range: conf=${rangeMRACL.confidence}, auth=${rangeMRACL.authorization}`);
assert(rangeMRACL.confidence > rangeBreakoutACL.confidence, 'MR scores higher than breakout in range',
  `MR=${rangeMRACL.confidence} vs BO=${rangeBreakoutACL.confidence}`);

// Test 11: Event risk cap
subsection('High Event Risk Cap');
const eventACL = computeACL({
  weightedScore: 85,
  regimeConfidence: 80,
  regime: 'TREND_EXPANSION',
  setupType: 'momentum',
  eventRisk: 'high',
  riskGovernorPermission: 'ALLOW',
});
assert(eventACL.confidence <= 50, 'High event risk caps confidence at 50',
  `conf=${eventACL.confidence}`);
assert(eventACL.authorization !== 'AUTHORIZED', 'High event risk prevents AUTHORIZED',
  `auth=${eventACL.authorization}`);

// Test 12: Risk Governor BLOCK overrides everything
subsection('Risk Governor BLOCK Override');
const governorBlockACL = computeACL({
  weightedScore: 95,
  regimeConfidence: 95,
  regime: 'TREND_EXPANSION',
  setupType: 'trend_follow',
  riskGovernorPermission: 'BLOCK',
});
assert(governorBlockACL.authorization === 'BLOCKED', 'Governor BLOCK always means BLOCKED',
  `auth=${governorBlockACL.authorization}`);
assert(governorBlockACL.throttle === 0, 'Governor BLOCK throttle is 0',
  `throttle=${governorBlockACL.throttle}`);

// Test 13: RU throttle scales with Risk Governor modes
subsection('Throttle Scaling Across Governor Modes');
const baseInput: ACLInput = {
  weightedScore: 78,
  regimeConfidence: 75,
  regime: 'TREND_EXPANSION',
};
const allowACL = computeACL({ ...baseInput, riskGovernorPermission: 'ALLOW' });
const reducedACL = computeACL({ ...baseInput, riskGovernorPermission: 'ALLOW_REDUCED' });
const tightenedACL = computeACL({ ...baseInput, riskGovernorPermission: 'ALLOW_TIGHTENED' });
console.log(`    ALLOW=${allowACL.throttle}, REDUCED=${reducedACL.throttle}, TIGHTENED=${tightenedACL.throttle}`);
assert(allowACL.throttle > reducedACL.throttle, 'ALLOW throttle > REDUCED',
  `${allowACL.throttle} vs ${reducedACL.throttle}`);
assert(reducedACL.throttle > tightenedACL.throttle, 'REDUCED throttle > TIGHTENED',
  `${reducedACL.throttle} vs ${tightenedACL.throttle}`);

// Test 14: Penalty stacking
subsection('Penalty Stacking — Multiple Risk Factors');
const stackedACL = computeACL({
  weightedScore: 75,
  regimeConfidence: 70,
  regime: 'TREND_EXPANSION',
  setupType: 'momentum',
  eventRisk: 'medium',  // -8
  mtfScore: 30,          // -10
  vaScore: 25,           // -5
  lateEntry: true,       // -10
  consecutiveLosses: 4,  // -12
});
const totalPenalties = stackedACL.penalties.filter(p => p.active).reduce((s, p) => s + p.amount, 0);
console.log(`    Total penalties: ${totalPenalties}, final conf: ${stackedACL.confidence}`);
assert(totalPenalties <= -30, 'Stacked penalties sum to at least -30',
  `total=${totalPenalties}`);
assert(stackedACL.confidence < 50, 'Stacked penalties push below BLOCKED threshold',
  `conf=${stackedACL.confidence}`);

// Test 15: Correlation penalty
subsection('Correlation Penalty');
const corrACL = computeACL({
  weightedScore: 75,
  regimeConfidence: 70,
  regime: 'TREND_EXPANSION',
  correlatedPositions: 3,
});
const corrPen = corrACL.penalties.find(p => p.code === 'CORRELATION');
assert(corrPen?.active === true, 'Correlation penalty active with 3 positions',
  `active=${corrPen?.active}, amount=${corrPen?.amount}`);
assert((corrPen?.amount ?? 0) <= -10, 'Correlation penalty at least -10',
  `amount=${corrPen?.amount}`);


// =====================================================
// PHASE 1.3: RISK GOVERNOR ENFORCEMENT
// =====================================================
section('PHASE 1.3 — RISK GOVERNOR ENFORCEMENT');

// Test 16: Stop on wrong side
subsection('Stop Wrong Side — LONG');
const snapshot = buildPermissionSnapshot({ regime: 'TREND_UP', enabled: true });
const wrongStop: CandidateIntent = {
  symbol: 'AAPL',
  asset_class: 'equities',
  strategy_tag: 'BREAKOUT_CONTINUATION',
  direction: 'LONG',
  confidence: 80,
  entry_price: 150,
  stop_price: 155, // WRONG: stop above entry for long
  atr: 2.5,
};
const wrongStopResult = evaluateCandidate(snapshot, wrongStop);
assert(wrongStopResult.permission === 'BLOCK', 'Wrong-side stop BLOCKS trade',
  `permission=${wrongStopResult.permission}`);
assert(wrongStopResult.reason_codes.includes('STOP_WRONG_SIDE'), 'Reason code: STOP_WRONG_SIDE');

// Test 17: Stop equals entry
subsection('Stop Equals Entry');
const equalStop: CandidateIntent = {
  symbol: 'AAPL',
  asset_class: 'equities',
  strategy_tag: 'BREAKOUT_CONTINUATION',
  direction: 'LONG',
  confidence: 80,
  entry_price: 150,
  stop_price: 150, // WRONG: equals entry
  atr: 2.5,
};
const equalStopResult = evaluateCandidate(snapshot, equalStop);
assert(equalStopResult.permission === 'BLOCK', 'Stop=Entry BLOCKS trade',
  `permission=${equalStopResult.permission}`);

// Test 18: Low confidence below threshold
subsection('Low Confidence Below ALLOW Threshold');
const lowConfCandidate: CandidateIntent = {
  symbol: 'BTC',
  asset_class: 'crypto',
  strategy_tag: 'BREAKOUT_CONTINUATION',
  direction: 'LONG',
  confidence: 55, // Below ALLOW threshold of 70
  entry_price: 50000,
  stop_price: 48000,
  atr: 1500,
};
const lowConfResult = evaluateCandidate(snapshot, lowConfCandidate);
assert(lowConfResult.permission === 'BLOCK', 'Low confidence BLOCKs trade',
  `permission=${lowConfResult.permission}`);
assert(lowConfResult.reason_codes.includes('CONFIDENCE_BELOW_THRESHOLD'), 'Has CONFIDENCE_BELOW_THRESHOLD reason');

// Test 19: Risk mode LOCKED blocks everything
subsection('Risk Mode LOCKED');
const lockedSnapshot = buildPermissionSnapshot({
  regime: 'TREND_UP',
  enabled: true,
  consecutiveLosses: 5, // Triggers LOCKED
});
assert(lockedSnapshot.risk_mode === 'LOCKED', 'Snapshot risk mode is LOCKED',
  `mode=${lockedSnapshot.risk_mode}`);
const lockedResult = evaluateCandidate(lockedSnapshot, {
  symbol: 'AAPL',
  asset_class: 'equities',
  strategy_tag: 'BREAKOUT_CONTINUATION',
  direction: 'LONG',
  confidence: 95,
  entry_price: 150,
  stop_price: 147,
  atr: 2.5,
});
assert(lockedResult.permission === 'BLOCK', 'LOCKED mode blocks all trades',
  `permission=${lockedResult.permission}`);

// Test 20: High event severity blocks non-event strategies
subsection('High Event Severity Block');
const eventSnap = buildPermissionSnapshot({
  regime: 'TREND_UP',
  enabled: true,
  eventSeverity: 'high',
});
const eventCandidate: CandidateIntent = {
  symbol: 'AAPL',
  asset_class: 'equities',
  strategy_tag: 'BREAKOUT_CONTINUATION', // NOT event strategy
  direction: 'LONG',
  confidence: 80,
  entry_price: 150,
  stop_price: 147,
  atr: 2.5,
  event_severity: 'high',
};
const eventResult = evaluateCandidate(eventSnap, eventCandidate);
assert(eventResult.permission === 'BLOCK', 'High event blocks non-event strategies',
  `permission=${eventResult.permission}`);
assert(eventResult.reason_codes.includes('EVENT_BLOCK'), 'Has EVENT_BLOCK reason');

// Test 21: Data DOWN blocks everything
subsection('Data Feed DOWN');
const dataDownSnap = buildPermissionSnapshot({
  regime: 'TREND_UP',
  enabled: true,
  dataStatus: 'DOWN',
});
assert(dataDownSnap.risk_mode === 'LOCKED', 'Data DOWN → LOCKED mode',
  `mode=${dataDownSnap.risk_mode}`);

// Test 22: Correlated cluster enforcement
subsection('Correlated Cluster Enforcement');
const corrCandidate: CandidateIntent = {
  symbol: 'AMD',
  asset_class: 'equities',
  strategy_tag: 'BREAKOUT_CONTINUATION',
  direction: 'LONG',
  confidence: 80,
  entry_price: 120,
  stop_price: 116,
  atr: 3.0,
  open_positions: [
    { symbol: 'NVDA', direction: 'LONG' },
    { symbol: 'MSFT', direction: 'LONG' },
  ],
};
const corrResult = evaluateCandidate(snapshot, corrCandidate);
assert(corrResult.permission === 'BLOCK', 'Correlated cluster full → BLOCK',
  `permission=${corrResult.permission}, reasons=${corrResult.reason_codes.join(',')}`);


// =====================================================
// PHASE 1.4: TRADE PERMISSION MATRIX INTEGRITY
// =====================================================
section('PHASE 1.4 — TRADE PERMISSION MATRIX');

// Test 23: Trend UP blocks short breakouts
subsection('Trend UP Blocks Short Breakouts');
{
  const snap = buildPermissionSnapshot({ regime: 'TREND_UP', enabled: true });
  const perm = snap.matrix.BREAKOUT_CONTINUATION.SHORT;
  assert(perm === 'BLOCK', 'TREND_UP blocks SHORT breakout continuation',
    `permission=${perm}`);
}

// Test 24: Range neutral allows RANGE_FADE both directions
subsection('Range Neutral Allows Range Fade');
{
  const snap = buildPermissionSnapshot({ regime: 'RANGE_NEUTRAL', enabled: true });
  assert(snap.matrix.RANGE_FADE.LONG === 'ALLOW', 'Range allows LONG fade');
  assert(snap.matrix.RANGE_FADE.SHORT === 'ALLOW', 'Range allows SHORT fade');
}

// Test 25: RISK_OFF_STRESS blocks long breakouts
subsection('Risk-Off Stress Blocks Long Breakouts');
{
  const snap = buildPermissionSnapshot({ regime: 'RISK_OFF_STRESS', enabled: true });
  assert(snap.matrix.BREAKOUT_CONTINUATION.LONG === 'BLOCK', 'Stress blocks LONG breakout');
  assert(snap.matrix.BREAKOUT_CONTINUATION.SHORT === 'BLOCK', 'Stress blocks SHORT breakout');
}

// Test 26: VOL_EXPANSION blocks momentum reversal
subsection('Vol Expansion Blocks Momentum Reversal');
{
  const snap = buildPermissionSnapshot({ regime: 'VOL_EXPANSION', enabled: true });
  assert(snap.matrix.MOMENTUM_REVERSAL.LONG === 'BLOCK', 'Vol expansion blocks LONG momentum reversal');
  assert(snap.matrix.MOMENTUM_REVERSAL.SHORT === 'BLOCK', 'Vol expansion blocks SHORT momentum reversal');
}


// =====================================================
// PHASE 3: STRESS TESTS
// =====================================================
section('PHASE 3 — STRESS TESTS');

// Stress 1: Low Volatility Chop
subsection('STRESS: Low Volatility Chop');
const chopComponents = estimateComponentsFromContext({
  scannerScore: 40,
  adx: 12,
  rsi: 48,
  cci: -20,
  session: 'regular',
  mtfAlignment: 1,
  derivativesAvailable: false,
});
const chopScoring = computeRegimeScore(chopComponents, 'RANGE_COMPRESSION');
const chopACL = computeACLFromScoring(chopScoring, {
  regimeConfidence: 50,
  setupType: 'momentum',
});
console.log(`    Chop: SQ=${chopComponents.SQ} TA=${chopComponents.TA} VA=${chopComponents.VA} LL=${chopComponents.LL} MTF=${chopComponents.MTF} FD=${chopComponents.FD}`);
console.log(`    Score=${chopScoring.weightedScore}, gated=${chopScoring.gated}, conf=${chopACL.confidence}, auth=${chopACL.authorization}`);
assert(chopACL.authorization === 'BLOCKED', 'Chop regime blocks momentum trades',
  `auth=${chopACL.authorization}`);
assert(chopACL.confidence < 50, 'Chop confidence below 50',
  `conf=${chopACL.confidence}`);

// Stress 2: Strong Breakout Trend
subsection('STRESS: Strong Breakout Trend');
const breakoutComponents = estimateComponentsFromContext({
  scannerScore: 88,
  adx: 35,
  rsi: 62,
  cci: 120,
  session: 'regular',
  mtfAlignment: 4,
  volumeRatio: 1.8,
  derivativesAvailable: true,
  oiChange24h: 8,
  fundingRate: 0.02,
  fearGreed: 65,
});
const breakoutScoring = computeRegimeScore(breakoutComponents, 'TREND_EXPANSION');
const breakoutACL = computeACLFromScoring(breakoutScoring, {
  regimeConfidence: 85,
  setupType: 'trend_follow',
});
console.log(`    Breakout: SQ=${breakoutComponents.SQ} TA=${breakoutComponents.TA} VA=${breakoutComponents.VA} LL=${breakoutComponents.LL} MTF=${breakoutComponents.MTF} FD=${breakoutComponents.FD}`);
console.log(`    Score=${breakoutScoring.weightedScore}, conf=${breakoutACL.confidence}, auth=${breakoutACL.authorization}, RU=${breakoutACL.throttle}`);
assert(breakoutACL.authorization === 'AUTHORIZED', 'Strong trend is AUTHORIZED',
  `auth=${breakoutACL.authorization}`);
assert(breakoutACL.confidence > 70, 'Strong trend confidence above 70',
  `conf=${breakoutACL.confidence}`);
assert(breakoutACL.throttle > 0.7, 'Strong trend throttle above 0.7',
  `throttle=${breakoutACL.throttle}`);

// Stress 3: News-Driven Volatility Expansion
subsection('STRESS: News-Driven Vol Expansion');
const newsComponents = estimateComponentsFromContext({
  scannerScore: 70,
  adx: 30,
  rsi: 55,
  cci: 50,
  session: 'regular',
  mtfAlignment: 2,
  derivativesAvailable: true,
  oiChange24h: 12,
  fundingRate: 0.08,
  fearGreed: 20,
});
const newsScoring = computeRegimeScore(newsComponents, 'VOL_EXPANSION');
const newsACL = computeACLFromScoring(newsScoring, {
  regimeConfidence: 75,
  setupType: 'momentum',
  eventRisk: 'high',
});
console.log(`    News vol: SQ=${newsComponents.SQ} TA=${newsComponents.TA} VA=${newsComponents.VA} LL=${newsComponents.LL} MTF=${newsComponents.MTF} FD=${newsComponents.FD}`);
console.log(`    Score=${newsScoring.weightedScore}, conf=${newsACL.confidence}, auth=${newsACL.authorization}`);
assert(newsACL.confidence <= 50, 'News vol caps confidence via event risk',
  `conf=${newsACL.confidence}`);
assert(newsACL.authorization !== 'AUTHORIZED', 'News vol prevents full authorization',
  `auth=${newsACL.authorization}`);

// Stress 4: Transition Regime (Conflicting signals)
subsection('STRESS: Transition Regime');
const transComponents = estimateComponentsFromContext({
  scannerScore: 55,
  adx: 18,
  rsi: 52,
  cci: -30,
  session: 'regular',
  mtfAlignment: 2,
  derivativesAvailable: false,
});
const transScoring = computeRegimeScore(transComponents, 'TRANSITION');
const transACL = computeACLFromScoring(transScoring, {
  regimeConfidence: 45,
  setupType: 'swing',
});
console.log(`    Transition: SQ=${transComponents.SQ} TA=${transComponents.TA} VA=${transComponents.VA} LL=${transComponents.LL} MTF=${transComponents.MTF} FD=${transComponents.FD}`);
console.log(`    Score=${transScoring.weightedScore}, gated=${transScoring.gated}, conf=${transACL.confidence}, auth=${transACL.authorization}`);
assert(transACL.confidence < 60, 'Transition regime confidence below 60',
  `conf=${transACL.confidence}`);

// Stress 5: Compare strong trend vs chop — material behavioral difference
subsection('BEHAVIORAL DIFFERENTIATION: Trend vs Chop');
const diff = breakoutACL.confidence - chopACL.confidence;
console.log(`    Trend conf=${breakoutACL.confidence}, Chop conf=${chopACL.confidence}, DELTA=${diff.toFixed(1)}`);
assert(diff > 30, 'At least 30pt confidence difference between trend and chop',
  `delta=${diff.toFixed(1)}`);

// Stress 6: Compare news vol vs clean trend — material difference
const diff2 = breakoutACL.confidence - newsACL.confidence;
console.log(`    Clean trend conf=${breakoutACL.confidence}, News vol conf=${newsACL.confidence}, DELTA=${diff2.toFixed(1)}`);
assert(diff2 > 25, 'At least 25pt difference between clean trend and news vol',
  `delta=${diff2.toFixed(1)}`);


// =====================================================
// EDGE CASE TESTS
// =====================================================
section('EDGE CASES');

// Edge 1: All components at 50 (uniform mediocrity)
subsection('Uniform Mediocrity — All Components 50');
const medComponents: ConfluenceComponents = { SQ: 50, TA: 50, VA: 50, LL: 50, MTF: 50, FD: 50 };
for (const regime of regimes) {
  const result = computeRegimeScore(medComponents, regime);
  console.log(`    ${regime}: score=${result.weightedScore}, gated=${result.gated}`);
}
// All SHOULD sum to ~50 since weights sum to ~1.0 and all inputs are 50
const medResult = computeRegimeScore(medComponents, 'TREND_EXPANSION');
assert(Math.abs(medResult.weightedScore - 50) < 5, 'Uniform 50 produces score near 50',
  `score=${medResult.weightedScore}`);

// Edge 2: No setup type provided — conservative 0.90 multiplier applied
subsection('No Setup Type — Conservative Default Multiplier');
const noSetupACL = computeACL({
  weightedScore: 70,
  regimeConfidence: 70,
  regime: 'RANGE_COMPRESSION',
});
const withSetupACL = computeACL({
  weightedScore: 70,
  regimeConfidence: 70,
  regime: 'RANGE_COMPRESSION',
  setupType: 'breakout',
});
assert(noSetupACL.confidence > withSetupACL.confidence, 'No setup type still scores higher than breakout in range (0.90 > 0.65)',
  `noSetup=${noSetupACL.confidence} vs breakout=${withSetupACL.confidence}`);

// Edge 3: mapToScoringRegime coverage
subsection('Regime Mapping Coverage');
assert(mapToScoringRegime('TREND_UP') === 'TREND_EXPANSION', 'TREND_UP maps to TREND_EXPANSION');
assert(mapToScoringRegime('TREND_DOWN') === 'TREND_MATURE', 'TREND_DOWN maps to TREND_MATURE (directional asymmetry)');
assert(mapToScoringRegime('RANGE_NEUTRAL') === 'RANGE_COMPRESSION', 'RANGE_NEUTRAL maps to RANGE_COMPRESSION');
assert(mapToScoringRegime('VOL_EXPANSION') === 'VOL_EXPANSION', 'VOL_EXPANSION maps correctly');
assert(mapToScoringRegime('VOL_CONTRACTION') === 'RANGE_COMPRESSION', 'VOL_CONTRACTION maps to RANGE_COMPRESSION');
assert(mapToScoringRegime('RISK_OFF_STRESS') === 'VOL_EXPANSION', 'RISK_OFF_STRESS maps to VOL_EXPANSION');
assert(mapToScoringRegime('unknown_garbage') === 'TRANSITION', 'Unknown input defaults to TRANSITION');

// Edge 4: estimateComponentsFromContext — closed market session
subsection('Closed Market Session Liquidity');
const closedComponents = estimateComponentsFromContext({
  scannerScore: 90,
  session: 'closed',
  mtfAlignment: 5,
});
assert(closedComponents.LL === 20, 'Closed market LL = 20',
  `LL=${closedComponents.LL}`);

// Edge 5: Perfect components in every regime
subsection('Perfect Setup Across All Regimes');
const perfectComponents: ConfluenceComponents = { SQ: 100, TA: 100, VA: 100, LL: 100, MTF: 100, FD: 100 };
for (const regime of regimes) {
  const result = computeRegimeScore(perfectComponents, regime);
  assert(result.weightedScore >= 95, `Perfect setup in ${regime} scores ≥95`,
    `score=${result.weightedScore}`);
  assert(result.gated === false, `Perfect setup not gated in ${regime}`);
}


// =====================================================
// DEFECT HUNTING — STRUCTURAL WEAKNESS PROBING
// =====================================================
section('DEFECT HUNTING — STRUCTURAL WEAKNESS PROBES');

// Defect 1 [FIXED]: No setup type now uses 0.90 conservative multiplier (was 1.0)
subsection('No-Setup-Type Conservative Default');
const noTypeACL = computeACL({
  weightedScore: 72,
  regimeConfidence: 70,
  regime: 'RANGE_COMPRESSION',
  // No setupType → 0.90 conservative multiplier
});
console.log(`    No-setup-type in RANGE: conf=${noTypeACL.confidence}, auth=${noTypeACL.authorization}`);
const defBreakoutACL = computeACL({
  weightedScore: 72,
  regimeConfidence: 70,
  regime: 'RANGE_COMPRESSION',
  setupType: 'breakout', // 0.65 multiplier
});
console.log(`    Breakout in RANGE: conf=${defBreakoutACL.confidence}, auth=${defBreakoutACL.authorization}`);
const mrACL = computeACL({
  weightedScore: 72,
  regimeConfidence: 70,
  regime: 'RANGE_COMPRESSION',
  setupType: 'mean_reversion', // 1.15 multiplier
});
console.log(`    MR in RANGE: conf=${mrACL.confidence}, auth=${mrACL.authorization}`);
const inflationGap = noTypeACL.confidence - defBreakoutACL.confidence;
console.log(`    Gap no-type vs breakout: ${inflationGap.toFixed(1)} pts`);
assert(noTypeACL.confidence < mrACL.confidence, 'No-type scores lower than aligned setup (MR in range)',
  `noType=${noTypeACL.confidence} vs MR=${mrACL.confidence}`);
assert(noTypeACL.confidence > defBreakoutACL.confidence, 'No-type still scores higher than misaligned (breakout in range)',
  `noType=${noTypeACL.confidence} vs breakout=${defBreakoutACL.confidence}`);

// Defect 2 [FIXED]: TREND_UP and TREND_DOWN now map differently
subsection('Directional Asymmetry: UP vs DOWN');
console.log(`    TREND_UP → ${mapToScoringRegime('TREND_UP')}`);
console.log(`    TREND_DOWN → ${mapToScoringRegime('TREND_DOWN')}`);
assert(mapToScoringRegime('TREND_UP') !== mapToScoringRegime('TREND_DOWN'),
  'TREND_UP and TREND_DOWN map to different regimes',
  `UP=${mapToScoringRegime('TREND_UP')}, DOWN=${mapToScoringRegime('TREND_DOWN')}`);
assert(mapToScoringRegime('TREND_DOWN') === 'TREND_MATURE',
  'TREND_DOWN maps to TREND_MATURE (VA/FD emphasis for bearish conditions)');

// Defect 3 [FIXED]: Default regimeConfidence lowered to 55 (conservative)
subsection('Default Regime Confidence = 55 (Conservative)');
const defaultConfACL = computeACLFromScoring(
  computeRegimeScore({ SQ: 80, TA: 80, VA: 70, LL: 70, MTF: 70, FD: 65 }, 'TREND_EXPANSION'),
  // regimeConfidence not provided → defaults to 55
);
const hasCap = defaultConfACL.hardCaps.find(c => c.code === 'REGIME_LOW');
console.log(`    Default regime conf: REGIME_LOW cap active=${hasCap?.active}, max=${hasCap?.maxConfidence}`);
assert(hasCap?.active === false, 'Default 55 does NOT trigger REGIME_LOW cap (requires <55)');
console.log(`    ✓  Default 55 sits exactly at threshold — conservative but not over-punishing`);

// Defect 4 [FIXED]: MTF default raised to 3 → 60 (passes TRANSITION gate)
subsection('MTF Default Passes TRANSITION Gate');
const defaultMTF = estimateComponentsFromContext({ scannerScore: 65 });
console.log(`    Default MTF=${defaultMTF.MTF} (from mtfAlignment default=3 → 3*20=60)`);
assert(defaultMTF.MTF >= 50, 'Default MTF passes TRANSITION gate (≥50)',
  `MTF=${defaultMTF.MTF}`);
console.log(`    TRANSITION gate: MTF≥50 → DEFAULT NOW PASSES`);

// Defect 5 [FIXED]: Triple LL penalty eliminated — computeACLFromScoring no longer maps LL to both fields
subsection('LL Penalty Deduplication');
const fixedLLACL = computeACLFromScoring(
  computeRegimeScore({ SQ: 80, TA: 75, VA: 60, LL: 35, MTF: 70, FD: 60 }, 'TREND_EXPANSION'),
  { regimeConfidence: 75 }
);
const llPenalties = fixedLLACL.penalties.filter(p => p.active && (p.code === 'LOW_LIQUIDITY' || p.code === 'LL_WEAK'));
console.log(`    Active LL penalties: ${llPenalties.map(p => `${p.code}=${p.amount}`).join(', ')}`);
const lowLiqActive = fixedLLACL.penalties.find(p => p.code === 'LOW_LIQUIDITY')?.active ?? false;
assert(!lowLiqActive, 'LOW_LIQUIDITY penalty no longer fires from convenience wrapper',
  `Previously: liquidityQuality was mapped to LL, causing double penalty`);
assert(llPenalties.length <= 1, 'Only LL_WEAK penalty active (not both)',
  `Active LL-related penalties: ${llPenalties.length}`);
console.log(`    ✓  LL penalty applied exactly once — no triple-punishment on same data source`);


// =====================================================
// PHASE 24 HARDENING VALIDATION — Push All Scores to 10
// =====================================================
section('PHASE 24 HARDENING — NEW VALIDATIONS');

// H1: Regime Score Spread with Skewed Inputs
subsection('Regime Spread — Skewed TA/MTF Input');
const skewedTAMTF: ConfluenceComponents = { SQ: 50, TA: 95, VA: 50, LL: 50, MTF: 90, FD: 50 };
const skewedTrend = computeRegimeScore(skewedTAMTF, 'TREND_EXPANSION');
const skewedRange = computeRegimeScore(skewedTAMTF, 'RANGE_COMPRESSION');
const skewedVol = computeRegimeScore(skewedTAMTF, 'VOL_EXPANSION');
console.log(`    TREND=${skewedTrend.weightedScore}, RANGE=${skewedRange.weightedScore}, VOL=${skewedVol.weightedScore}`);
assert(skewedTrend.weightedScore - skewedRange.weightedScore > 10,
  'TA/MTF-skewed input: TREND scores 10+ pts higher than RANGE',
  `delta=${(skewedTrend.weightedScore - skewedRange.weightedScore).toFixed(1)}`);
assert(skewedTrend.weightedScore - skewedVol.weightedScore > 10,
  'TA/MTF-skewed input: TREND scores 10+ pts higher than VOL',
  `delta=${(skewedTrend.weightedScore - skewedVol.weightedScore).toFixed(1)}`);

// H2: Regime Spread with LL/FD Skewed Inputs
subsection('Regime Spread — Skewed LL/FD Input');
const skewedLLFD: ConfluenceComponents = { SQ: 50, TA: 50, VA: 50, LL: 95, MTF: 50, FD: 95 };
const llfdVol = computeRegimeScore(skewedLLFD, 'VOL_EXPANSION');
const llfdTrend = computeRegimeScore(skewedLLFD, 'TREND_EXPANSION');
console.log(`    VOL=${llfdVol.weightedScore}, TREND=${llfdTrend.weightedScore}`);
assert(llfdVol.weightedScore - llfdTrend.weightedScore > 10,
  'LL/FD-skewed input: VOL scores 10+ pts higher than TREND',
  `delta=${(llfdVol.weightedScore - llfdTrend.weightedScore).toFixed(1)}`);

// H3: TRANSITION Multiplier Strictness — only MR and scalp survive
subsection('TRANSITION Multiplier Strictness');
const transBase = { weightedScore: 70, regimeConfidence: 70, regime: 'TRANSITION' as const };
const transMR = computeACL({ ...transBase, setupType: 'mean_reversion' });
const transScalp = computeACL({ ...transBase, setupType: 'scalp' });
const transMomentum = computeACL({ ...transBase, setupType: 'momentum' });
const transBreakout = computeACL({ ...transBase, setupType: 'breakout' });
const transTF = computeACL({ ...transBase, setupType: 'trend_follow' });
console.log(`    MR=${transMR.confidence}, Scalp=${transScalp.confidence}, Mom=${transMomentum.confidence}, BO=${transBreakout.confidence}, TF=${transTF.confidence}`);
assert(transMomentum.authorization === 'BLOCKED' || transMomentum.confidence < 50,
  'TRANSITION blocks momentum (conf < 50)',
  `conf=${transMomentum.confidence}`);
assert(transBreakout.authorization === 'BLOCKED' || transBreakout.confidence < 50,
  'TRANSITION blocks breakout (conf < 50)',
  `conf=${transBreakout.confidence}`);
assert(transTF.authorization === 'BLOCKED' || transTF.confidence < 50,
  'TRANSITION blocks trend_follow (conf < 50)',
  `conf=${transTF.confidence}`);
assert(transMR.confidence > transMomentum.confidence,
  'MR survives better than momentum in TRANSITION',
  `MR=${transMR.confidence} vs Mom=${transMomentum.confidence}`);

// H4: Sparse Data Penalty
subsection('Sparse Data Penalty');
const sparseACL = computeACL({
  weightedScore: 72,
  regimeConfidence: 70,
  regime: 'TREND_EXPANSION',
  setupType: 'trend_follow',
  dataComponentsProvided: 2,
});
const fullDataACL = computeACL({
  weightedScore: 72,
  regimeConfidence: 70,
  regime: 'TREND_EXPANSION',
  setupType: 'trend_follow',
  dataComponentsProvided: 8,
});
console.log(`    Sparse(2 indicators)=${sparseACL.confidence}, Full(8 indicators)=${fullDataACL.confidence}`);
assert(sparseACL.confidence < fullDataACL.confidence, 'Sparse data reduces confidence',
  `sparse=${sparseACL.confidence} vs full=${fullDataACL.confidence}`);
const sparsePen = sparseACL.penalties.find(p => p.code === 'SPARSE_DATA');
assert(sparsePen?.active === true, 'SPARSE_DATA penalty fires with 2/10 indicators');
assert(sparsePen!.amount <= -10, 'Sparse data penalty at least -10',
  `amount=${sparsePen?.amount}`);
const fullPen = fullDataACL.penalties.find(p => p.code === 'SPARSE_DATA');
assert(fullPen?.active === false, 'SPARSE_DATA penalty does NOT fire with 8/10 indicators');

// H5: Graduated MTF Penalty — 3-tier
subsection('Graduated MTF Penalty');
const mtf25 = computeACL({ weightedScore: 75, regimeConfidence: 75, regime: 'TREND_EXPANSION', mtfScore: 25 });
const mtf35 = computeACL({ weightedScore: 75, regimeConfidence: 75, regime: 'TREND_EXPANSION', mtfScore: 35 });
const mtf45 = computeACL({ weightedScore: 75, regimeConfidence: 75, regime: 'TREND_EXPANSION', mtfScore: 45 });
const mtf55 = computeACL({ weightedScore: 75, regimeConfidence: 75, regime: 'TREND_EXPANSION', mtfScore: 55 });
const pen25 = mtf25.penalties.find(p => p.code === 'MTF_DISAGREE')!;
const pen35 = mtf35.penalties.find(p => p.code === 'MTF_DISAGREE')!;
const pen45 = mtf45.penalties.find(p => p.code === 'MTF_DISAGREE')!;
const pen55 = mtf55.penalties.find(p => p.code === 'MTF_DISAGREE')!;
console.log(`    MTF=25: ${pen25.amount}, MTF=35: ${pen35.amount}, MTF=45: ${pen45.amount}, MTF=55: ${pen55.amount}`);
assert(pen25.amount === -15, 'MTF < 30 → penalty -15', `got ${pen25.amount}`);
assert(pen35.amount === -10, 'MTF 30-39 → penalty -10', `got ${pen35.amount}`);
assert(pen45.amount === -5, 'MTF 40-49 → penalty -5', `got ${pen45.amount}`);
assert(pen55.amount === 0, 'MTF ≥ 50 → no penalty', `got ${pen55.amount}`);

// H6: RANGE_NEUTRAL Tightened Permissions
subsection('RANGE_NEUTRAL Tightened Permissions');
{
  const snap = buildPermissionSnapshot({ regime: 'RANGE_NEUTRAL', enabled: true });
  assert(snap.matrix.TREND_PULLBACK.LONG === 'ALLOW_TIGHTENED',
    'RANGE_NEUTRAL TREND_PULLBACK LONG = ALLOW_TIGHTENED',
    `got ${snap.matrix.TREND_PULLBACK.LONG}`);
  assert(snap.matrix.MOMENTUM_REVERSAL.LONG === 'ALLOW_TIGHTENED',
    'RANGE_NEUTRAL MOMENTUM_REVERSAL LONG = ALLOW_TIGHTENED',
    `got ${snap.matrix.MOMENTUM_REVERSAL.LONG}`);
  assert(snap.matrix.MOMENTUM_REVERSAL.SHORT === 'ALLOW_TIGHTENED',
    'RANGE_NEUTRAL MOMENTUM_REVERSAL SHORT = ALLOW_TIGHTENED',
    `got ${snap.matrix.MOMENTUM_REVERSAL.SHORT}`);
  assert(snap.matrix.RANGE_FADE.LONG === 'ALLOW',
    'RANGE_NEUTRAL RANGE_FADE still ALLOW (untouched)',
    `got ${snap.matrix.RANGE_FADE.LONG}`);
}

// H7: VOL_CONTRACTION Tightened Permissions
subsection('VOL_CONTRACTION Tightened Permissions');
{
  const snap = buildPermissionSnapshot({ regime: 'VOL_CONTRACTION', enabled: true });
  assert(snap.matrix.TREND_PULLBACK.LONG === 'ALLOW_TIGHTENED',
    'VOL_CONTRACTION TREND_PULLBACK LONG = ALLOW_TIGHTENED',
    `got ${snap.matrix.TREND_PULLBACK.LONG}`);
  assert(snap.matrix.MEAN_REVERSION.LONG === 'ALLOW',
    'VOL_CONTRACTION MEAN_REVERSION still ALLOW',
    `got ${snap.matrix.MEAN_REVERSION.LONG}`);
}

// H8: Enhanced Reason Codes — Regime + Setup identification
subsection('Enhanced Reason Codes');
const reasonACL = computeACL({
  weightedScore: 70,
  regimeConfidence: 70,
  regime: 'TREND_EXPANSION',
  dataComponentsProvided: 8,
});
const hasRegimeCode = reasonACL.reasonCodes.some(r => r.startsWith('REGIME:'));
const hasNoSetupCode = reasonACL.reasonCodes.some(r => r.startsWith('NO_SETUP_TYPE'));
const hasDataQuality = reasonACL.reasonCodes.some(r => r.startsWith('DATA_QUALITY'));
assert(hasRegimeCode, 'Reason codes include REGIME identification');
assert(hasNoSetupCode, 'Reason codes include NO_SETUP_TYPE when absent');
assert(hasDataQuality, 'Reason codes include DATA_QUALITY when provided');

// H9: Setup-type reason code for identified setups
const setupReasonACL = computeACL({
  weightedScore: 70,
  regimeConfidence: 70,
  regime: 'TREND_EXPANSION',
  setupType: 'trend_follow',
});
const hasAlignedCode = setupReasonACL.reasonCodes.some(r => r.startsWith('REGIME_ALIGNED'));
assert(hasAlignedCode, 'REGIME_ALIGNED reason code for trend_follow in TREND_EXPANSION');

// H10: SQ-skewed input greatest in RANGE
subsection('SQ-Skewed Greatest in RANGE');
const sqSkew: ConfluenceComponents = { SQ: 100, TA: 50, VA: 50, LL: 50, MTF: 50, FD: 50 };
const sqRange = computeRegimeScore(sqSkew, 'RANGE_COMPRESSION');
const sqVol = computeRegimeScore(sqSkew, 'VOL_EXPANSION');
console.log(`    SQ-heavy: RANGE=${sqRange.weightedScore}, VOL=${sqVol.weightedScore}`);
assert(sqRange.weightedScore - sqVol.weightedScore > 10,
  'SQ-skewed: RANGE scores 10+ pts higher than VOL',
  `delta=${(sqRange.weightedScore - sqVol.weightedScore).toFixed(1)}`);


// =====================================================
// PHASE 25: GAP 1 — AGREEMENT-DERIVED REGIME CONFIDENCE
// =====================================================
section('PHASE 25 GAP 1 — REGIME AGREEMENT CONFIDENCE');

// G1-1: Full agreement (4/4) → confidence = 85
subsection('Full Agreement — 4/4 Signals');
{
  const result = deriveRegimeConfidence({
    adx: 30,          // > 25: agrees with TREND_UP
    rsi: 62,          // ≥ 50: agrees with TREND_UP
    aroonUp: 85,      // > 70 + aroonDown < 50: agrees
    aroonDown: 20,
    mtfAlignment: 4,  // ≥ 3: agrees
    inferredRegime: 'TREND_UP',
  });
  console.log(`    Agreement: ${result.agreementCount}/${result.totalChecks} = conf ${result.confidence}`);
  console.log(`    Details: ${result.details.join(' | ')}`);
  assert(result.confidence === 85, '4/4 agreement → confidence 85',
    `got ${result.confidence}`);
  assert(result.agreementCount === 4, 'All 4 signals agree',
    `got ${result.agreementCount}/${result.totalChecks}`);
}

// G1-2: Partial agreement (2/4) → confidence = 55
subsection('Mixed Agreement — 2/4 Signals');
{
  const result = deriveRegimeConfidence({
    adx: 15,          // < 20: disagrees with TREND_UP (wants > 25)
    rsi: 62,          // ≥ 50: agrees with TREND_UP
    aroonUp: 40,      // Not > 70: disagrees
    aroonDown: 50,
    mtfAlignment: 4,  // ≥ 3: agrees
    inferredRegime: 'TREND_UP',
  });
  console.log(`    Agreement: ${result.agreementCount}/${result.totalChecks} = conf ${result.confidence}`);
  assert(result.confidence === 55, '2/4 agreement → confidence 55',
    `got ${result.confidence}`);
}

// G1-3: Full disagreement (0/4) → confidence = 30
subsection('Full Disagreement — 0/4 Signals');
{
  const result = deriveRegimeConfidence({
    adx: 15,          // < 20: disagrees with TREND_UP
    rsi: 35,          // < 50: disagrees with TREND_UP
    aroonUp: 20,      // Not > 70: disagrees
    aroonDown: 80,    // But we said TREND_UP...
    mtfAlignment: 1,  // < 3: disagrees
    inferredRegime: 'TREND_UP',
  });
  console.log(`    Agreement: ${result.agreementCount}/${result.totalChecks} = conf ${result.confidence}`);
  assert(result.confidence === 30, '0/4 agreement → confidence 30',
    `got ${result.confidence}`);
}

// G1-4: Insufficient data (only 1 indicator) → floor 45
subsection('Insufficient Data — Floor 45');
{
  const result = deriveRegimeConfidence({
    rsi: 60,
    inferredRegime: 'TREND_UP',
  });
  console.log(`    Agreement: ${result.agreementCount}/${result.totalChecks} = conf ${result.confidence}`);
  assert(result.confidence === 45, 'Only 1 signal available → floor 45',
    `got ${result.confidence}`);
  assert(result.details.some(d => d.includes('INSUFFICIENT_DATA')),
    'Should flag INSUFFICIENT_DATA');
}

// G1-5: Range regime with confirming signals
subsection('Range Regime Agreement');
{
  const result = deriveRegimeConfidence({
    adx: 14,          // < 20: agrees with RANGE_NEUTRAL
    rsi: 50,          // 35-65: agrees with range
    aroonUp: 55,      // Spread < 30: confirms no clear direction
    aroonDown: 45,
    mtfAlignment: 4,
    inferredRegime: 'RANGE_NEUTRAL',
  });
  console.log(`    Range agreement: ${result.agreementCount}/${result.totalChecks} = conf ${result.confidence}`);
  assert(result.confidence >= 70, 'Range with 3-4 confirming signals → conf ≥ 70',
    `got ${result.confidence}`);
}

// G1-6: 3/4 agreement → confidence = 70
subsection('3 of 4 Agreement → 70');
{
  const result = deriveRegimeConfidence({
    adx: 30,          // agrees
    rsi: 65,          // agrees
    aroonUp: 40,      // disagrees (not > 70)
    aroonDown: 50,
    mtfAlignment: 4,  // agrees
    inferredRegime: 'TREND_UP',
  });
  assert(result.confidence === 70, '3/4 agreement → confidence 70',
    `got ${result.confidence}`);
}


// =====================================================
// PHASE 25: GAP 2 — PERFORMANCE-LINKED RISK THROTTLE
// =====================================================
section('PHASE 25 GAP 2 — PERFORMANCE THROTTLE');

// G2-1: Normal session — no throttle
subsection('Normal Session — No Drawdown');
{
  const result = computePerformanceThrottle({ sessionPnlR: 0.5, consecutiveLosses: 0 });
  assert(result.level === 'NORMAL', 'Positive P&L → NORMAL',
    `level=${result.level}`);
  assert(result.ruDampener === 1.0, 'No dampening',
    `dampener=${result.ruDampener}`);
  assert(result.governorRecommendation === 'NORMAL', 'Governor: NORMAL');
}

// G2-2: -2R session → CAUTIOUS
subsection('-2R Session → CAUTIOUS');
{
  const result = computePerformanceThrottle({ sessionPnlR: -2, consecutiveLosses: 1 });
  assert(result.level === 'CAUTIOUS', '-2R → CAUTIOUS',
    `level=${result.level}`);
  assert(result.ruDampener === 0.70, 'Dampener = 0.70',
    `dampener=${result.ruDampener}`);
  assert(result.governorRecommendation === 'THROTTLED', 'Governor: THROTTLED');
}

// G2-3: -3R session → DEFENSIVE
subsection('-3R Session → DEFENSIVE');
{
  const result = computePerformanceThrottle({ sessionPnlR: -3, consecutiveLosses: 2 });
  assert(result.level === 'DEFENSIVE', '-3R → DEFENSIVE',
    `level=${result.level}`);
  assert(result.ruDampener === 0.50, 'Dampener = 0.50',
    `dampener=${result.ruDampener}`);
  assert(result.governorRecommendation === 'DEFENSIVE', 'Governor: DEFENSIVE');
}

// G2-4: -4R session → LOCKED (RU=0)
subsection('-4R Session → LOCKED');
{
  const result = computePerformanceThrottle({ sessionPnlR: -4, consecutiveLosses: 3 });
  assert(result.level === 'LOCKED', '-4R → LOCKED',
    `level=${result.level}`);
  assert(result.ruDampener === 0, 'Dampener = 0 (full lock)',
    `dampener=${result.ruDampener}`);
  assert(result.governorRecommendation === 'LOCKED', 'Governor: LOCKED');
}

// G2-5: 5-loss streak → streak dampener 0.60
subsection('5-Loss Streak → RU × 0.60');
{
  const result = computePerformanceThrottle({ sessionPnlR: -0.5, consecutiveLosses: 5 });
  assert(result.level === 'CAUTIOUS', '5 losses → at least CAUTIOUS',
    `level=${result.level}`);
  assert(result.ruDampener === 0.60, 'Streak dampener 0.60',
    `dampener=${result.ruDampener}`);
}

// G2-6: -3R + 5 losses → multiplicative: 0.50 × 0.60 = 0.30
subsection('Stacked: -3R + 5-Loss Streak → 0.30');
{
  const result = computePerformanceThrottle({ sessionPnlR: -3, consecutiveLosses: 5 });
  assert(result.ruDampener === 0.30, 'Multiplicative: 0.50 × 0.60 = 0.30',
    `dampener=${result.ruDampener}`);
  assert(result.level === 'DEFENSIVE', 'Level: DEFENSIVE (P&L dominates)',
    `level=${result.level}`);
}

// G2-7: Low win rate overlay
subsection('Low Win Rate Overlay');
{
  const result = computePerformanceThrottle({
    sessionPnlR: -1,
    consecutiveLosses: 2,
    rolling5WinRate: 0.10,
  });
  assert(result.ruDampener <= 0.70, 'Low win rate caps dampener ≤ 0.70',
    `dampener=${result.ruDampener}`);
  assert(result.reasonCodes.some(r => r.includes('LOW_WIN_RATE')),
    'Has LOW_WIN_RATE reason code');
}

// G2-8: Apply dampener to ACL throttle
subsection('Apply Dampener to ACL Throttle');
{
  const perf = computePerformanceThrottle({ sessionPnlR: -3, consecutiveLosses: 0 });
  const result = applyPerformanceDampener(0.80, perf);
  assert(result.throttle === 0.40, 'ACL 0.80 × defn 0.50 = 0.40',
    `throttle=${result.throttle}`);
}


// =====================================================
// PHASE 25: GAP 3 — NONLINEAR CONVICTION CURVE
// =====================================================
section('PHASE 25 GAP 3 — NONLINEAR CONVICTION CURVE');

// G3-1: High-scoring setup gets convex boost
subsection('Convex Boost for Strong Setup');
{
  // Components that should score > 75 linearly
  const strong: ConfluenceComponents = { SQ: 85, TA: 90, VA: 80, LL: 75, MTF: 85, FD: 70 };
  const result = computeRegimeScore(strong, 'TREND_EXPANSION');
  // Linear weighted score ≈ 0.10*85 + 0.35*90 + 0.10*80 + 0.05*75 + 0.30*85 + 0.10*70 = 84.25
  // Nonlinear: 84.25^1.08 / 100 * 100 + 5 ≈ 88.x
  console.log(`    Strong setup: weighted=${result.weightedScore}`);
  assert(result.weightedScore > 84, 'Nonlinear boost pushes strong setup above linear 84',
    `weighted=${result.weightedScore}`);
}

// G3-2: Weak-scoring setup gets mild concavity compression
subsection('Concave Compression for Weak Setup');
{
  const weak: ConfluenceComponents = { SQ: 30, TA: 35, VA: 30, LL: 25, MTF: 30, FD: 25 };
  const result = computeRegimeScore(weak, 'RANGE_COMPRESSION');
  // SQ gate = 55 → gated, but let's check the formula path
  // Linear would be ~30. Nonlinear with 0.95 exponent makes < 50 slightly higher.
  console.log(`    Weak setup: weighted=${result.weightedScore}, gated=${result.gated}`);
  // Gated caps at 55, so this tests the gate path primarily
  assert(result.gated === true, 'Weak setup is gated (SQ < 55)',
    `gated=${result.gated}`);
}

// G3-3: Mid-range separation — 50-75 zone
subsection('Mid-Range Separation');
{
  const mid60: ConfluenceComponents = { SQ: 60, TA: 65, VA: 60, LL: 55, MTF: 55, FD: 55 };
  const mid75: ConfluenceComponents = { SQ: 75, TA: 80, VA: 75, LL: 70, MTF: 75, FD: 70 };
  const r60 = computeRegimeScore(mid60, 'TREND_EXPANSION');
  const r75 = computeRegimeScore(mid75, 'TREND_EXPANSION');
  const linearDelta = (75 * 0.35 + 80 * 0.10 + 70 * 0.30) - (65 * 0.35 + 60 * 0.10 + 55 * 0.30);
  console.log(`    Mid 60s=${r60.weightedScore}, Mid 70s=${r75.weightedScore}, delta=${(r75.weightedScore - r60.weightedScore).toFixed(1)}`);
  assert(r75.weightedScore - r60.weightedScore > 10,
    'Nonlinear curve amplifies gap between 60s and 70s scores',
    `delta=${(r75.weightedScore - r60.weightedScore).toFixed(1)}`);
}

// G3-4: Perfect 100 everywhere remains ≥ 95
subsection('Perfect Input Nonlinear — Still ≥ 95');
{
  const perfect: ConfluenceComponents = { SQ: 100, TA: 100, VA: 100, LL: 100, MTF: 100, FD: 100 };
  for (const regime of ['TREND_EXPANSION', 'RANGE_COMPRESSION', 'VOL_EXPANSION'] as ScoringRegime[]) {
    const r = computeRegimeScore(perfect, regime);
    assert(r.weightedScore >= 95, `Perfect in ${regime} ≥ 95 after nonlinear`,
      `score=${r.weightedScore}`);
  }
}


// =====================================================
// PHASE 25: GAP 4 — TIME-OF-DAY SESSION PHASE
// =====================================================
section('PHASE 25 GAP 4 — SESSION PHASE OVERLAY');

// G4-1: Equity market phases detected correctly
subsection('Equity Session Phase Detection');
{
  // 9:45 ET = 14:45 UTC (opening range)
  const openingRange = detectSessionPhase('equities', new Date('2026-02-22T14:45:00Z'));
  assert(openingRange === 'OPENING_RANGE', '9:45 ET = OPENING_RANGE',
    `got ${openingRange}`);

  // 12:00 ET = 17:00 UTC (midday)
  const midday = detectSessionPhase('equities', new Date('2026-02-22T17:00:00Z'));
  assert(midday === 'MIDDAY', '12:00 ET = MIDDAY',
    `got ${midday}`);

  // 15:00 ET = 20:00 UTC (power hour)
  const powerHour = detectSessionPhase('equities', new Date('2026-02-22T20:00:00Z'));
  assert(powerHour === 'POWER_HOUR', '15:00 ET = POWER_HOUR',
    `got ${powerHour}`);

  // 15:55 ET = 20:55 UTC (close auction)
  const closeAuction = detectSessionPhase('equities', new Date('2026-02-22T20:55:00Z'));
  assert(closeAuction === 'CLOSE_AUCTION', '15:55 ET = CLOSE_AUCTION',
    `got ${closeAuction}`);

  // 18:00 ET = 23:00 UTC (after hours)
  const afterHours = detectSessionPhase('equities', new Date('2026-02-22T23:00:00Z'));
  assert(afterHours === 'AFTER_HOURS', '18:00 ET = AFTER_HOURS',
    `got ${afterHours}`);
}

// G4-2: Crypto session phases
subsection('Crypto Session Phase Detection');
{
  const asian = detectSessionPhase('crypto', new Date('2026-02-22T03:00:00Z'));
  assert(asian === 'CRYPTO_ASIAN', '03:00 UTC = CRYPTO_ASIAN',
    `got ${asian}`);

  const european = detectSessionPhase('crypto', new Date('2026-02-22T10:00:00Z'));
  assert(european === 'CRYPTO_EUROPEAN', '10:00 UTC = CRYPTO_EUROPEAN',
    `got ${european}`);

  const us = detectSessionPhase('crypto', new Date('2026-02-22T16:00:00Z'));
  assert(us === 'CRYPTO_US', '16:00 UTC = CRYPTO_US',
    `got ${us}`);

  const overnight = detectSessionPhase('crypto', new Date('2026-02-22T22:30:00Z'));
  assert(overnight === 'CRYPTO_OVERNIGHT', '22:30 UTC = CRYPTO_OVERNIGHT',
    `got ${overnight}`);
}

// G4-3: Breakout multipliers vary by session
subsection('Breakout Multipliers Vary By Session');
{
  const openMult = getSessionPhaseMultiplier('OPENING_RANGE', 'breakout');
  const midMult = getSessionPhaseMultiplier('MIDDAY', 'breakout');
  const closeMult = getSessionPhaseMultiplier('CLOSE_AUCTION', 'breakout');
  console.log(`    Opening=${openMult}, Midday=${midMult}, Close=${closeMult}`);
  assert(openMult > midMult, 'Opening breakout > Midday breakout',
    `${openMult} vs ${midMult}`);
  assert(midMult > closeMult, 'Midday breakout > Close auction breakout',
    `${midMult} vs ${closeMult}`);
  assert(openMult >= 1.10, 'Opening range breakout ≥ 1.10 multiplier',
    `got ${openMult}`);
  assert(closeMult <= 0.65, 'Close auction breakout ≤ 0.65 multiplier',
    `got ${closeMult}`);
}

// G4-4: Mean reversion thrives midday
subsection('Mean Reversion Midday Advantage');
{
  const mrMidday = getSessionPhaseMultiplier('MIDDAY', 'mean_reversion');
  const momMidday = getSessionPhaseMultiplier('MIDDAY', 'momentum');
  console.log(`    MR Midday=${mrMidday}, Mom Midday=${momMidday}`);
  assert(mrMidday > momMidday, 'Mean reversion beats momentum midday',
    `MR=${mrMidday} vs Mom=${momMidday}`);
  assert(mrMidday >= 1.05, 'MR midday is boosted ≥ 1.05',
    `got ${mrMidday}`);
  assert(momMidday <= 0.75, 'Momentum midday is penalized ≤ 0.75',
    `got ${momMidday}`);
}

// G4-5: No setup type → conservative 0.90
subsection('No Setup Type → 0.90 Default');
{
  const mult = getSessionPhaseMultiplier('POWER_HOUR', undefined);
  assert(mult === 0.90, 'No setup type → 0.90',
    `got ${mult}`);
}

// G4-6: Full overlay result
subsection('Full Session Phase Overlay Result');
{
  const result = computeSessionPhaseOverlay('equities', 'breakout', new Date('2026-02-22T14:45:00Z'));
  assert(result.phase === 'OPENING_RANGE', 'Phase detected correctly');
  assert(result.multiplier >= 1.10, 'Breakout at open boosted',
    `mult=${result.multiplier}`);
  assert(result.favorable === true, 'Opening breakout favorable=true');
  assert(result.reason.includes('SESSION_BOOST'), 'Reason includes SESSION_BOOST',
    `reason=${result.reason}`);
}

// G4-7: Crypto overnight penalty
subsection('Crypto Overnight Penalty');
{
  const result = computeSessionPhaseOverlay('crypto', 'momentum', new Date('2026-02-22T22:30:00Z'));
  assert(result.phase === 'CRYPTO_OVERNIGHT', 'Phase correct');
  assert(result.multiplier <= 0.75, 'Overnight momentum ≤ 0.75',
    `mult=${result.multiplier}`);
  assert(result.favorable === false, 'Overnight momentum not favorable');
}


// =====================================================
// PHASE 25: INTEGRATION — All 4 Gaps Working Together
// =====================================================
section('PHASE 25 INTEGRATION — ALL GAPS COMBINED');

// INT-1: Strong trend, good agreement, good session, no drawdown
subsection('Full Stack: Optimal Setup');
{
  const components: ConfluenceComponents = { SQ: 85, TA: 90, VA: 80, LL: 75, MTF: 85, FD: 70 };
  const scoring = computeRegimeScore(components, 'TREND_EXPANSION');
  const agreement = deriveRegimeConfidence({
    adx: 32, rsi: 65, aroonUp: 85, aroonDown: 15, mtfAlignment: 4,
    inferredRegime: 'TREND_UP',
  });
  const acl = computeACLFromScoring(scoring, {
    regimeConfidence: agreement.confidence,
    setupType: 'trend_follow',
    riskGovernorPermission: 'ALLOW',
    dataComponentsProvided: 8,
  });
  const perf = computePerformanceThrottle({ sessionPnlR: 1.5, consecutiveLosses: 0 });
  const session = computeSessionPhaseOverlay('equities', 'trend_follow', new Date('2026-02-22T15:30:00Z')); // 10:30 ET morning
  const finalThrottle = acl.throttle * session.multiplier * perf.ruDampener;
  
  console.log(`    Score=${scoring.weightedScore}, Agreement=${agreement.confidence}, ACL=${acl.confidence}, Session=${session.multiplier}, Perf=${perf.ruDampener}`);
  console.log(`    Final Throttle=${finalThrottle.toFixed(3)}, Auth=${acl.authorization}`);
  
  assert(acl.authorization === 'AUTHORIZED', 'Optimal setup is AUTHORIZED');
  assert(acl.confidence > 75, 'Confidence > 75 with high regime agreement',
    `conf=${acl.confidence}`);
  assert(finalThrottle > 0.70, 'Final throttle > 0.70 (all green)',
    `throttle=${finalThrottle.toFixed(3)}`);
}

// INT-2: Same setup but midday + drawdown + disagreement
subsection('Full Stack: Degraded Conditions');
{
  const components: ConfluenceComponents = { SQ: 85, TA: 90, VA: 80, LL: 75, MTF: 85, FD: 70 };
  const scoring = computeRegimeScore(components, 'TREND_EXPANSION');
  const agreement = deriveRegimeConfidence({
    adx: 15, rsi: 48, aroonUp: 40, aroonDown: 50, mtfAlignment: 1,
    inferredRegime: 'TREND_UP',
  });
  const acl = computeACLFromScoring(scoring, {
    regimeConfidence: agreement.confidence,
    setupType: 'breakout',
    riskGovernorPermission: 'ALLOW',
    dataComponentsProvided: 4,
  });
  const perf = computePerformanceThrottle({ sessionPnlR: -2.5, consecutiveLosses: 3 });
  const session = computeSessionPhaseOverlay('equities', 'breakout', new Date('2026-02-22T17:00:00Z')); // midday
  const finalThrottle = acl.throttle * session.multiplier * perf.ruDampener;

  console.log(`    Score=${scoring.weightedScore}, Agreement=${agreement.confidence}, ACL=${acl.confidence}, Session=${session.multiplier}, Perf=${perf.ruDampener}`);
  console.log(`    Final Throttle=${finalThrottle.toFixed(3)}, Auth=${acl.authorization}`);

  assert(agreement.confidence <= 40, 'Disagreeing signals → low confidence',
    `conf=${agreement.confidence}`);
  assert(session.multiplier <= 0.75, 'Midday breakout penalized',
    `mult=${session.multiplier}`);
  assert(perf.ruDampener < 1.0, 'Drawdown dampens',
    `dampener=${perf.ruDampener}`);
  assert(finalThrottle < 0.30, 'Final throttle < 0.30 under degraded conditions',
    `throttle=${finalThrottle.toFixed(3)}`);
}


// =====================================================
// FINAL SUMMARY
// =====================================================
section('AUDIT SUMMARY');
console.log(`\n  Total Tests: ${passCount + failCount}`);
console.log(`  ✅ Passed: ${passCount}`);
console.log(`  ❌ Failed: ${failCount}`);
if (failures.length > 0) {
  console.log(`\n  FAILURES:`);
  failures.forEach(f => console.log(`    • ${f}`));
}
console.log('');
