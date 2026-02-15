export type TerminalMode = 'TREND' | 'RANGE' | 'EXPANSION' | 'REVERSAL' | 'TRANSITION' | 'WAIT';

export type AttentionState = 'CALM' | 'BUILDING' | 'ACTIVE' | 'RISK';

export type FocusTarget =
  | 'CHART'
  | 'FLOW'
  | 'STRUCTURE'
  | 'VOLATILITY'
  | 'EXECUTION'
  | 'LEVELS'
  | 'TIMING'
  | 'NEWS';

export type CopilotEventType =
  | 'INFO'
  | 'NOTICE'
  | 'WARNING'
  | 'OPPORTUNITY'
  | 'REGIME_SHIFT'
  | 'FLOW_SHIFT'
  | 'RISK_SPIKE';

export interface CopilotEvent {
  type: CopilotEventType;
  title: string;
  message: string;
  ts: number;
  focus?: FocusTarget[];
  confidence?: number;
}

export interface CopilotPresence {
  terminalMode: TerminalMode;
  attentionState: AttentionState;
  statusLine: string;
  focus: {
    primary: FocusTarget;
    secondary?: FocusTarget;
    intensity: number;
  };
  notes: string[];
  events: CopilotEvent[];
}
