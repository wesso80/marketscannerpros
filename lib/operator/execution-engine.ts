/**
 * MSP Operator — Execution Engine
 * Generates order plans from approved verdicts.
 * Handles position sizing, bracket orders, and state management.
 * @internal
 */

import type {
  ExecutionPlanRequest, ExecutionPlan, ManagePositionRequest,
  TargetOrder, OrderType, TimeInForce,
} from '@/types/operator';
import { generateId } from './shared';

/* ── Position Sizing ────────────────────────────────────────── */

function computeQuantity(req: ExecutionPlanRequest): number {
  const { verdict, governanceDecision, accountState, instrumentMeta } = req;
  if (governanceDecision.finalPermission === 'BLOCK' || governanceDecision.finalPermission === 'WAIT') {
    return 0;
  }

  const riskUnit = verdict.riskUnit;
  const riskAmount = accountState.buyingPower * riskUnit * governanceDecision.sizeMultiplier;

  // Risk per share = distance from entry to invalidation
  const entryMid = (verdict.entryPlan?.entryZone.min ?? 0 + (verdict.entryPlan?.entryZone.max ?? 0)) / 2;
  const invalidation = verdict.entryPlan?.invalidationPrice ?? 0;
  const riskPerUnit = Math.abs(entryMid - invalidation);

  if (riskPerUnit <= 0) return 0;

  const rawQty = riskAmount / riskPerUnit;
  // Round to lot size
  const lotSize = instrumentMeta.lotSize || 1;
  return Math.floor(rawQty / lotSize) * lotSize;
}

/* ── Order Construction ─────────────────────────────────────── */

function buildEntryOrder(req: ExecutionPlanRequest): ExecutionPlan['entryOrder'] {
  const entryPlan = req.verdict.entryPlan;
  if (!entryPlan) {
    return { type: 'MARKET' as OrderType, timeInForce: 'DAY' as TimeInForce };
  }

  // Limit order at the edge of the entry zone
  const limitPrice = req.verdict.direction === 'LONG'
    ? entryPlan.entryZone.max
    : entryPlan.entryZone.min;

  return {
    type: 'LIMIT' as OrderType,
    price: limitPrice || null,
    timeInForce: 'DAY' as TimeInForce,
  };
}

function buildStopOrder(req: ExecutionPlanRequest): ExecutionPlan['stopOrder'] {
  const invalidation = req.verdict.entryPlan?.invalidationPrice ?? 0;
  return {
    type: 'STOP' as const,
    stopPrice: invalidation,
  };
}

function buildTargetOrders(req: ExecutionPlanRequest): TargetOrder[] {
  const targets = req.verdict.entryPlan?.targets ?? [];
  if (targets.length === 0) return [];

  // Split quantity across targets
  const perTargetPct = 1 / targets.length;
  return targets.map(price => ({
    price,
    quantityPct: perTargetPct,
  }));
}

/* ── Main Execution Plan ────────────────────────────────────── */

export function buildExecutionPlan(req: ExecutionPlanRequest): ExecutionPlan {
  const quantity = computeQuantity(req);

  return {
    executionPlanId: generateId('exec'),
    verdictId: req.verdict.verdictId,
    symbol: req.verdict.symbol,
    direction: req.verdict.direction,
    orderIntent: 'ENTER',
    quantity,
    entryOrder: buildEntryOrder(req),
    stopOrder: buildStopOrder(req),
    targetOrders: buildTargetOrders(req),
  };
}

/* ── Position Management (post-entry) ───────────────────────── */

export interface ManagePositionResult {
  action: 'HOLD' | 'MOVE_STOP' | 'SCALE_OUT' | 'EXIT';
  newStopPrice?: number;
  scaleOutPct?: number;
  reason: string;
}

export function managePosition(req: ManagePositionRequest): ManagePositionResult {
  const { marketState, managementPolicy } = req;

  // If thesis integrity collapses → exit
  if (marketState.thesisIntegrityScore < 0.3) {
    return { action: 'EXIT', reason: 'THESIS_INTEGRITY_COLLAPSED' };
  }

  // If regime is transitioning aggressively → exit
  if (marketState.regimeTransitionRisk > 0.75) {
    return { action: 'EXIT', reason: 'REGIME_TRANSITION_HIGH' };
  }

  // TODO: implement break-even move and scale-out logic
  // based on managementPolicy.moveStopToBreakEvenAtR and scaleOutLevelsR

  return { action: 'HOLD', reason: 'NO_ACTION_REQUIRED' };
}
