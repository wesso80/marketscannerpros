/* ─── Markets Page Shared Types ──────────────────────────────────────── */

export type AssetClass = 'equities' | 'crypto' | 'macro' | 'commodities';

export type TickerTab = 'overview' | 'structure' | 'options' | 'flow' | 'news' | 'time';

export interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  previousClose?: number;
  high?: number;
  low?: number;
  open?: number;
  source?: string;
}

export interface FlowData {
  market_mode: 'pin' | 'launch' | 'chop';
  gamma_state: 'Positive' | 'Negative' | 'Mixed';
  bias: 'bullish' | 'bearish' | 'neutral';
  conviction: number;
  dominant_expiry: string;
  pin_strike: number | null;
  key_strikes: Array<{ strike: number; gravity: number; type: string }>;
  flip_zones: Array<{ level: number; direction: string }>;
  liquidity_levels: Array<{ level: number; label: string; prob: number }>;
  most_likely_path: string[];
  risk: string[];
  probability_matrix?: {
    continuation: number;
    pinReversion: number;
    expansion: number;
    regime: string;
  };
  flow_state?: {
    state: string;
    confidence: number;
    bias: string;
    rationale: string[];
    suggestedPlaybook: string;
  };
}

export interface ScannerResult {
  symbol: string;
  score: number;
  direction: 'LONG' | 'SHORT';
  confidence: number;
  setup: string;
  entry: number;
  stop: number;
  target: number;
  rMultiple: number;
  indicators: Record<string, any>;
  levels?: {
    support: number[];
    resistance: number[];
    pivots?: number[];
  };
}

export interface NewsItem {
  title: string;
  source: string;
  publishedAt: string;
  url: string;
  sentiment: { score: number; label: string };
}

export interface EarningsEvent {
  symbol: string;
  name: string;
  reportDate: string;
  estimate?: number;
  actual?: number;
  surprise?: number;
}

export interface EconomicEvent {
  date: string;
  event: string;
  impact: 'high' | 'medium' | 'low';
  actual?: string;
  forecast?: string;
  previous?: string;
}

export interface OptionsData {
  symbol: string;
  iv: number;
  ivRank: number;
  expectedMove: number;
  putCallRatio: number;
  maxPain: number;
  topStrikes: Array<{ strike: number; type: 'call' | 'put'; volume: number; oi: number }>;
  gex?: number;
  dex?: number;
}

export interface TickerContext {
  symbol: string;
  assetClass: AssetClass;
  quote: QuoteData | null;
  scanner: ScannerResult | null;
  flow: FlowData | null;
  options: OptionsData | null;
  news: NewsItem[];
  earnings: EarningsEvent[];
  economic: EconomicEvent[];
  loading: boolean;
}

/* ─── Decision Lens Verdict ─────────────────────────────────────────── */

export type DecisionVerdict = 'tradable' | 'conditional' | 'noise' | 'blocked';

export interface DecisionLensData {
  verdict: DecisionVerdict;
  alignment: number;       // 0-100
  confidence: number;      // 0-100
  authorization: 'ALLOW' | 'ALLOW_REDUCED' | 'BLOCK';
  ruBudget: string;        // e.g. "2.4R remaining"
  bullScenario: string;
  bearScenario: string;
  rMultiple: number;
  volState: string;
  eventRisk: 'low' | 'medium' | 'high';
  liquidityGrade: 'A' | 'B' | 'C' | 'D';
  expectedMove: string;
}
