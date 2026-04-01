export type PermissionState = "GO" | "WAIT" | "BLOCK";
export type BiasState = "LONG" | "SHORT" | "NEUTRAL";

export type AdminSymbolIntelligence = {
  symbol: string;
  timeframe: string;
  session: string;
  price: number;
  changePercent: number;
  bias: BiasState;
  regime: string;
  permission: PermissionState;
  confidence: number;
  symbolTrust: number;
  sizeMultiplier: number;
  lastScanAt: string;
  blockReasons: string[];
  penalties: string[];
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
};

export type ScannerHit = {
  symbol: string;
  bias: BiasState;
  regime: string;
  permission: PermissionState;
  confidence: number;
  symbolTrust: number;
  sizeMultiplier: number;
};

export type SystemHealth = {
  feed: string;
  websocket: string;
  scanner: string;
  cache: string;
  api: string;
};

export type BottomTabKey =
  | "signals"
  | "logs"
  | "news"
  | "options"
  | "notes"
  | "audit"
  | "ai";
