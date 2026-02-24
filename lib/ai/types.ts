// =====================================================
// MSP AI PLATFORM - TYPE DEFINITIONS
// Shared types for the AI infrastructure
// =====================================================

// ===== EVENT TYPES =====
export type AIEventType = 
  | 'page_view'
  | 'widget_interaction'
  | 'signal_clicked'
  | 'ai_opened'
  | 'ai_question_asked'
  | 'ai_action_used'
  | 'outcome_logged'
  | 'thumbs_up'
  | 'thumbs_down'
  | 'user_correction';

export interface AIEvent {
  eventType: AIEventType;
  eventData: Record<string, unknown>;
  pageContext?: PageContext;
  sessionId?: string;
}

// ===== PAGE SKILLS =====
export type PageSkill = 
  | 'home'
  | 'scanner'
  | 'derivatives'
  | 'options'
  | 'time_confluence'
  | 'portfolio'
  | 'journal'
  | 'deep_analysis'
  | 'watchlist'
  | 'backtest'
  | 'ai_analyst'
  | 'market_movers'
  | 'macro'
  | 'earnings'
  | 'commodities';

export interface PageContext {
  name: PageSkill;
  symbols?: string[];
  timeframes?: string[];
  activeFilters?: Record<string, unknown>;
  visiblePanels?: string[];
}

// ===== USER CONTEXT =====
export interface UserContext {
  tier: 'free' | 'pro' | 'pro_trader';
  riskProfile: 'conservative' | 'medium' | 'aggressive';
  preferredAssets: string[];
  preferredTimeframes: string[];
  tradingStyle: 'scalp' | 'day' | 'swing' | 'position';
  responseVerbosity: 'brief' | 'balanced' | 'detailed';
}

// ===== MARKET STATE =====
export interface MarketState {
  regime: 'risk-on' | 'risk-off' | 'neutral' | 'transitioning';
  volatility: 'low' | 'normal' | 'elevated' | 'extreme';
  fearGreedIndex: number;
  btcDominance?: number;
  marketCap?: number;
  trending?: string[];
}

// ===== UNIFIED CONTEXT OBJECT =====
export interface UnifiedAIContext {
  user: UserContext;
  page: PageContext;
  marketState: MarketState;
  pageData: Record<string, unknown>;
  history: {
    recentActions: RecentAction[];
    watchlist: string[];
    openTrades: OpenTrade[];
    recentQuestions: string[];
  };
  timestamp: string;
}

export interface RecentAction {
  type: string;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface OpenTrade {
  symbol: string;
  direction: 'long' | 'short';
  entryPrice: number;
  currentPrice?: number;
  pnlPercent?: number;
  openedAt: string;
}

// ===== AI TOOLS =====
export type AIToolName = 
  | 'create_alert'
  | 'add_to_watchlist'
  | 'remove_from_watchlist'
  | 'summarize_signal'
  | 'generate_trade_plan'
  | 'journal_trade'
  | 'risk_position_size'
  | 'run_backtest'
  | 'explain_metric'
  | 'compare_assets'
  | 'get_market_context';

// Tool permission policy - defines safety level and limits
export type ToolSideEffect = 'read' | 'write' | 'heavy';
export type ToolCostLevel = 'free' | 'low' | 'medium' | 'high';

export interface ToolPolicy {
  sideEffect: ToolSideEffect;
  requiresConfirmation: boolean;
  rateLimitPerMinute: number;
  rateLimitPerHour: number;
  costLevel: ToolCostLevel;
  cacheable: boolean;
  cacheTTLSeconds?: number;
}

export interface AITool {
  name: AIToolName;
  description: string;
  parameters: Record<string, unknown>;
  allowedSkills: PageSkill[];
  // Enhanced policy
  policy: ToolPolicy;
  /** @deprecated Use policy.requiresConfirmation instead */
  requiresConfirmation?: boolean;
}

export interface AIToolCall {
  tool: AIToolName;
  parameters: Record<string, unknown>;
  result?: unknown;
  error?: string;
  dryRun?: boolean;
}

// ===== IDEMPOTENCY & ACTION TRACKING =====
export type ActionStatus = 'pending' | 'confirmed' | 'executed' | 'failed' | 'cancelled';

export interface AIActionRequest {
  tool: AIToolName;
  parameters: Record<string, unknown>;
  idempotencyKey: string;
  responseId?: string;
  dryRun?: boolean;
  initiatedBy: 'user' | 'ai';
}

export interface AIActionResult {
  actionId: string;
  idempotencyKey: string;
  status: ActionStatus;
  requiresConfirmation: boolean;
  dryRunResult?: unknown;
  executedResult?: unknown;
  error?: string;
}

// ===== COPILOT TABS =====
export type CopilotTab = 'explain' | 'plan' | 'act' | 'learn';

export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: AIToolCall[];
  sources?: string[];
  timestamp: string;
}

export interface CopilotState {
  isOpen: boolean;
  activeTab: CopilotTab;
  messages: CopilotMessage[];
  isLoading: boolean;
  pendingAction?: PendingAction;
}

export interface PendingAction {
  tool: AIToolName;
  parameters: Record<string, unknown>;
  description: string;
  requiresConfirmation: boolean;
  idempotencyKey: string;
}

// ===== CONTEXT VERSIONING =====
export const CONTEXT_VERSION = 'v1';
export const SKILL_VERSION_PREFIX = '1.0';

export interface VersionedContext {
  contextVersion: string;
  skillVersion: string;
  timestamp: string;
}

// ===== CONFIDENCE STANDARDS =====
export type ConfidenceType = 'model_calibrated' | 'heuristic' | 'ranking_score' | 'composite';
export type ConfidenceHorizon = '1h' | '4h' | '24h' | 'next_session' | '5d' | 'indefinite';

export interface ConfidenceMetadata {
  value: number;           // 0-100
  type: ConfidenceType;
  horizon: ConfidenceHorizon;
  components?: {
    name: string;
    weight: number;
    value: number;
  }[];
  calibrationNote?: string;  // e.g., "Based on historical backtest accuracy"
}

// ===== LEARNING SIGNAL LABELS =====
export type LabelType = 'implicit' | 'explicit' | 'outcome';
export type LabelStrength = 'weak' | 'medium' | 'strong';

export interface LearningLabel {
  type: LabelType;
  strength: LabelStrength;
  signal: 'positive' | 'negative' | 'neutral';
  source: string;         // e.g., "thumbs_up", "action_executed", "trade_profitable"
  responseId?: string;
  timestamp: string;
}

// ===== RETRIEVAL METADATA =====
export interface RetrievalMetadata {
  retrievedDocIds: string[];
  retrievedSnippetsHash: string;
  retrievalQuery: string;
  retrievalLatencyMs: number;
  documentsConsidered: number;
  documentsUsed: number;
}

// ===== USER MEMORY =====
export interface UserMemory {
  preferredTimeframes: string[];
  preferredAssets: string[];
  riskProfile: 'conservative' | 'medium' | 'aggressive';
  maxRiskPerTrade: number;
  favoredSetups: string[];
  tradingStyle: 'scalp' | 'day' | 'swing' | 'position';
  typicalHoldTime: string;
  responseVerbosity: 'brief' | 'balanced' | 'detailed';
  showEducationalContent: boolean;
  autoSuggestActions: boolean;
  mostUsedFeatures: string[];
  commonScanFilters: Record<string, unknown>;
  downvotedTopics: string[];
}

// ===== AI RESPONSE =====
export interface AIResponse {
  id: string;
  content: string;
  toolCalls: AIToolCall[];
  sources: string[];
  suggestedActions: SuggestedAction[];
  confidence?: ConfidenceMetadata;
  model: string;
  tokensUsed: number;
  tokenPrompt?: number;
  tokenCompletion?: number;
  latencyMs: number;
  // Versioning
  contextVersion: string;
  skillVersion: string;
  inputHash: string;
  // Retrieval
  retrieval?: RetrievalMetadata;
}

export interface SuggestedAction {
  label: string;
  tool: AIToolName;
  parameters: Record<string, unknown>;
  priority: 'high' | 'medium' | 'low';
  idempotencyKey: string;
}

// ===== FEEDBACK =====
export type FeedbackType = 'thumbs_up' | 'thumbs_down' | 'correction' | 'flag';
export type FeedbackReason = 
  | 'helpful'
  | 'accurate'
  | 'too_long'
  | 'too_vague'
  | 'wrong_data'
  | 'not_actionable'
  | 'outdated'
  | 'inappropriate';

export interface AIFeedback {
  responseId: string;
  feedbackType: FeedbackType;
  feedbackReason?: FeedbackReason;
  correctionText?: string;
}

// ===== INLINE EXPLAIN =====
export interface ExplainRequest {
  metricId: string;
  metricName: string;
  metricValue: unknown;
  context: Record<string, unknown>;
  skill: PageSkill;
}

export interface ExplainResponse {
  explanation: string;
  whyItMatters: string;
  actionableInsight?: string;
  relatedMetrics?: string[];
  learnMoreUrl?: string;
}

// ===== SKILL CONFIGURATION =====
export interface SkillConfig {
  skill: PageSkill;
  displayName: string;
  allowedTools: AIToolName[];
  systemPromptAddition: string;
  retrievalCategories: string[];
  maxTokens: number;
}

export const SKILL_CONFIGS: Record<PageSkill, SkillConfig> = {
  home: {
    skill: 'home',
    displayName: 'Home Dashboard',
    allowedTools: ['get_market_context', 'add_to_watchlist'],
    systemPromptAddition: 'Focus on market overview and regime context. Provide educational insights for newer traders.',
    retrievalCategories: ['methodology', 'market_regime'],
    maxTokens: 500,
  },
  scanner: {
    skill: 'scanner',
    displayName: 'Market Scanner',
    allowedTools: ['create_alert', 'add_to_watchlist', 'summarize_signal', 'explain_metric'],
    systemPromptAddition: 'Help users understand scan results and signal strength. Explain what makes a signal actionable.',
    retrievalCategories: ['signals', 'methodology'],
    maxTokens: 600,
  },
  derivatives: {
    skill: 'derivatives',
    displayName: 'Derivatives Dashboard',
    allowedTools: ['create_alert', 'add_to_watchlist', 'explain_metric', 'generate_trade_plan'],
    systemPromptAddition: 'Expert on derivatives data: Open Interest, Funding Rates, Liquidations. Explain positioning and crowding risks.',
    retrievalCategories: ['derivatives', 'methodology'],
    maxTokens: 700,
  },
  options: {
    skill: 'options',
    displayName: 'Options Scanner',
    allowedTools: ['create_alert', 'explain_metric', 'generate_trade_plan', 'risk_position_size'],
    systemPromptAddition: 'Options strategy expert. Consider IV, Greeks, and risk/reward. Always mention max loss and breakevens.',
    retrievalCategories: ['options', 'methodology'],
    maxTokens: 700,
  },
  time_confluence: {
    skill: 'time_confluence',
    displayName: 'Time Confluence',
    allowedTools: ['create_alert', 'add_to_watchlist', 'explain_metric'],
    systemPromptAddition: 'Explain Time Confluence methodology clearly. Focus on session overlaps and decompression timing.',
    retrievalCategories: ['time_confluence', 'methodology'],
    maxTokens: 600,
  },
  portfolio: {
    skill: 'portfolio',
    displayName: 'Portfolio Manager',
    allowedTools: ['journal_trade', 'risk_position_size', 'create_alert'],
    systemPromptAddition: 'Focus on portfolio health, risk management, correlation, and position sizing. Warn about concentration risks.',
    retrievalCategories: ['portfolio', 'playbook'],
    maxTokens: 600,
  },
  journal: {
    skill: 'journal',
    displayName: 'Trade Journal',
    allowedTools: ['journal_trade', 'summarize_signal'],
    systemPromptAddition: 'Help with trade journaling, pattern recognition in past trades, and identifying recurring mistakes.',
    retrievalCategories: ['journal', 'playbook'],
    maxTokens: 700,
  },
  deep_analysis: {
    skill: 'deep_analysis',
    displayName: 'Golden Egg Analysis',
    allowedTools: ['create_alert', 'add_to_watchlist', 'generate_trade_plan', 'explain_metric', 'compare_assets'],
    systemPromptAddition: 'Comprehensive analysis assistant. Synthesize technical, fundamental, sentiment, and options data.',
    retrievalCategories: ['methodology', 'signals', 'options'],
    maxTokens: 800,
  },
  watchlist: {
    skill: 'watchlist',
    displayName: 'Watchlist',
    allowedTools: ['add_to_watchlist', 'remove_from_watchlist', 'create_alert', 'compare_assets'],
    systemPromptAddition: 'Help manage and prioritize watchlist. Suggest additions based on user preferences.',
    retrievalCategories: ['signals', 'methodology'],
    maxTokens: 500,
  },
  backtest: {
    skill: 'backtest',
    displayName: 'Strategy Backtester',
    allowedTools: ['run_backtest', 'explain_metric'],
    systemPromptAddition: 'Explain backtest results, metrics like Sharpe ratio, max drawdown. Warn about overfitting.',
    retrievalCategories: ['backtest', 'methodology'],
    maxTokens: 600,
  },
  ai_analyst: {
    skill: 'ai_analyst',
    displayName: 'AI Analyst',
    allowedTools: ['get_market_context', 'explain_metric', 'compare_assets', 'generate_trade_plan'],
    systemPromptAddition: 'General market analysis assistant. Can discuss any topic but stay within educational bounds.',
    retrievalCategories: ['methodology', 'signals', 'market_regime'],
    maxTokens: 800,
  },
  market_movers: {
    skill: 'market_movers',
    displayName: 'Market Mavens',
    allowedTools: ['get_market_context', 'add_to_watchlist', 'explain_metric', 'create_alert'],
    systemPromptAddition: `You are the analyst for the Markets cockpit — the unified institutional decision screen. The user is viewing a ticker with Decision Lens (alignment, confidence, authorization, verdict), options flow (gamma state, market mode, conviction, key strikes, flip zones, liquidity levels), scanner data (direction, score, entry/stop/target), and risk context (vol state, event risk, R-budget). Always reference the ACTUAL DATA provided in pageData — never invent metrics. When the IDL says ALLOW, do not say BLOCKED. Use the exact flow conviction, alignment, and confidence numbers. Structure responses around the data the user is seeing on screen.`,
    retrievalCategories: ['signals', 'methodology', 'market_regime'],
    maxTokens: 1000,
  },
  macro: {
    skill: 'macro',
    displayName: 'Macro Dashboard',
    allowedTools: ['get_market_context', 'explain_metric'],
    systemPromptAddition: 'Explain economic indicators like treasury yields, inflation, unemployment. Discuss market regime implications.',
    retrievalCategories: ['market_regime', 'methodology'],
    maxTokens: 700,
  },
  earnings: {
    skill: 'earnings',
    displayName: 'Earnings Calendar',
    allowedTools: ['get_market_context', 'add_to_watchlist', 'explain_metric'],
    systemPromptAddition: 'Help identify earnings event risk. Warn about options strategies during earnings windows.',
    retrievalCategories: ['options', 'methodology'],
    maxTokens: 600,
  },
  commodities: {
    skill: 'commodities',
    displayName: 'Commodities',
    allowedTools: ['get_market_context', 'explain_metric', 'add_to_watchlist'],
    systemPromptAddition: 'Explain commodity price movements, energy and agriculture markets, and macro correlations.',
    retrievalCategories: ['market_regime', 'signals'],
    maxTokens: 600,
  },
};

// ===== V2 INSTITUTIONAL DECISION TYPES =====

/** Structured decision object included in V2 AI responses */
export interface DecisionObject {
  regime: string;
  riskEnvironment: string;
  volatilityState: string;
  confluenceScore: number;
  authorization: 'AUTHORIZED' | 'CONDITIONAL' | 'BLOCKED';
  throttle: number;
  tradeBias: 'NEUTRAL' | 'CONDITIONAL' | 'VALID' | 'HIGH_CONFLUENCE';
  verdict: 'TRADE_READY' | 'CONDITIONAL' | 'WATCH' | 'NO_TRADE';
  reasonCodes: string[];
}

/** V2 AI response with structured decision metadata */
export interface V2AIResponse {
  content: string;
  decision?: DecisionObject;
  confidence?: ConfidenceMetadata;
  promptMode: 'analyst' | 'pine_script';
}

/** Route mode for dual-mode prompt routing */
export type PromptMode = 'analyst' | 'pine_script';
