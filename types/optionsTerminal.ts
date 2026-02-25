/* ─── Options Terminal types ─────────────────────────────────────────── */

export interface OptionsContract {
  contractId: string;
  expiration: string;
  strike: number;
  type: 'call' | 'put';
  bid: number;
  ask: number;
  mark: number;
  last: number;
  volume: number;
  openInterest: number;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
  itm: boolean;
  spread: number;
  spreadPct: number;
}

export interface ExpirationMeta {
  date: string;
  dte: number;
  label: string;
  calls: number;
  puts: number;
  totalOI: number;
}

export interface OptionsChainResponse {
  success: boolean;
  symbol: string;
  underlyingPrice: number;
  expirations: ExpirationMeta[];
  contracts: OptionsContract[];
  provider: string;
  cachedAt: number;
  error?: string;
}

export type TerminalMode = 'retail' | 'institutional';

export type QuickFilter =
  | 'atm'
  | 'delta25'
  | 'high_oi'
  | 'high_vol';

export interface StrikeGroup {
  strike: number;
  distFromSpot: number;     // percent
  distFromSpotAbs: number;  // absolute
  isAtm: boolean;
  call?: OptionsContract;
  put?: OptionsContract;
}

export interface BestStrike {
  label: string;
  strike: number;
  type: 'call' | 'put';
  reason: string;
  contract?: OptionsContract;
}

export interface IVMetrics {
  avgIV: number;
  ivLevel: 'low' | 'normal' | 'high' | 'extreme';
  expectedMoveAbs: number;
  expectedMovePct: number;
}

export interface OIHeatmapRow {
  strike: number;
  callOI: number;
  putOI: number;
  totalOI: number;
  callVol: number;
  putVol: number;
}

export interface SuggestedPlay {
  title: string;
  description: string;
  condition: string;
  icon: string;
}
