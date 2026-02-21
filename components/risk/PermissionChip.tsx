import type { Permission } from '@/lib/risk-governor-hard';

type PermissionChipProps = {
  state: Permission | 'OBSERVE';
  className?: string;
};

function toLabel(state: Permission | 'OBSERVE') {
  if (state === 'ALLOW') return 'COMPLIANT';
  if (state === 'ALLOW_REDUCED') return 'REDUCED';
  if (state === 'ALLOW_TIGHTENED') return 'TIGHT';
  if (state === 'BLOCK') return 'NOT COMPLIANT';
  return 'OBSERVE';
}

function toTone(state: Permission | 'OBSERVE') {
  if (state === 'ALLOW') return 'msp-state-chip--compliant';
  if (state === 'ALLOW_REDUCED') return 'msp-state-chip--reduced';
  if (state === 'ALLOW_TIGHTENED') return 'msp-state-chip--tight';
  if (state === 'BLOCK') return 'msp-state-chip--blocked';
  return 'msp-state-chip--observe';
}

export default function PermissionChip({ state, className = '' }: PermissionChipProps) {
  return <span className={`msp-state-chip ${toTone(state)} ${className}`.trim()}>{toLabel(state)}</span>;
}
