/* ═══════════════════════════════════════════════════════════════════════════
   MSP v3 — ARCA Doctrine Engine — Types
   Defines trading doctrine patterns, playbooks, and outcome tracking.
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── Regime Types (reuse from V2) ─────────────────────────────────────────────

export type Regime = 'trend' | 'range' | 'compression' | 'transition' | 'expansion';

export type DoctrineId =
  | 'compression_breakout'
  | 'trend_continuation'
  | 'trend_pullback'
  | 'liquidity_sweep_reversal'
  | 'range_fade'
  | 'gamma_pin'
  | 'gamma_squeeze'
  | 'momentum_burst'
  | 'mean_reversion'
  | 'vol_expansion_breakout';

export type PlaybookId = DoctrineId;

// ─── Doctrine Definition ──────────────────────────────────────────────────────

export interface DoctrineRule {
  /** Unique identifier */
  id: DoctrineId;
  /** Human-readable label */
  label: string;
  /** Short description */
  description: string;
  /** Which regimes this doctrine thrives in */
  compatibleRegimes: Regime[];
  /** Which regimes kill this setup */
  adverseRegimes: Regime[];
  /** Direction bias */
  direction: 'bullish' | 'bearish' | 'either';
  /** Setup category for grouping */
  category: 'breakout' | 'reversal' | 'continuation' | 'squeeze' | 'mean_reversion';
}

// ─── Playbook (extends doctrine with trade plan) ──────────────────────────────

export interface Playbook extends DoctrineRule {
  /** Entry criteria checklist */
  entryCriteria: string[];
  /** Confluence requirements (min thresholds) */
  confluenceRequirements: {
    minConfluence?: number;
    minConfidence?: number;
    minTimeAlignment?: number;
    requireOptionsFlow?: boolean;
    requireDveState?: string[];
  };
  /** Risk management template */
  riskModel: {
    stopDescription: string;
    targetDescription: string;
    defaultRR: number;
  };
  /** Expected outcome characteristics */
  expectedProfile: {
    avgHoldingPeriod: string;
    typicalMove: string;
  };
  /** What invalidates this setup */
  failureSignals: string[];
}

// ─── Doctrine Classification Result ───────────────────────────────────────────

export interface DoctrineMatch {
  /** Which doctrine was matched */
  doctrineId: DoctrineId;
  /** Confidence in the match (0-100) */
  matchConfidence: number;
  /** Why this doctrine was selected */
  reasons: string[];
  /** Is the current regime compatible? */
  regimeCompatible: boolean;
  /** Full playbook reference */
  playbook: Playbook;
}

// ─── Outcome Tracking ─────────────────────────────────────────────────────────

export interface DoctrineOutcome {
  id: string;
  userId: string;
  symbol: string;
  doctrineId: DoctrineId;
  regime: Regime;
  assetClass: 'equity' | 'crypto' | 'commodity';
  entryPrice: number;
  exitPrice: number;
  entryDate: string;
  exitDate: string;
  side: 'long' | 'short';
  outcome: 'win' | 'loss' | 'breakeven';
  rMultiple: number;
  pnlPct: number;
  confluenceAtEntry: number;
  confidenceAtEntry: number;
  dveStateAtEntry: string;
  holdingDays: number;
  journalTradeId?: string;
}

// ─── Aggregated Stats ─────────────────────────────────────────────────────────

export interface DoctrineStats {
  doctrineId: DoctrineId;
  label: string;
  totalTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number;
  avgRMultiple: number;
  avgHoldingDays: number;
  profitFactor: number;
  /** Per-regime breakdown */
  byRegime: Record<Regime, {
    trades: number;
    winRate: number;
    avgRMultiple: number;
  }>;
  /** Per asset class breakdown */
  byAssetClass: Record<string, {
    trades: number;
    winRate: number;
    avgRMultiple: number;
  }>;
}

export interface PersonalProfile {
  totalTrades: number;
  overallWinRate: number;
  overallAvgRR: number;
  bestDoctrine: DoctrineStats | null;
  worstDoctrine: DoctrineStats | null;
  bestRegime: { regime: Regime; winRate: number; trades: number } | null;
  worstRegime: { regime: Regime; winRate: number; trades: number } | null;
  doctrineStats: DoctrineStats[];
  /** Edge score: consolidated measure of trading edge */
  edgeScore: number;
}
