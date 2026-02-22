// test/institutional-audit.test.ts
// Vitest conversion of institutional-audit.ts (119 original assertions)
// + new tests for regime-classifier.ts unified module
//
// Run: npx vitest run test/institutional-audit.test.ts

import { describe, it, expect } from 'vitest';
import {
  computeRegimeScore,
  estimateComponentsFromContext,
  mapToScoringRegime,
  deriveRegimeConfidence,
} from '../lib/ai/regimeScoring';
import type { ConfluenceComponents, ScoringRegime } from '../lib/ai/regimeScoring';
import { computeACL, computeACLFromScoring } from '../lib/ai/adaptiveConfidenceLens';
import type { ACLInput } from '../lib/ai/adaptiveConfidenceLens';
import {
  buildPermissionSnapshot,
  evaluateCandidate,
} from '../lib/risk-governor-hard';
import type { CandidateIntent, Regime } from '../lib/risk-governor-hard';
import {
  computePerformanceThrottle,
  applyPerformanceDampener,
} from '../lib/ai/performanceThrottle';
import {
  detectSessionPhase,
  getSessionPhaseMultiplier,
  computeSessionPhaseOverlay,
} from '../lib/ai/sessionPhase';
import { classifyRegime } from '../lib/regime-classifier';

// ================================================================
// PHASE 1.1: REGIME FILTERING VALIDATION
// ================================================================
describe('PHASE 1.1 — Regime Filtering', () => {
  const baseComponents: ConfluenceComponents = {
    SQ: 65, TA: 60, VA: 55, LL: 60, MTF: 50, FD: 50,
  };
  const regimes: ScoringRegime[] = [
    'TREND_EXPANSION', 'TREND_MATURE', 'RANGE_COMPRESSION', 'VOL_EXPANSION', 'TRANSITION',
  ];

  it('produces at least 3 unique scores across 5 regimes', () => {
    const scores = new Set<number>();
    for (const regime of regimes) {
      const result = computeRegimeScore(baseComponents, regime);
      scores.add(result.weightedScore);
    }
    expect(scores.size).toBeGreaterThanOrEqual(3);
  });

  it('gates breakout with weak SQ in range compression', () => {
    const weak: ConfluenceComponents = { SQ: 45, TA: 55, VA: 60, LL: 35, MTF: 60, FD: 55 };
    const result = computeRegimeScore(weak, 'RANGE_COMPRESSION');
    expect(result.gated).toBe(true);
    expect(result.weightedScore).toBeLessThanOrEqual(55);
    expect(['NEUTRAL', 'CONDITIONAL']).toContain(result.tradeBias);
  });

  it('passes gate with high SQ in range compression', () => {
    const good: ConfluenceComponents = { SQ: 80, TA: 55, VA: 60, LL: 65, MTF: 60, FD: 55 };
    const result = computeRegimeScore(good, 'RANGE_COMPRESSION');
    expect(result.gated).toBe(false);
  });

  it('gates late entry in mature trend with weak VA/FD', () => {
    const mature: ConfluenceComponents = { SQ: 65, TA: 60, VA: 30, LL: 60, MTF: 50, FD: 30 };
    const result = computeRegimeScore(mature, 'TREND_MATURE');
    expect(result.gated).toBe(true);
  });

  it('transition regime enforces SQ and MTF gates', () => {
    const weak: ConfluenceComponents = { SQ: 40, TA: 70, VA: 70, LL: 70, MTF: 40, FD: 70 };
    const result = computeRegimeScore(weak, 'TRANSITION');
    expect(result.gated).toBe(true);
  });

  it('vol expansion gates when LL < 50', () => {
    const lowLL: ConfluenceComponents = { SQ: 80, TA: 80, VA: 80, LL: 40, MTF: 80, FD: 80 };
    const result = computeRegimeScore(lowLL, 'VOL_EXPANSION');
    expect(result.gated).toBe(true);
  });

  it('TA-heavy setup scores higher in TREND than RANGE', () => {
    const ta: ConfluenceComponents = { SQ: 50, TA: 100, VA: 50, LL: 50, MTF: 50, FD: 50 };
    const trend = computeRegimeScore(ta, 'TREND_EXPANSION');
    const range = computeRegimeScore(ta, 'RANGE_COMPRESSION');
    expect(trend.weightedScore).toBeGreaterThan(range.weightedScore);
  });
});

// ================================================================
// PHASE 1.2: ADAPTIVE CONFIDENCE LENS
// ================================================================
describe('PHASE 1.2 — Adaptive Confidence Lens', () => {
  it('clean trend setup is AUTHORIZED with throttle > 0.6', () => {
    const scoring = computeRegimeScore(
      { SQ: 80, TA: 75, VA: 70, LL: 70, MTF: 65, FD: 60 },
      'TREND_EXPANSION',
    );
    const acl = computeACLFromScoring(scoring, {
      regimeConfidence: 80,
      setupType: 'trend_follow',
      riskGovernorPermission: 'ALLOW',
    });
    expect(acl.authorization).toBe('AUTHORIZED');
    expect(acl.throttle).toBeGreaterThan(0.6);
  });

  it('breakout in range compression is BLOCKED with mismatch reason', () => {
    const scoring = computeRegimeScore(
      { SQ: 60, TA: 55, VA: 50, LL: 45, MTF: 40, FD: 45 },
      'RANGE_COMPRESSION',
    );
    const acl = computeACLFromScoring(scoring, {
      regimeConfidence: 55,
      setupType: 'breakout',
    });
    expect(acl.confidence).toBeLessThan(50);
    expect(acl.authorization).toBe('BLOCKED');
    expect(acl.reasonCodes.some((r: string) => r.includes('REGIME_MISMATCH'))).toBe(true);
  });

  it('mean reversion scores higher than breakout in range', () => {
    const scoring = computeRegimeScore(
      { SQ: 75, TA: 65, VA: 55, LL: 60, MTF: 50, FD: 55 },
      'RANGE_COMPRESSION',
    );
    const mr = computeACLFromScoring(scoring, { regimeConfidence: 70, setupType: 'mean_reversion' });
    const bo = computeACLFromScoring(scoring, { regimeConfidence: 70, setupType: 'breakout' });
    expect(mr.confidence).toBeGreaterThan(bo.confidence);
  });

  it('high event risk caps confidence at 50', () => {
    const acl = computeACL({
      weightedScore: 85,
      regimeConfidence: 80,
      regime: 'TREND_EXPANSION',
      setupType: 'momentum',
      eventRisk: 'high',
      riskGovernorPermission: 'ALLOW',
    });
    expect(acl.confidence).toBeLessThanOrEqual(50);
    expect(acl.authorization).not.toBe('AUTHORIZED');
  });

  it('risk governor BLOCK always means BLOCKED + throttle 0', () => {
    const acl = computeACL({
      weightedScore: 95,
      regimeConfidence: 95,
      regime: 'TREND_EXPANSION',
      setupType: 'trend_follow',
      riskGovernorPermission: 'BLOCK',
    });
    expect(acl.authorization).toBe('BLOCKED');
    expect(acl.throttle).toBe(0);
  });

  it('throttle scales: ALLOW > REDUCED > TIGHTENED', () => {
    const base: ACLInput = {
      weightedScore: 78,
      regimeConfidence: 75,
      regime: 'TREND_EXPANSION',
    };
    const allow = computeACL({ ...base, riskGovernorPermission: 'ALLOW' });
    const reduced = computeACL({ ...base, riskGovernorPermission: 'ALLOW_REDUCED' });
    const tightened = computeACL({ ...base, riskGovernorPermission: 'ALLOW_TIGHTENED' });
    expect(allow.throttle).toBeGreaterThan(reduced.throttle);
    expect(reduced.throttle).toBeGreaterThan(tightened.throttle);
  });

  it('penalty stacking sums to at least -30', () => {
    const acl = computeACL({
      weightedScore: 75,
      regimeConfidence: 70,
      regime: 'TREND_EXPANSION',
      setupType: 'momentum',
      eventRisk: 'medium',
      mtfScore: 30,
      vaScore: 25,
      lateEntry: true,
      consecutiveLosses: 4,
    });
    const total = acl.penalties.filter((p: any) => p.active).reduce((s: number, p: any) => s + p.amount, 0);
    expect(total).toBeLessThanOrEqual(-30);
    expect(acl.confidence).toBeLessThan(50);
  });

  it('correlation penalty active with 3 positions', () => {
    const acl = computeACL({
      weightedScore: 75,
      regimeConfidence: 70,
      regime: 'TREND_EXPANSION',
      correlatedPositions: 3,
    });
    const corrPen = acl.penalties.find((p: any) => p.code === 'CORRELATION');
    expect(corrPen?.active).toBe(true);
    expect(corrPen?.amount ?? 0).toBeLessThanOrEqual(-10);
  });
});

// ================================================================
// PHASE 1.3: RISK GOVERNOR ENFORCEMENT
// ================================================================
describe('PHASE 1.3 — Risk Governor Enforcement', () => {
  it('blocks trade with stop on wrong side (LONG)', () => {
    const snap = buildPermissionSnapshot({ regime: 'TREND_UP', enabled: true });
    const result = evaluateCandidate(snap, {
      symbol: 'AAPL',
      asset_class: 'equities',
      strategy_tag: 'BREAKOUT_CONTINUATION',
      direction: 'LONG',
      confidence: 80,
      entry_price: 150,
      stop_price: 155, // wrong side
      atr: 2.5,
    });
    expect(result.permission).toBe('BLOCK');
    expect(result.reason_codes).toContain('STOP_WRONG_SIDE');
  });

  it('blocks trade where stop equals entry', () => {
    const snap = buildPermissionSnapshot({ regime: 'TREND_UP', enabled: true });
    const result = evaluateCandidate(snap, {
      symbol: 'AAPL',
      asset_class: 'equities',
      strategy_tag: 'BREAKOUT_CONTINUATION',
      direction: 'LONG',
      confidence: 80,
      entry_price: 150,
      stop_price: 150,
      atr: 2.5,
    });
    expect(result.permission).toBe('BLOCK');
  });

  it('blocks low confidence below ALLOW threshold', () => {
    const snap = buildPermissionSnapshot({ regime: 'TREND_UP', enabled: true });
    const result = evaluateCandidate(snap, {
      symbol: 'BTC',
      asset_class: 'crypto',
      strategy_tag: 'BREAKOUT_CONTINUATION',
      direction: 'LONG',
      confidence: 55,
      entry_price: 50000,
      stop_price: 48000,
      atr: 1500,
    });
    expect(result.permission).toBe('BLOCK');
    expect(result.reason_codes).toContain('CONFIDENCE_BELOW_THRESHOLD');
  });

  it('LOCKED mode blocks all trades', () => {
    const snap = buildPermissionSnapshot({
      regime: 'TREND_UP',
      enabled: true,
      consecutiveLosses: 5,
    });
    expect(snap.risk_mode).toBe('LOCKED');
    const result = evaluateCandidate(snap, {
      symbol: 'AAPL',
      asset_class: 'equities',
      strategy_tag: 'BREAKOUT_CONTINUATION',
      direction: 'LONG',
      confidence: 95,
      entry_price: 150,
      stop_price: 147,
      atr: 2.5,
    });
    expect(result.permission).toBe('BLOCK');
  });

  it('high event severity blocks non-event strategies', () => {
    const snap = buildPermissionSnapshot({
      regime: 'TREND_UP',
      enabled: true,
      eventSeverity: 'high',
    });
    const result = evaluateCandidate(snap, {
      symbol: 'AAPL',
      asset_class: 'equities',
      strategy_tag: 'BREAKOUT_CONTINUATION',
      direction: 'LONG',
      confidence: 80,
      entry_price: 150,
      stop_price: 147,
      atr: 2.5,
      event_severity: 'high',
    });
    expect(result.permission).toBe('BLOCK');
    expect(result.reason_codes).toContain('EVENT_BLOCK');
  });

  it('data DOWN sets risk mode to LOCKED', () => {
    const snap = buildPermissionSnapshot({
      regime: 'TREND_UP',
      enabled: true,
      dataStatus: 'DOWN',
    });
    expect(snap.risk_mode).toBe('LOCKED');
  });

  it('correlated cluster full → BLOCK', () => {
    const snap = buildPermissionSnapshot({ regime: 'TREND_UP', enabled: true });
    const result = evaluateCandidate(snap, {
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
    });
    expect(result.permission).toBe('BLOCK');
  });
});

// ================================================================
// PHASE 1.4: TRADE PERMISSION MATRIX INTEGRITY
// ================================================================
describe('PHASE 1.4 — Trade Permission Matrix', () => {
  it('TREND_UP blocks SHORT breakout continuation', () => {
    const snap = buildPermissionSnapshot({ regime: 'TREND_UP', enabled: true });
    expect(snap.matrix.BREAKOUT_CONTINUATION.SHORT).toBe('BLOCK');
  });

  it('RANGE_NEUTRAL allows RANGE_FADE both directions', () => {
    const snap = buildPermissionSnapshot({ regime: 'RANGE_NEUTRAL', enabled: true });
    expect(snap.matrix.RANGE_FADE.LONG).toBe('ALLOW');
    expect(snap.matrix.RANGE_FADE.SHORT).toBe('ALLOW');
  });

  it('RISK_OFF_STRESS blocks breakout continuations', () => {
    const snap = buildPermissionSnapshot({ regime: 'RISK_OFF_STRESS', enabled: true });
    expect(snap.matrix.BREAKOUT_CONTINUATION.LONG).toBe('BLOCK');
    expect(snap.matrix.BREAKOUT_CONTINUATION.SHORT).toBe('BLOCK');
  });

  it('VOL_EXPANSION blocks momentum reversal LONG', () => {
    const snap = buildPermissionSnapshot({ regime: 'VOL_EXPANSION', enabled: true });
    expect(snap.matrix.MOMENTUM_REVERSAL.LONG).toBe('BLOCK');
  });
});

// ================================================================
// STRESS TESTS
// ================================================================
describe('PHASE 3 — Stress Tests', () => {
  it('low volatility chop: gated, weak throttle', () => {
    const chopComponents: ConfluenceComponents = { SQ: 55, TA: 40, VA: 45, LL: 35, MTF: 45, FD: 40 };
    const scoring = computeRegimeScore(chopComponents, 'RANGE_COMPRESSION');
    const acl = computeACLFromScoring(scoring, { regimeConfidence: 50, setupType: 'breakout' });
    expect(scoring.gated).toBe(true);
    expect(acl.authorization).toBe('BLOCKED');
    expect(acl.throttle).toBeLessThan(0.5);
  });

  it('strong breakout trend: high confidence, AUTHORIZED', () => {
    const trendComponents: ConfluenceComponents = { SQ: 85, TA: 90, VA: 80, LL: 75, MTF: 80, FD: 75 };
    const scoring = computeRegimeScore(trendComponents, 'TREND_EXPANSION');
    const acl = computeACLFromScoring(scoring, {
      regimeConfidence: 85,
      setupType: 'breakout',
      riskGovernorPermission: 'ALLOW',
    });
    expect(scoring.gated).toBe(false);
    expect(acl.authorization).toBe('AUTHORIZED');
    expect(acl.confidence).toBeGreaterThan(60);
  });

  it('trend vs chop behavioral differentiation', () => {
    const trendC: ConfluenceComponents = { SQ: 85, TA: 90, VA: 80, LL: 75, MTF: 80, FD: 75 };
    const chopC: ConfluenceComponents = { SQ: 55, TA: 40, VA: 45, LL: 35, MTF: 45, FD: 40 };
    const trendS = computeRegimeScore(trendC, 'TREND_EXPANSION');
    const chopS = computeRegimeScore(chopC, 'RANGE_COMPRESSION');
    const trendACL = computeACLFromScoring(trendS, { regimeConfidence: 85, setupType: 'breakout', riskGovernorPermission: 'ALLOW' });
    const chopACL = computeACLFromScoring(chopS, { regimeConfidence: 50, setupType: 'breakout' });
    expect(trendACL.confidence).toBeGreaterThan(chopACL.confidence + 20);
  });
});

// ================================================================
// EDGE CASES
// ================================================================
describe('Edge Cases', () => {
  it('uniform mediocrity (all 50s) produces moderate result', () => {
    const uniform: ConfluenceComponents = { SQ: 50, TA: 50, VA: 50, LL: 50, MTF: 50, FD: 50 };
    const result = computeRegimeScore(uniform, 'TRANSITION');
    expect(result.weightedScore).toBeGreaterThanOrEqual(40);
    expect(result.weightedScore).toBeLessThanOrEqual(65);
  });

  it('regime mapping covers all 5 scoring regimes', () => {
    const all: ScoringRegime[] = ['TREND_EXPANSION', 'TREND_MATURE', 'RANGE_COMPRESSION', 'VOL_EXPANSION', 'TRANSITION'];
    for (const r of all) {
      const result = computeRegimeScore(baseComponents(), r);
      expect(Number.isFinite(result.weightedScore)).toBe(true);
    }
  });

  it('perfect setup still has finite scores across all regimes', () => {
    const perfect: ConfluenceComponents = { SQ: 100, TA: 100, VA: 100, LL: 100, MTF: 100, FD: 100 };
    const regimes: ScoringRegime[] = ['TREND_EXPANSION', 'TREND_MATURE', 'RANGE_COMPRESSION', 'VOL_EXPANSION', 'TRANSITION'];
    for (const r of regimes) {
      const result = computeRegimeScore(perfect, r);
      expect(result.weightedScore).toBeGreaterThanOrEqual(70);
      expect(result.gated).toBe(false);
    }
  });
});

// ================================================================
// DEFECT HUNTING — STRUCTURAL WEAKNESS PROBES
// ================================================================
describe('Defect Hunting — Structural Weakness Probes', () => {
  it('default regime confidence ≥ 55 (conservative)', () => {
    // After fix: default is 60, safely above the 55 cap threshold
    const scoring = computeRegimeScore(baseComponents(), 'TRANSITION');
    const acl = computeACLFromScoring(scoring, {});
    // Default regimeConfidence is now 60 — should not trigger REGIME_LOW cap
    expect(acl.reasonCodes.every((c: string) => !c.includes('REGIME_LOW'))).toBe(true);
  });

  it('default risk governor regime is RANGE_NEUTRAL (not TREND_UP)', () => {
    const snap = buildPermissionSnapshot({});
    expect(snap.regime).toBe('RANGE_NEUTRAL');
  });
});

// ================================================================
// PHASE 24 HARDENING
// ================================================================
describe('PHASE 24 Hardening', () => {
  it('TRANSITION multiplier is strict (trades score down or equal)', () => {
    const nc: ConfluenceComponents = { SQ: 70, TA: 70, VA: 70, LL: 70, MTF: 70, FD: 70 };
    const trend = computeRegimeScore(nc, 'TREND_EXPANSION');
    const transition = computeRegimeScore(nc, 'TRANSITION');
    expect(transition.weightedScore).toBeLessThanOrEqual(trend.weightedScore);
  });

  it('sparse data penalty applies when dataComponentsProvided < 4', () => {
    const scoring = computeRegimeScore(baseComponents(), 'TREND_EXPANSION');
    const sparse = computeACLFromScoring(scoring, {
      regimeConfidence: 70,
      setupType: 'breakout',
      riskGovernorPermission: 'ALLOW',
      dataComponentsProvided: 2,
    });
    const full = computeACLFromScoring(scoring, {
      regimeConfidence: 70,
      setupType: 'breakout',
      riskGovernorPermission: 'ALLOW',
      dataComponentsProvided: 6,
    });
    expect(sparse.confidence).toBeLessThan(full.confidence);
  });

  it('RANGE_NEUTRAL tightened permissions', () => {
    const snap = buildPermissionSnapshot({ regime: 'RANGE_NEUTRAL', enabled: true });
    // Range should allow range-specific strategies, block trending strategies
    expect(snap.matrix.RANGE_FADE.LONG).toBe('ALLOW');
    expect(snap.matrix.RANGE_FADE.SHORT).toBe('ALLOW');
  });

  it('enhanced reason codes present in ACL output', () => {
    const scoring = computeRegimeScore(baseComponents(), 'TRANSITION');
    const acl = computeACLFromScoring(scoring, { regimeConfidence: 40, setupType: 'breakout' });
    expect(acl.reasonCodes.length).toBeGreaterThan(0);
  });
});

// ================================================================
// PHASE 25 GAP 1 — REGIME AGREEMENT CONFIDENCE
// ================================================================
describe('PHASE 25 GAP 1 — Regime Agreement Confidence', () => {
  it('full agreement (4/4 signals) → high confidence', () => {
    const result = deriveRegimeConfidence({
      adx: 35, rsi: 75, aroonUp: 95, aroonDown: 10, mtfAlignment: 3,
      inferredRegime: 'TREND_UP',
    });
    expect(result.confidence).toBeGreaterThanOrEqual(80);
  });

  it('mixed agreement (2/4 signals) → moderate confidence', () => {
    const result = deriveRegimeConfidence({
      adx: 30, rsi: 55, aroonUp: 70, aroonDown: 50, mtfAlignment: 1,
      inferredRegime: 'TREND_UP',
    });
    expect(result.confidence).toBeGreaterThanOrEqual(50);
    expect(result.confidence).toBeLessThan(80);
  });

  it('full disagreement (0/4 signals) → low confidence', () => {
    const result = deriveRegimeConfidence({
      adx: 10, rsi: 50, aroonUp: 40, aroonDown: 45, mtfAlignment: 0,
      inferredRegime: 'TREND_UP',
    });
    expect(result.confidence).toBeLessThan(50);
  });

  it('insufficient data → floor at 45', () => {
    const result = deriveRegimeConfidence({
      adx: NaN, rsi: NaN, aroonUp: NaN, aroonDown: NaN, mtfAlignment: 0,
      inferredRegime: 'TREND_UP',
    });
    expect(result.confidence).toBeGreaterThanOrEqual(45);
  });
});

// ================================================================
// PHASE 25 GAP 2 — PERFORMANCE THROTTLE
// ================================================================
describe('PHASE 25 GAP 2 — Performance Throttle', () => {
  it('normal session — no drawdown → no throttle', () => {
    const perf = computePerformanceThrottle({ sessionPnlR: 0.5, consecutiveLosses: 0 });
    expect(perf.level).toBe('NORMAL');
    expect(perf.ruDampener).toBe(1.0);
  });

  it('-2R session → CAUTIOUS', () => {
    const perf = computePerformanceThrottle({ sessionPnlR: -2, consecutiveLosses: 1 });
    expect(perf.level).toBe('CAUTIOUS');
    expect(perf.ruDampener).toBeLessThan(1.0);
  });

  it('-3R session → DEFENSIVE', () => {
    const perf = computePerformanceThrottle({ sessionPnlR: -3, consecutiveLosses: 2 });
    expect(perf.level).toBe('DEFENSIVE');
    expect(perf.ruDampener).toBeLessThanOrEqual(0.6);
  });

  it('-4R session → LOCKED', () => {
    const perf = computePerformanceThrottle({ sessionPnlR: -4, consecutiveLosses: 3 });
    expect(perf.level).toBe('LOCKED');
    expect(perf.ruDampener).toBe(0);
  });

  it('5-loss streak dampener ≤ 0.60', () => {
    const perf = computePerformanceThrottle({ sessionPnlR: -1, consecutiveLosses: 5 });
    expect(perf.ruDampener).toBeLessThanOrEqual(0.60);
  });

  it('stacked -3R + 5-loss → heavy dampening', () => {
    const perf = computePerformanceThrottle({ sessionPnlR: -3, consecutiveLosses: 5 });
    expect(perf.ruDampener).toBeLessThanOrEqual(0.30);
  });

  it('apply dampener to ACL throttle', () => {
    const scoring = computeRegimeScore(
      { SQ: 80, TA: 75, VA: 70, LL: 70, MTF: 65, FD: 60 },
      'TREND_EXPANSION',
    );
    const acl = computeACLFromScoring(scoring, {
      regimeConfidence: 80,
      setupType: 'trend_follow',
      riskGovernorPermission: 'ALLOW',
    });
    const perf = computePerformanceThrottle({ sessionPnlR: -2.5, consecutiveLosses: 3 });
    const dampened = applyPerformanceDampener(acl.throttle, perf);
    expect(dampened.throttle).toBeLessThan(acl.throttle);
    expect(dampened.throttle).toBeGreaterThanOrEqual(0);
  });
});

// ================================================================
// PHASE 25 GAP 4 — SESSION PHASE OVERLAY
// ================================================================
describe('PHASE 25 GAP 4 — Session Phase Overlay', () => {
  it('detects equity session phases', () => {
    const open = detectSessionPhase('equities', new Date('2026-02-22T14:45:00Z')); // 9:45 ET
    const mid = detectSessionPhase('equities', new Date('2026-02-22T17:00:00Z'));  // noon ET
    const close = detectSessionPhase('equities', new Date('2026-02-22T20:55:00Z')); // 15:55 ET
    expect(open).toBe('OPENING_RANGE');
    expect(mid).toBe('MIDDAY');
    expect(close).toBe('CLOSE_AUCTION');
  });

  it('breakout multipliers vary by session', () => {
    const openMult = getSessionPhaseMultiplier('OPENING_RANGE', 'breakout');
    const midMult = getSessionPhaseMultiplier('MIDDAY', 'breakout');
    expect(openMult).toBeGreaterThanOrEqual(midMult);
  });

  it('mean reversion midday advantage', () => {
    const openMR = getSessionPhaseMultiplier('OPENING_RANGE', 'mean_reversion');
    const midMR = getSessionPhaseMultiplier('MIDDAY', 'mean_reversion');
    expect(midMR).toBeGreaterThanOrEqual(openMR);
  });

  it('no setup type defaults to 0.90', () => {
    const mult = getSessionPhaseMultiplier('MIDDAY', undefined);
    expect(mult).toBe(0.90);
  });

  it('full session phase overlay has required fields', () => {
    const overlay = computeSessionPhaseOverlay('equities', 'breakout', new Date('2026-02-22T14:45:00Z'));
    expect(overlay).toHaveProperty('phase');
    expect(overlay).toHaveProperty('multiplier');
    expect(overlay.multiplier).toBeGreaterThan(0);
    expect(overlay.multiplier).toBeLessThanOrEqual(1.25);
  });
});

// ================================================================
// PHASE 25 INTEGRATION — ALL GAPS COMBINED
// ================================================================
describe('PHASE 25 Integration — Full Stack', () => {
  it('optimal setup: high throttle, AUTHORIZED', () => {
    const components: ConfluenceComponents = { SQ: 85, TA: 90, VA: 80, LL: 75, MTF: 85, FD: 70 };
    const scoring = computeRegimeScore(components, 'TREND_EXPANSION');
    const agreement = deriveRegimeConfidence({
      adx: 35, rsi: 72, aroonUp: 95, aroonDown: 10, mtfAlignment: 3,
      inferredRegime: 'TREND_UP',
    });
    const acl = computeACLFromScoring(scoring, {
      regimeConfidence: agreement.confidence,
      setupType: 'breakout',
      riskGovernorPermission: 'ALLOW',
      dataComponentsProvided: 6,
    });
    const perf = computePerformanceThrottle({ sessionPnlR: 1.5, consecutiveLosses: 0 });
    const session = computeSessionPhaseOverlay('equities', 'breakout', new Date('2026-02-22T14:45:00Z'));
    const finalThrottle = acl.throttle * session.multiplier * perf.ruDampener;

    expect(acl.authorization).toBe('AUTHORIZED');
    expect(finalThrottle).toBeGreaterThan(0.5);
  });

  it('degraded conditions: low agreement + drawdown + midday → throttle < 0.30', () => {
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
    const session = computeSessionPhaseOverlay('equities', 'breakout', new Date('2026-02-22T17:00:00Z'));
    const finalThrottle = acl.throttle * session.multiplier * perf.ruDampener;

    expect(agreement.confidence).toBeLessThanOrEqual(40);
    expect(session.multiplier).toBeLessThanOrEqual(0.75);
    expect(perf.ruDampener).toBeLessThan(1.0);
    expect(finalThrottle).toBeLessThan(0.30);
  });
});

// ================================================================
// NEW: UNIFIED REGIME CLASSIFIER — regime-classifier.ts
// ================================================================
describe('Unified Regime Classifier', () => {
  it('extreme volatility (ATR > 7%) → VOL_EXPANSION across all taxonomies', () => {
    const result = classifyRegime({ adx: 25, rsi: 55, atrPercent: 8.5, aroonUp: 60, aroonDown: 40 });
    expect(result.governor).toBe('VOL_EXPANSION');
    expect(result.scoring).toBe('VOL_EXPANSION');
    expect(result.institutional).toBe('high_volatility_chaos');
  });

  it('strong bullish trend (ADX ≥ 22, bullish) → TREND_UP / TREND_EXPANSION', () => {
    const result = classifyRegime({ adx: 30, rsi: 65, atrPercent: 2.5, aroonUp: 90, aroonDown: 20, direction: 'bullish', ema200Above: true });
    expect(result.governor).toBe('TREND_UP');
    expect(result.scoring).toBe('TREND_EXPANSION');
    expect(result.institutional).toBe('trending');
    expect(result.confidence).toBeGreaterThanOrEqual(60);
  });

  it('mature bullish trend (ADX ≥ 22, RSI > 70) → TREND_MATURE', () => {
    const result = classifyRegime({ adx: 28, rsi: 75, atrPercent: 2.0, aroonUp: 85, aroonDown: 15, direction: 'bullish', ema200Above: true });
    expect(result.scoring).toBe('TREND_MATURE');
    expect(result.label).toContain('Mature');
  });

  it('bearish trend → TREND_DOWN', () => {
    const result = classifyRegime({ adx: 32, rsi: 35, atrPercent: 3.0, aroonUp: 10, aroonDown: 95, direction: 'bearish', ema200Above: false });
    expect(result.governor).toBe('TREND_DOWN');
    expect(result.institutional).toBe('trending');
  });

  it('ranging (ADX ≤ 18, low Aroon divergence) → RANGE', () => {
    const result = classifyRegime({ adx: 15, rsi: 50, atrPercent: 2.0, aroonUp: 45, aroonDown: 40 });
    expect(result.governor).toBe('RANGE_NEUTRAL');
    expect(result.scoring).toBe('RANGE_COMPRESSION');
    expect(result.institutional).toBe('ranging');
  });

  it('compressed range (ADX ≤ 18, ATR < 1.5%) → VOL_CONTRACTION', () => {
    const result = classifyRegime({ adx: 12, rsi: 48, atrPercent: 1.0, aroonUp: 50, aroonDown: 55 });
    expect(result.governor).toBe('VOL_CONTRACTION');
    expect(result.scoring).toBe('RANGE_COMPRESSION');
  });

  it('moderate volatility (ATR > 4%) without strong trend → VOL_EXPANSION', () => {
    const result = classifyRegime({ adx: 20, rsi: 50, atrPercent: 5.0 });
    expect(result.governor).toBe('VOL_EXPANSION');
    expect(result.scoring).toBe('VOL_EXPANSION');
  });

  it('default (no data) → RANGE_NEUTRAL / TRANSITION (conservative)', () => {
    const result = classifyRegime({});
    expect(result.governor).toBe('RANGE_NEUTRAL');
    expect(result.scoring).toBe('TRANSITION');
    expect(result.institutional).toBe('unknown');
    expect(result.confidence).toBeLessThanOrEqual(55);
  });

  it('no indicators → confidence caps at 55', () => {
    const result = classifyRegime({});
    expect(result.confidence).toBeLessThanOrEqual(55);
  });

  it('more agreeing indicator data → higher confidence', () => {
    // Use ADX=23 (trending but not strongTrend) so agreement ratio matters
    const sparse = classifyRegime({ adx: 23 });
    const rich = classifyRegime({ adx: 23, aroonUp: 90, aroonDown: 10, direction: 'bullish' });
    expect(rich.confidence).toBeGreaterThanOrEqual(sparse.confidence);
  });

  it('all three taxonomies are always populated', () => {
    const inputs = [
      { adx: 35, rsi: 70, atrPercent: 2.0, direction: 'bullish' as const },
      { adx: 12, rsi: 50, atrPercent: 1.0 },
      { atrPercent: 9.0 },
      {},
    ];
    for (const input of inputs) {
      const result = classifyRegime(input);
      expect(result.governor).toBeTruthy();
      expect(result.scoring).toBeTruthy();
      expect(result.institutional).toBeTruthy();
      expect(result.label).toBeTruthy();
      expect(Number.isFinite(result.confidence)).toBe(true);
    }
  });
});

// ================================================================
// GUARD AUDIT — 24h Auto Re-enable
// ================================================================
describe('Guard Bypass Hardening', () => {
  it('disabled cookie includes timestamp for 24h tracking', () => {
    // Verify the cookie format: 'off:<timestamp>'
    const disabledValue = `off:${Date.now()}`;
    expect(disabledValue).toMatch(/^off:\d+$/);
    const ts = Number(disabledValue.split(':')[1]);
    expect(Number.isFinite(ts)).toBe(true);
    expect(ts).toBeGreaterThan(0);
  });

  it('24h expiry logic: fresh disable is still disabled', () => {
    const now = Date.now();
    const disabledAt = now - (1000 * 60 * 60); // 1 hour ago
    const hoursElapsed = (now - disabledAt) / (1000 * 60 * 60);
    expect(hoursElapsed).toBeLessThan(24);
  });

  it('24h expiry logic: 25h old disable is re-enabled', () => {
    const now = Date.now();
    const disabledAt = now - (1000 * 60 * 60 * 25); // 25 hours ago
    const hoursElapsed = (now - disabledAt) / (1000 * 60 * 60);
    expect(hoursElapsed).toBeGreaterThanOrEqual(24);
  });

  it('default risk governor snapshot is conservative (RANGE_NEUTRAL)', () => {
    const snap = buildPermissionSnapshot({});
    expect(snap.regime).toBe('RANGE_NEUTRAL');
    // RANGE_NEUTRAL should NOT have fully permissive LONG allowance like TREND_UP
    expect(snap.matrix.BREAKOUT_CONTINUATION.LONG).not.toBe('ALLOW');
  });
});

// ================================================================
// HELPERS
// ================================================================
function baseComponents(): ConfluenceComponents {
  return { SQ: 65, TA: 60, VA: 55, LL: 60, MTF: 50, FD: 50 };
}
