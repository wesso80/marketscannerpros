import {
  computeFlowTradePermission,
  FlowTradePermission,
  FlowTradePermissionInput,
} from './flow-trade-permission';

export type PermissionMatrixInput = FlowTradePermissionInput;

export interface PermissionMatrixOutput {
  permission: 'ALLOW' | 'ALLOW_SMALL' | 'BLOCK';
  requiredTrigger: string;
  detail: FlowTradePermission;
}

export function computePermissionMatrix(input: PermissionMatrixInput): PermissionMatrixOutput {
  const detail = computeFlowTradePermission(input);

  const permission: PermissionMatrixOutput['permission'] = detail.blocked
    ? 'BLOCK'
    : detail.sizeMultiplier < 0.7
      ? 'ALLOW_SMALL'
      : 'ALLOW';

  const requiredTrigger = detail.blocked
    ? 'No-trade: wait for state/quality reset'
    : detail.state === 'ACCUMULATION'
      ? 'Sweep + reclaim confirmation'
      : detail.state === 'POSITIONING'
        ? 'Compression break with follow-through'
        : detail.state === 'LAUNCH'
          ? 'Retest hold / continuation trigger'
          : 'Confirmed reversal trigger';

  return {
    permission,
    requiredTrigger,
    detail,
  };
}
