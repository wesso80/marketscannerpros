/**
 * Admin Terminal — UI-facing types
 * These are serializable subsets of the operator engine types,
 * safe for client components. The API bridge converts real
 * operator output into these shapes.
 */
import type { Permission, Regime, Direction, Playbook } from "@/types/operator";
import type { TruthObject } from "./truth-layer";
import type { EliteGrade } from "@/lib/operator/elite-score";

/* ── Bias is a simplified Direction for the UI ── */
export type BiasState = "LONG" | "SHORT" | "NEUTRAL";

/* ── Permission simplified for admin cards ── */
export type PermissionState = "GO" | "WAIT" | "BLOCK";

/** Map real operator Permission → admin PermissionState */
export function toPermissionState(p: Permission): PermissionState {
  if (p === "ALLOW" || p === "ALLOW_REDUCED") return "GO";
  if (p === "WAIT") return "WAIT";
  return "BLOCK";
}

/** Map real operator Direction → BiasState */
export function toBiasState(d: Direction | undefined): BiasState {
  if (d === "LONG") return "LONG";
  if (d === "SHORT") return "SHORT";
  return "NEUTRAL";
}

/* ── Scanner hit (one row in the live feed) ── */
export type ScannerHit = {
  symbol: string;
  bias: BiasState;
  regime: Regime | string;
  permission: PermissionState;
  confidence: number;
  eliteScore?: number;
  eliteGrade?: EliteGrade;
  setupState?: "DISCOVERED" | "WATCHING" | "TRIGGERED" | "INVALIDATED" | "EXPIRED";
  triggerDistancePct?: number | null;
  riskSource?: "portfolio_journal" | "operator_state" | "fallback";
  symbolTrust: number;
  sizeMultiplier: number;
  playbook?: Playbook | string;
  blockReasons?: string[];
  timestamp?: string;
  expectancy?: {
    symbol: {
      sample: number;
      winRate: number | null;
      avgR: number;
      totalR: number;
      profitFactor: number | null;
      note: string;
    };
    playbook: {
      sample: number;
      winRate: number | null;
      avgR: number;
      totalR: number;
      profitFactor: number | null;
      note: string;
    };
    blendedAvgR: number;
    scoreBoost: number;
  };
};

/* ── Full symbol intelligence payload ── */
export type AdminSymbolIntelligence = {
  symbol: string;
  timeframe: string;
  session: string;
  price: number;
  changePercent: number;
  bias: BiasState;
  regime: Regime | string;
  permission: PermissionState;
  confidence: number;
  eliteScore?: number;
  eliteGrade?: EliteGrade;
  setupState?: "DISCOVERED" | "WATCHING" | "TRIGGERED" | "INVALIDATED" | "EXPIRED";
  triggerDistancePct?: number | null;
  riskSource?: "portfolio_journal" | "operator_state" | "fallback";
  symbolTrust: number;
  sizeMultiplier: number;
  lastScanAt: string;
  blockReasons: string[];
  penalties: string[];
  playbook?: Playbook | string;
  indicators: {
    ema20: number;
    ema50: number;
    ema200: number;
    vwap: number;
    atr: number;
    bbwpPercentile: number;
    adx: number;
    rvol: number;
  };
  dve: {
    state: string;
    direction: string;
    persistence: number;
    breakoutReadiness: number;
    trap: boolean;
    exhaustion: boolean;
  };
  timeConfluence: {
    score: number;
    hotWindow: boolean;
    alignmentCount: number;
    nextClusterAt: string;
  };
  levels: {
    pdh: number;
    pdl: number;
    weeklyHigh: number;
    weeklyLow: number;
    monthlyHigh: number;
    monthlyLow: number;
    midpoint: number;
    vwap: number;
  };
  targets: {
    entry: number;
    invalidation: number;
    target1: number;
    target2: number;
    target3: number;
  };
  /** Evidence breakdown from scoring engine */
  evidence?: {
    regimeFit: number;
    structureQuality: number;
    timeConfluence: number;
    volatilityAlignment: number;
    participationFlow: number;
    crossMarketConfirmation: number;
    eventSafety: number;
    extensionSafety: number;
    symbolTrust: number;
    modelHealth: number;
  };

  /** OHLCV bar data for charting */
  bars?: {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];

  /** Truth Layer — authoritative decision object */
  truth?: TruthObject;
};

/* ── System health ── */
export type SystemHealth = {
  feed: string;
  websocket: string;
  scanner: string;
  cache: string;
  api: string;
  lastScanAt?: string;
  symbolsScanned?: number;
  errorsCount?: number;
};

/* ── Signal outcome (for learning loop) ── */
export type SignalOutcome = {
  signalId: string;
  symbol: string;
  triggeredAt: string;
  regime: string;
  permission: PermissionState;
  score: number;
  mfe: number;
  mae: number;
  outcomeLabel: "SUCCESS" | "FAIL" | "CHOP" | "TRAP";
  horizon15m: number;
  horizon1h: number;
  horizon4h: number;
};

export type BottomTabKey =
  | "signals"
  | "logs"
  | "news"
  | "options"
  | "notes"
  | "audit"
  | "ai";
