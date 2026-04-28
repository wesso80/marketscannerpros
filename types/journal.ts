export type JournalDockKey = 'risk' | 'review' | 'labeling' | 'evidence';

export type TradeAssetClass = 'crypto' | 'equity' | 'options';
export type TradeSide = 'long' | 'short';
export type TradeStatus = 'open' | 'closed';

export type JournalHeaderModel = {
  accountId: string;
  asOfTs: string;
  title?: string;
  mode: 'observe' | 'evaluate' | 'execute' | 'review';
  health: 'ok' | 'degraded' | 'down';
  subtitle: string;
};

export type JournalKpisModel = {
  equity: number;
  realizedPnl30d: number;
  unrealizedPnlOpen: number;
  winRate30d: number;
  profitFactor30d: number;
  maxDrawdown90d: number;
  /** Average Maximum Favorable Excursion (closed trades, 30d) */
  avgMfe30d?: number;
  /** Average Maximum Adverse Excursion (closed trades, 30d) */
  avgMae30d?: number;
  /** Average R-multiple (closed trades, 30d) */
  avgR30d?: number;
  /** Behavioral pattern detection */
  behavioralFlags?: BehavioralFlag[];
};

export type BehavioralFlag = {
  type: 'revenge_trading' | 'overtrading' | 'loss_chasing' | 'win_streak_oversize';
  severity: 'warning' | 'alert';
  message: string;
  occurrences: number;
};

export type FiltersMetaModel = {
  strategyTags: string[];
  symbols: string[];
};

export type TradeSnapshotMini = {
  scanner?: { score: number; quality: 'low' | 'medium' | 'high'; tfAlign: number };
  options?: { permission: 'GO' | 'WAIT' | 'BLOCK'; confidence?: number };
  time?: { grade: number; confidence?: number };
};

export type TradeRowModel = {
  id: string;
  symbol: string;
  assetClass: TradeAssetClass;
  side: TradeSide;
  status: TradeStatus;
  tradeType?: 'Spot' | 'Options' | 'Futures' | 'Margin';
  entry: { price: number; ts: string };
  exit?: { price: number; ts: string };
  qty: number;
  stop?: number;
  targets?: number[];
  pnlUsd?: number;
  pnlPct?: number;
  rMultiple?: number;
  strategyTag?: string;
  notesPreview?: string[];
  lastAiNoteTs?: string;
  snapshots?: TradeSnapshotMini;
  /** Maximum Favorable Excursion — peak unrealized profit during trade */
  mfe?: number;
  /** Maximum Adverse Excursion — worst unrealized drawdown during trade */
  mae?: number;
  /** Market regime at time of entry */
  regime?: string;
};

export type EquityCurvePoint = {
  ts: string;
  value: number;
};

export type EquityCurveModel = {
  points: EquityCurvePoint[];
};

export type JournalDockSummaryModel = {
  openTrades: number;
  missingStops: number;
  missingOutcomes: number;
  reviewQueue: number;
  playbookSamples?: number;
  playbookSampleStatus?: SampleStatus;
  lastLearningTs?: string;
};

export type SampleStatus = 'insufficient' | 'developing' | 'minimum_met';

export type PlaybookExpectancyModel = {
  playbook: string;
  sampleSize: number;
  minSampleSize: number;
  sampleStatus: SampleStatus;
  isMinimumMet: boolean;
  winRate: number;
  winRateCiLow: number;
  winRateCiHigh: number;
  expectancyR: number;
  expectancyCiLow: number;
  expectancyCiHigh: number;
  totalR: number;
  warning: string;
};

export type RiskModuleModel = {
  missingStops: number;
  oversizeFlags: number;
  blocker: string;
};

export type ReviewModuleModel = {
  queue: Array<{ tradeId: string; summary: string }>;
  playbookExpectancy?: PlaybookExpectancyModel[];
};

export type LabelingModuleModel = {
  missingOutcomes: number;
  quickAssign: Array<{ tradeId: string; symbol: string }>;
};

export type EvidenceModuleModel = {
  links: Array<{ tradeId: string; symbol: string; scanner?: boolean; options?: boolean; time?: boolean }>;
};

export type JournalDockModulesModel = {
  risk: RiskModuleModel;
  review: ReviewModuleModel;
  labeling: LabelingModuleModel;
  evidence: EvidenceModuleModel;
};

export type JournalPayload = {
  header: JournalHeaderModel;
  kpis: JournalKpisModel;
  filtersMeta: FiltersMetaModel;
  trades: TradeRowModel[];
  equityCurve?: EquityCurveModel;
  dockSummary: JournalDockSummaryModel;
  dockModules: JournalDockModulesModel;
};

export type TradeSortKey = 'entry_ts' | 'pnl_usd' | 'r_multiple' | 'symbol';
export type SortModel = { key: TradeSortKey; dir: 'asc' | 'desc' };

export type JournalFilters = {
  status: 'open' | 'closed' | 'all';
  symbol?: string;
  strategyTag?: string;
  side?: TradeSide;
  assetClass?: TradeAssetClass;
  regime?: string;
  from?: string;
  to?: string;
  q?: string;
};

export type JournalQueryState = JournalFilters & {
  page: number;
  pageSize: number;
  sortKey: TradeSortKey;
  sortDir: 'asc' | 'desc';
};

export type JournalHeaderActions = {
  onNewTrade: () => void;
  onExport: () => void;
  onImport?: () => void;
  onClear?: () => void;
};

export type TradeModel = TradeRowModel & {
  thesis?: string;
  fees?: number;
  slippage?: number;
};

export type TradeIntelligence = {
  outcome?: 'win' | 'loss' | 'breakeven';
  setupQuality?: 'A' | 'B' | 'C' | 'D';
  followedPlan?: boolean;
  errorType?:
    | 'none'
    | 'entry_early'
    | 'entry_late'
    | 'no_stop'
    | 'oversize'
    | 'ignored_signal'
    | 'bad_liquidity'
    | 'chop'
    | 'news_spike'
    | 'emotion'
    | 'unknown';
  reviewText?: string;
};
