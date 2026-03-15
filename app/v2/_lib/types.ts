/* ═══════════════════════════════════════════════════════════════════════════
   MSP v2 — Shared Type Definitions
   ═══════════════════════════════════════════════════════════════════════════ */

export type RegimePriority = 'trend' | 'range' | 'compression' | 'transition' | 'expansion' | 'risk_off' | 'risk_on';
export type VolRegime = 'compression' | 'neutral' | 'transition' | 'expansion' | 'climax';
export type Bias = 'bullish' | 'bearish' | 'neutral';
export type Verdict = 'TRADE' | 'WATCH' | 'NO_TRADE';
export type LifecycleState = 'DISCOVERED' | 'WATCHING' | 'SETTING_UP' | 'READY' | 'TRIGGERED' | 'ACTIVE' | 'COMPLETED' | 'INVALIDATED';
export type AssetClass = 'equity' | 'crypto' | 'commodity' | 'fx' | 'index';
export type Surface = 'dashboard' | 'scanner' | 'golden-egg' | 'terminal' | 'explorer' | 'research' | 'workspace' | 'backtest';

export interface SymbolIntelligence {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  change: number;
  regimePriority: RegimePriority;
  regimeCompatibility: string[];
  directionalBias: Bias;
  structureQuality: number;
  confluenceScore: number;
  timeAlignment: number;
  confidence: number;
  volatilityState: { regime: VolRegime; persistence: number; bbwp: number };
  optionsInfluence: { flowBias: Bias; gammaContext: string; ivRegime: string; expectedMove: number };
  crossMarketInfluence: { alignment: 'supportive' | 'neutral' | 'headwind'; factors: string[]; adjustedConfidence: number };
  triggerCondition: string;
  invalidation: string;
  targets: number[];
  riskReward: number;
  lifecycleState: LifecycleState;
  verdict: Verdict;
  mspScore: number;
}

export interface JournalEntry {
  id: string;
  symbol: string;
  date: string;
  setupType: string;
  regime: RegimePriority;
  entry: number;
  exit: number | null;
  rr: number | null;
  outcome: 'win' | 'loss' | 'scratch' | 'open';
  notes: string;
}

export interface WatchlistItem {
  symbol: string;
  addedAt: string;
  lifecycleState: LifecycleState;
  alertCondition: string;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  time: string;
  impact: 'high' | 'medium' | 'low';
  symbols: string[];
  category: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  impact: 'high' | 'medium' | 'low';
  forecast: string;
  previous: string;
  category: string;
}
