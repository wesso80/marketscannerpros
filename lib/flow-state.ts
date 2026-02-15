import {
  computeInstitutionalFlowState,
  InstitutionalFlowStateInput,
  InstitutionalFlowStateOutput,
} from './institutional-flow-state-engine';

export type FlowStateEngineInput = InstitutionalFlowStateInput;

export interface FlowStateEngineOutput {
  flowState: InstitutionalFlowStateOutput['state'];
  timingQuality: number;
  invalidateLevel: number | null;
  confidence: number;
  detail: InstitutionalFlowStateOutput;
}

export function computeFlowStateEngine(input: FlowStateEngineInput): FlowStateEngineOutput {
  const detail = computeInstitutionalFlowState(input);
  const timingQuality = Number(Math.max(0, Math.min(100, detail.confidence)).toFixed(1));
  const invalidateLevel = typeof detail.nextLiquidity.below === 'number'
    ? detail.nextLiquidity.below
    : typeof detail.nextLiquidity.above === 'number'
      ? detail.nextLiquidity.above
      : null;

  return {
    flowState: detail.state,
    timingQuality,
    invalidateLevel,
    confidence: detail.confidence,
    detail,
  };
}
