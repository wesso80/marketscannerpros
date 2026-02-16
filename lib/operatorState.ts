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

let lastPulseHash = '';
let lastPulseAt = 0;
const MIN_PULSE_INTERVAL_MS = 4000;

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

  const now = Date.now();
  const payload = {
    current_focus: merged.symbol,
    active_candidates: merged.symbol && merged.symbol !== '—' ? [merged.symbol] : [],
    risk_environment: merged.risk,
    ai_attention_score: merged.edge,
    user_mode: merged.mode || 'OBSERVE',
    cognitive_load: merged.action === 'EXECUTE' ? 72 : merged.action === 'PREP' ? 55 : 35,
    context_state: {
      bias: merged.bias,
      action: merged.action,
      next: merged.next,
      updated_at: merged.updatedAt,
    },
    last_actions: [
      {
        action: merged.action,
        note: merged.next,
        at: merged.updatedAt,
      },
    ],
    source_module: 'operator_state_client',
  };

  const payloadHash = JSON.stringify(payload);
  if (payloadHash === lastPulseHash && now - lastPulseAt < MIN_PULSE_INTERVAL_MS) {
    return;
  }

  lastPulseHash = payloadHash;
  lastPulseAt = now;

  void fetch('/api/operator/state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payloadHash,
    keepalive: true,
  }).catch(() => {});
}
