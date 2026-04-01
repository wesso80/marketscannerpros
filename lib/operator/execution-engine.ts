/**
 * MSP Operator — Execution Engine §6.8
 * Generates order plans from approved verdicts.
 * Handles position sizing, bracket orders, idempotency §13.5,
 * and environment mode awareness §13.6.
 * @internal
 */

import type {
  ExecutionPlanRequest, ExecutionPlan, ManagePositionRequest,
  TargetOrder, OrderType, TimeInForce, IdempotencyRecord, EnvironmentMode,
} from '@/types/operator';
import { generateId, hashIntent, ENVIRONMENT_MODE, isLiveExecution } from './shared';

/* ── Idempotency Store §13.5 ───────────────────────────────── */

const idempotencyStore = new Map<string, IdempotencyRecord>();

function buildIdempotencyKey(req: ExecutionPlanRequest): string {
  const raw = [
    req.verdict.verdictId,
    req.verdict.symbol,
    req.verdict.direction,
    req.verdict.playbook,
    String(req.verdict.entryPlan?.entryZone.min ?? 0),
    String(req.verdict.entryPlan?.invalidationPrice ?? 0),
  ].join('|');
  return hashIntent(raw);
}

function buildOrderIntentHash(req: ExecutionPlanRequest, quantity: number): string {
  const raw = [
    req.verdict.symbol,
    req.verdict.direction,
    String(quantity),
    String(req.verdict.entryPlan?.entryZone.max ?? 0),
    String(req.verdict.entryPlan?.invalidationPrice ?? 0),
    req.verdict.entryPlan?.targets.join(',') ?? '',
  ].join('|');
  return hashIntent(raw);
}

/** Check if this exact order intent was already submitted */
export function isDuplicateSubmission(key: string): boolean {
  const existing = idempotencyStore.get(key);
  if (!existing) return false;
  return existing.status === 'PENDING' || existing.status === 'SUBMITTED' || existing.status === 'FILLED';
}

/** Record an idempotency entry after plan creation */
function recordIdempotency(plan: ExecutionPlan): void {
  idempotencyStore.set(plan.idempotencyKey, {
    idempotencyKey: plan.idempotencyKey,
    orderIntentHash: plan.orderIntentHash,
    executionPlanId: plan.executionPlanId,
    submittedAt: new Date().toISOString(),
    status: ENVIRONMENT_MODE === 'RESEARCH' ? 'PENDING' : 'PENDING',
  });
}

/* ── Position Sizing ────────────────────────────────────────── */

function computeQuantity(req: ExecutionPlanRequest): number {
  const { verdict, governanceDecision, accountState, instrumentMeta } = req;
  if (governanceDecision.finalPermission === 'BLOCK' || governanceDecision.finalPermission === 'WAIT') {
    return 0;
  }

  const riskUnit = verdict.riskUnit;
  const riskAmount = accountState.buyingPower * riskUnit * governanceDecision.sizeMultiplier;

  // Risk per share = distance from entry to invalidation
  const entryMid = ((verdict.entryPlan?.entryZone.min ?? 0) + (verdict.entryPlan?.entryZone.max ?? 0)) / 2;
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
  const idempotencyKey = buildIdempotencyKey(req);
  const orderIntentHash = buildOrderIntentHash(req, quantity);

  // §13.5 — prevent duplicate orders
  if (isDuplicateSubmission(idempotencyKey)) {
    // Return zero-quantity plan to signal duplicate
    return {
      executionPlanId: generateId('exec'),
      verdictId: req.verdict.verdictId,
      symbol: req.verdict.symbol,
      direction: req.verdict.direction,
      orderIntent: 'ENTER',
      quantity: 0,
      idempotencyKey,
      orderIntentHash,
      environmentMode: ENVIRONMENT_MODE,
      entryOrder: buildEntryOrder(req),
      stopOrder: buildStopOrder(req),
      targetOrders: [],
    };
  }

  const plan: ExecutionPlan = {
    executionPlanId: generateId('exec'),
    verdictId: req.verdict.verdictId,
    symbol: req.verdict.symbol,
    direction: req.verdict.direction,
    orderIntent: 'ENTER',
    quantity,
    idempotencyKey,
    orderIntentHash,
    environmentMode: ENVIRONMENT_MODE,
    entryOrder: buildEntryOrder(req),
    stopOrder: buildStopOrder(req),
    targetOrders: buildTargetOrders(req),
  };

  // Record for idempotency tracking
  recordIdempotency(plan);

  return plan;
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

  // Break-even stop logic
  if (managementPolicy.moveStopToBreakEvenAtR > 0 && marketState.currentPrice > 0) {
    // If unrealized profit exceeds the break-even R threshold, move stop
    // This is tracked by the position management system
  }

  // Scale-out at defined R-levels
  for (const level of managementPolicy.scaleOutLevelsR) {
    if (level > 0) {
      // Scale-out triggers checked by position manager
    }
  }

  return { action: 'HOLD', reason: 'NO_ACTION_REQUIRED' };
}
