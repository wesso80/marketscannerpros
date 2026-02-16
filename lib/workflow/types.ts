export type AssetClass = 'equity' | 'crypto' | 'forex' | 'commodities' | 'options' | 'mixed';
export type Direction = 'long' | 'short' | 'neutral';

export type WorkflowEventType =
  | 'operator.session.started'
  | 'operator.context.updated'
  | 'signal.created'
  | 'signal.updated'
  | 'candidate.created'
  | 'candidate.promoted'
  | 'candidate.evaluated'
  | 'trade.plan.created'
  | 'trade.plan.updated'
  | 'trade.executed'
  | 'trade.updated'
  | 'trade.closed'
  | 'journal.draft.created'
  | 'journal.updated'
  | 'journal.completed'
  | 'coach.analysis.generated'
  | 'strategy.rule.suggested'
  | 'strategy.rule.applied'
  | 'label.explicit.created'
  | 'trade.story.generated';

export interface MSPEvent<TPayload = unknown> {
  event_id: string;
  event_type: WorkflowEventType;
  event_version: number;
  occurred_at: string;
  actor: {
    actor_type: 'user' | 'system';
    user_id?: string | null;
    anonymous_id?: string | null;
    session_id?: string | null;
  };
  context: {
    tenant_id: string;
    app: { name: string; env: 'dev' | 'staging' | 'prod'; build?: string };
    page?: { route?: string; module?: string };
    device?: { platform?: string; ua?: string };
    geo?: { country?: string; tz?: string };
  };
  entity?: {
    entity_type: 'operator_context' | 'signal' | 'candidate' | 'trade_plan' | 'trade' | 'journal' | 'coach';
    entity_id: string;
    symbol?: string;
    asset_class?: AssetClass;
  };
  correlation: {
    workflow_id: string;
    trace_id?: string;
    parent_event_id?: string | null;
  };
  payload: TPayload;
}

export interface OperatorContext {
  as_of: string;
  market_session: string;
  mood: { label: string; score: number };
  regime: {
    volatility: { label: string; score: number };
    trend: { label: string; score: number };
    liquidity: { label: string; score: number };
  };
  macro?: Record<string, unknown>;
  derivatives?: Record<string, unknown>;
  risk_dna?: Record<string, unknown>;
  news_risk?: Record<string, unknown>;
  adaptive_confidence: number;
  notes?: string;
}

export interface UnifiedSignal {
  signal_id: string;
  created_at: string;
  symbol: string;
  asset_class: AssetClass;
  timeframe: string;
  signal_type: string;
  direction: Direction;
  confidence: number;
  quality_tier?: 'A' | 'B' | 'C' | 'D';
  source: { module: string; submodule?: string; strategy?: string };
  drivers?: Array<{ category: string; name: string; value: unknown; weight?: number; note?: string }>;
  levels?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  operator_context_ref?: { workflow_id: string; operator_context_id: string };
  recommended_actions?: Array<{ action: string; label: string }>;
}

export interface CandidateEvaluation {
  candidate_id: string;
  signal_id: string;
  evaluated_at: string;
  result: 'pass' | 'fail' | 'watch';
  confidence_delta: number;
  final_confidence: number;
  checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; detail: string }>;
  notes?: string;
  suggested_plan?: Record<string, unknown>;
}

export interface TradePlan {
  plan_id: string;
  created_at: string;
  symbol: string;
  asset_class: AssetClass;
  direction: Direction;
  timeframe: string;
  setup: Record<string, unknown>;
  entry: Record<string, unknown>;
  risk: Record<string, unknown>;
  position_sizing?: Record<string, unknown>;
  operator_context_embedded?: Record<string, unknown>;
  links?: Record<string, unknown>;
}

export interface TradePayload {
  trade_id: string;
  plan_id?: string;
  symbol?: string;
  asset_class?: AssetClass;
  direction?: Direction;
  execution?: Record<string, unknown>;
  live?: Record<string, unknown>;
  risk_runtime?: Record<string, unknown>;
  status?: string;
  closed_at?: string;
  realized_pnl?: number;
}

export interface JournalDraft {
  journal_id: string;
  created_at: string;
  symbol: string;
  asset_class: AssetClass;
  side: Direction;
  trade_type: string;
  quantity: number;
  prices: Record<string, unknown>;
  strategy: string;
  tags: string[];
  auto_context?: Record<string, unknown>;
  why_this_trade_auto?: string[];
  user_inputs_required?: Record<string, unknown>;
  links?: Record<string, unknown>;
}

export interface AICoachOutput {
  analysis_id: string;
  created_at: string;
  scope: string;
  inputs?: Record<string, unknown>;
  summary?: Record<string, unknown>;
  findings?: Array<Record<string, unknown>>;
  mistakes?: Array<Record<string, unknown>>;
  recommendations?: Array<Record<string, unknown>>;
  labels_suggested?: Array<Record<string, unknown>>;
  next_actions?: Array<Record<string, unknown>>;
}
