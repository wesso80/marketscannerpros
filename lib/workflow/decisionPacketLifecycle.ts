import { createHash } from 'node:crypto';
import type { WorkflowEventType } from './types';

export type DecisionPacketStatus = 'candidate' | 'planned' | 'alerted' | 'executed' | 'closed';

const STATUS_RANK: Record<DecisionPacketStatus, number> = {
  candidate: 1,
  planned: 2,
  alerted: 3,
  executed: 4,
  closed: 5,
};

export function statusRank(status: DecisionPacketStatus): number {
  return STATUS_RANK[status];
}

export function advanceStatus(
  current: DecisionPacketStatus | null | undefined,
  incoming: DecisionPacketStatus
): DecisionPacketStatus {
  if (!current) return incoming;
  return statusRank(incoming) >= statusRank(current) ? incoming : current;
}

export function statusFromEventType(
  eventType: WorkflowEventType,
  explicitStatus?: unknown
): DecisionPacketStatus | null {
  if (explicitStatus === 'candidate' || explicitStatus === 'planned' || explicitStatus === 'alerted' || explicitStatus === 'executed' || explicitStatus === 'closed') {
    return explicitStatus;
  }

  if (eventType === 'candidate.created' || eventType === 'candidate.promoted' || eventType === 'candidate.evaluated') {
    return 'candidate';
  }
  if (eventType === 'trade.plan.created' || eventType === 'trade.plan.updated') {
    return 'planned';
  }
  if (eventType === 'trade.executed' || eventType === 'trade.updated') {
    return 'executed';
  }
  if (eventType === 'trade.closed') {
    return 'closed';
  }

  return null;
}

function normalizeTimeframeBias(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => item.length > 0)
    .sort();
}

function toRoundedNumber(value: unknown, decimals = 4): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildDecisionPacketFingerprint(input: {
  symbol?: unknown;
  signalSource?: unknown;
  bias?: unknown;
  timeframeBias?: unknown;
  entryZone?: unknown;
  invalidation?: unknown;
  riskScore?: unknown;
}): string {
  const payload = {
    symbol: String(input.symbol || '').trim().toUpperCase(),
    signalSource: String(input.signalSource || '').trim().toLowerCase(),
    bias: String(input.bias || '').trim().toLowerCase(),
    timeframeBias: normalizeTimeframeBias(input.timeframeBias),
    entryZone: toRoundedNumber(input.entryZone, 3),
    invalidation: toRoundedNumber(input.invalidation, 3),
    riskScore: toRoundedNumber(input.riskScore, 1),
  };

  const digest = createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 24);

  return `dpf_${digest}`;
}