import type { DecisionPacket } from './types';

type BuildDecisionPacketInput = {
  symbol: string;
  market: DecisionPacket['market'];
  signalSource: string;
  signalScore: number;
  bias: DecisionPacket['bias'];
  timeframeBias: string[];
  entryZone?: number;
  invalidation?: number;
  targets?: number[];
  riskScore: number;
  volatilityRegime?: string;
  operatorFit?: number;
  status?: DecisionPacket['status'];
};

export function createDecisionPacketFromScan(input: BuildDecisionPacketInput): DecisionPacket {
  const createdAt = new Date().toISOString();
  const packetId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `dp_${crypto.randomUUID()}`
    : `dp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  return {
    id: packetId,
    createdAt,
    symbol: input.symbol.toUpperCase(),
    market: input.market,
    signalSource: input.signalSource,
    signalScore: Math.max(1, Math.min(99, Math.round(input.signalScore))),
    bias: input.bias,
    timeframeBias: input.timeframeBias,
    entryZone: input.entryZone,
    invalidation: input.invalidation,
    targets: input.targets,
    riskScore: Math.max(1, Math.min(99, Math.round(input.riskScore))),
    volatilityRegime: input.volatilityRegime,
    operatorFit: input.operatorFit,
    status: input.status || 'candidate',
  };
}
