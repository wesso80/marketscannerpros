export type OperatorFlowMode = 'OBSERVE' | 'ORIENT' | 'EVALUATE' | 'EXECUTE' | 'MANAGE';

export interface OperatorState {
  symbol: string;
  edge: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  action: 'WAIT' | 'PREP' | 'EXECUTE';
  risk: 'LOW' | 'MODERATE' | 'HIGH';
  next: string;
  mode?: OperatorFlowMode;
  updatedAt?: string;
}

export const OPERATOR_STATE_KEY = 'msp_operator_state_v1';

export const DEFAULT_OPERATOR_STATE: OperatorState = {
  symbol: '—',
  edge: 50,
  bias: 'NEUTRAL',
  action: 'WAIT',
  risk: 'MODERATE',
  next: 'Await symbol selection',
  mode: 'OBSERVE',
};

export function readOperatorState(): OperatorState {
  if (typeof window === 'undefined') return DEFAULT_OPERATOR_STATE;
  try {
    const raw = window.localStorage.getItem(OPERATOR_STATE_KEY);
    if (!raw) return DEFAULT_OPERATOR_STATE;
    const parsed = JSON.parse(raw) as Partial<OperatorState>;
    return {
      ...DEFAULT_OPERATOR_STATE,
      ...parsed,
      edge: Number.isFinite(parsed.edge) ? Number(parsed.edge) : DEFAULT_OPERATOR_STATE.edge,
    };
  } catch {
    return DEFAULT_OPERATOR_STATE;
  }
}

export function writeOperatorState(nextState: Partial<OperatorState>) {
  if (typeof window === 'undefined') return;
  const current = readOperatorState();
  const merged: OperatorState = {
    ...current,
    ...nextState,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(OPERATOR_STATE_KEY, JSON.stringify(merged));
}
