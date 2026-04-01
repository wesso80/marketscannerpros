/**
 * MSP Operator — Governance Engine
 * Final approval authority before execution.
 * Enforces portfolio-level risk limits, drawdown caps, kill-switch,
 * correlation guardrails, and throttling rules.
 * @internal
 */

import type {
  GovernanceCheckRequest, GovernanceDecision, Permission,
} from '@/types/operator';
import { generateId, nowISO } from './shared';

/* ── Risk Limit Checks ──────────────────────────────────────── */

export function checkGovernance(req: GovernanceCheckRequest): GovernanceDecision {
  const { verdict, portfolioState, riskPolicy, executionEnvironment } = req;
  const blockReasons: string[] = [];
  const throttleReasons: string[] = [];
  const lockouts: string[] = [];

  // ── Kill switch ──
  if (portfolioState.killSwitchActive) {
    blockReasons.push('KILL_SWITCH_ACTIVE');
  }

  // ── Daily loss cap ──
  if (portfolioState.dailyPnl < 0) {
    const dailyLossPct = Math.abs(portfolioState.dailyPnl) / portfolioState.equity;
    if (dailyLossPct >= riskPolicy.maxDailyLossPct) {
      blockReasons.push('DAILY_LOSS_LIMIT_HIT');
      lockouts.push('DAILY_LOSS_LOCKOUT');
    } else if (dailyLossPct >= riskPolicy.maxDailyLossPct * 0.8) {
      throttleReasons.push('DAILY_LOSS_APPROACHING');
    }
  }

  // ── Max drawdown ──
  if (portfolioState.drawdownPct >= riskPolicy.maxDrawdownPct) {
    blockReasons.push('MAX_DRAWDOWN_HIT');
    lockouts.push('DRAWDOWN_LOCKOUT');
  } else if (portfolioState.drawdownPct >= riskPolicy.maxDrawdownPct * 0.8) {
    throttleReasons.push('DRAWDOWN_APPROACHING');
  }

  // ── Open risk cap ──
  if (portfolioState.openRisk >= riskPolicy.maxOpenRiskPct * portfolioState.equity) {
    blockReasons.push('OPEN_RISK_LIMIT_HIT');
  }

  // ── Correlation risk ──
  if (portfolioState.correlationRisk >= riskPolicy.maxCorrelationRisk) {
    throttleReasons.push('CORRELATION_RISK_HIGH');
  }

  // ── Execution environment checks ──
  if (!executionEnvironment.brokerConnected) {
    blockReasons.push('BROKER_DISCONNECTED');
  }
  if (!executionEnvironment.minLiquidityOk) {
    throttleReasons.push('LOW_MARKET_LIQUIDITY');
  }
  if (executionEnvironment.estimatedSlippageBps > 50) {
    throttleReasons.push('HIGH_SLIPPAGE_EXPECTED');
  }

  // ── Compute final permission ──
  let finalPermission: Permission;
  let sizeMultiplier: number;

  if (blockReasons.length > 0) {
    finalPermission = 'BLOCK';
    sizeMultiplier = 0;
  } else if (throttleReasons.length > 0) {
    // Downgrade permission by one level
    const originalPerm = verdict.permission;
    if (originalPerm === 'ALLOW') {
      finalPermission = 'ALLOW_REDUCED';
      sizeMultiplier = verdict.sizeMultiplier * 0.5;
    } else if (originalPerm === 'ALLOW_REDUCED') {
      finalPermission = 'WAIT';
      sizeMultiplier = 0;
    } else {
      finalPermission = originalPerm;
      sizeMultiplier = 0;
    }
  } else {
    finalPermission = verdict.permission;
    sizeMultiplier = verdict.sizeMultiplier;
  }

  return {
    governanceDecisionId: generateId('gov'),
    verdictId: verdict.verdictId,
    timestamp: nowISO(),
    finalPermission,
    sizeMultiplier,
    blockReasons,
    throttleReasons,
    lockouts,
  };
}
