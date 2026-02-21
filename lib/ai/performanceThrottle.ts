// lib/ai/performanceThrottle.ts
// Performance-Linked Risk Throttle — Behavioral Drawdown Discipline
//
// Protects the TRADER, not just the trade.
// Enforces session-level P&L drawdown → governor mode escalation + RU dampening.

export type ThrottleLevel = 'NORMAL' | 'CAUTIOUS' | 'DEFENSIVE' | 'LOCKED';

export interface SessionPerformance {
  /** Current session realized P&L in R-multiples (negative = drawdown) */
  sessionPnlR: number;
  /** Rolling consecutive losses (0 = no streak) */
  consecutiveLosses: number;
  /** Rolling 5-trade win rate 0-1 (optional — used for deeper behavioral signal) */
  rolling5WinRate?: number;
  /** Session max drawdown in R-multiples (most negative P&L reached this session) */
  sessionMaxDrawdownR?: number;
}

export interface PerformanceThrottleResult {
  /** Throttle level — drives governor mode recommendation */
  level: ThrottleLevel;
  /** RU dampener 0-1 (multiplied into ACL throttle) */
  ruDampener: number;
  /** Governor mode recommendation (higher = more restrictive) */
  governorRecommendation: 'NORMAL' | 'THROTTLED' | 'DEFENSIVE' | 'LOCKED';
  /** Human-readable reason codes */
  reasonCodes: string[];
  /** Raw performance metrics used */
  metrics: {
    sessionPnlR: number;
    consecutiveLosses: number;
    rolling5WinRate: number | null;
    sessionMaxDrawdownR: number | null;
  };
}

/**
 * Compute performance-linked throttle from session P&L and behavioral signals.
 *
 * Escalation ladder:
 *   -2R session → CAUTIOUS  (RU × 0.70)
 *   -3R session → DEFENSIVE (RU × 0.50, Governor → DEFENSIVE)
 *   -4R session → LOCKED    (RU × 0.00, Governor → LOCKED)
 *   5+ consecutive losses → RU × 0.60 (regardless of P&L)
 *   3-4 consecutive losses → RU × 0.80
 *
 * The dampener stacks multiplicatively:
 *   e.g., -3R + 4 losses → 0.50 × 0.80 = 0.40 effective RU
 */
export function computePerformanceThrottle(perf: SessionPerformance): PerformanceThrottleResult {
  const reasons: string[] = [];
  let pnlDampener = 1.0;
  let streakDampener = 1.0;
  let level: ThrottleLevel = 'NORMAL';
  let governorRec: PerformanceThrottleResult['governorRecommendation'] = 'NORMAL';

  // === Session P&L Escalation ===
  if (perf.sessionPnlR <= -4) {
    level = 'LOCKED';
    governorRec = 'LOCKED';
    pnlDampener = 0;
    reasons.push(`SESSION_LOCKED: ${perf.sessionPnlR.toFixed(1)}R drawdown ≤ -4R → RU=0`);
  } else if (perf.sessionPnlR <= -3) {
    level = 'DEFENSIVE';
    governorRec = 'DEFENSIVE';
    pnlDampener = 0.50;
    reasons.push(`SESSION_DEFENSIVE: ${perf.sessionPnlR.toFixed(1)}R drawdown ≤ -3R → RU×0.50`);
  } else if (perf.sessionPnlR <= -2) {
    level = 'CAUTIOUS';
    governorRec = 'THROTTLED';
    pnlDampener = 0.70;
    reasons.push(`SESSION_CAUTIOUS: ${perf.sessionPnlR.toFixed(1)}R drawdown ≤ -2R → RU×0.70`);
  }

  // === Loss Streak Dampener ===
  if (perf.consecutiveLosses >= 5) {
    streakDampener = 0.60;
    reasons.push(`LOSS_STREAK_5+: ${perf.consecutiveLosses} consecutive losses → RU×0.60`);
    // Escalate level if not already higher
    if (level === 'NORMAL') level = 'CAUTIOUS';
    if (governorRec === 'NORMAL') governorRec = 'THROTTLED';
  } else if (perf.consecutiveLosses >= 3) {
    streakDampener = 0.80;
    reasons.push(`LOSS_STREAK_3+: ${perf.consecutiveLosses} consecutive losses → RU×0.80`);
    if (level === 'NORMAL') level = 'CAUTIOUS';
  }

  // === Rolling Win Rate Signal (optional behavioral overlay) ===
  if (perf.rolling5WinRate !== undefined && perf.rolling5WinRate < 0.20) {
    // Less than 1 win in last 5 trades — additional dampening
    streakDampener = Math.min(streakDampener, 0.70);
    reasons.push(`LOW_WIN_RATE: ${(perf.rolling5WinRate * 100).toFixed(0)}% < 20% → RU capped ×0.70`);
    if (level === 'NORMAL') level = 'CAUTIOUS';
  }

  // === Composite Dampener (multiplicative) ===
  const ruDampener = Math.max(0, Math.min(1, pnlDampener * streakDampener));

  if (reasons.length === 0) {
    reasons.push('PERFORMANCE_NORMAL: No drawdown or streak issues detected');
  }

  return {
    level,
    ruDampener: Number(ruDampener.toFixed(3)),
    governorRecommendation: governorRec,
    reasonCodes: reasons,
    metrics: {
      sessionPnlR: perf.sessionPnlR,
      consecutiveLosses: perf.consecutiveLosses,
      rolling5WinRate: perf.rolling5WinRate ?? null,
      sessionMaxDrawdownR: perf.sessionMaxDrawdownR ?? null,
    },
  };
}

/**
 * Apply performance throttle to an existing ACL throttle value.
 * Returns the dampened throttle and combined reason codes.
 */
export function applyPerformanceDampener(
  aclThrottle: number,
  perfResult: PerformanceThrottleResult
): { throttle: number; appliedDampener: number; reasonCodes: string[] } {
  const dampened = Math.max(0, Math.min(1, aclThrottle * perfResult.ruDampener));
  return {
    throttle: Number(dampened.toFixed(3)),
    appliedDampener: perfResult.ruDampener,
    reasonCodes: perfResult.reasonCodes,
  };
}
