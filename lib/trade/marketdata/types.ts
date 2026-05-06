// Vendor-agnostic market data interface for the personal execution platform.
// Adapters (Databento, mock, future IBKR/Polygon) implement MarketDataProvider.
// Keep this file pure types — no runtime deps.

export type Resolution =
  | '1S'
  | '5S'
  | '15S'
  | '30S'
  | '1'
  | '5'
  | '15'
  | '30'
  | '60'
  | '240'
  | 'D'
  | 'W';

export interface Bar {
  /** Bar open time in epoch ms (UTC). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Volume in contracts/shares. May be 0 for some venues. */
  volume: number;
}

export interface Tick {
  /** Trade time in epoch ms (UTC). */
  time: number;
  price: number;
  size: number;
}

export interface SymbolMeta {
  /** Provider-native id, e.g. "ESM6" or "ES.c.0" continuous. */
  id: string;
  /** Display ticker, e.g. "ES1!". */
  display: string;
  description: string;
  /** Minimum price increment, e.g. 0.25 for ES. */
  tickSize: number;
  /** USD value of one tick, e.g. 12.50 for ES. */
  tickValue: number;
  /** Asset class for routing. */
  assetClass: 'future' | 'equity' | 'option' | 'crypto' | 'fx';
  /** Exchange / venue, e.g. "GLBX.MDP3". */
  exchange: string;
  /** Trading session string in IANA tz, e.g. "America/Chicago 17:00-16:00". */
  sessionTz: string;
  /** ISO currency code. */
  currency: string;
}

export interface BarsRequest {
  symbol: string;
  resolution: Resolution;
  /** Inclusive start, epoch ms. */
  from: number;
  /** Exclusive end, epoch ms. */
  to: number;
  /** Optional max bars cap. */
  limit?: number;
}

export interface BarsResponse {
  symbol: string;
  resolution: Resolution;
  bars: Bar[];
  /** Provider that served the data, for audit. */
  source: string;
  /** Server time the response was produced (epoch ms). */
  fetchedAt: number;
  /** True when no bars exist for the range (vs. empty due to error). */
  noData: boolean;
}

export type TickHandler = (tick: Tick) => void;
export type BarHandler = (bar: Bar, isFinal: boolean) => void;

export interface LiveSubscription {
  unsubscribe: () => void;
}

export interface MarketDataProvider {
  readonly name: string;

  resolveSymbol(input: string): Promise<SymbolMeta | null>;

  getBars(req: BarsRequest): Promise<BarsResponse>;

  /** Optional: tick stream. Throws if provider has no live feed. */
  subscribeTicks?(symbol: string, onTick: TickHandler): Promise<LiveSubscription>;

  /** Optional: server-aggregated bar stream at a resolution. */
  subscribeBars?(
    symbol: string,
    resolution: Resolution,
    onBar: BarHandler
  ): Promise<LiveSubscription>;
}
