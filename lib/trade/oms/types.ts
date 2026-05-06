// OMS / broker abstraction. Personal-execution platform foundation.
//
// Hard rules baked into types here:
//  - No live broker adapter ships in this commit. Only `paper` is enabled.
//  - All adapters MUST surface fills via `onFill` so the OMS can persist them.
//  - All orders carry a clientOrderId for idempotency.

export type Side = 'BUY' | 'SELL';
export type OrderType = 'MKT' | 'LMT' | 'STP' | 'BRACKET';
export type OrderStatus =
  | 'PENDING'
  | 'SUBMITTED'
  | 'WORKING'
  | 'PARTIAL'
  | 'FILLED'
  | 'CANCELED'
  | 'REJECTED';

export interface OrderRequest {
  clientOrderId: string;
  account: string;
  symbol: string;
  side: Side;
  qty: number;
  type: OrderType;
  limitPrice?: number;
  stopPrice?: number;
  /** For BRACKET: take-profit and stop-loss attached at submission. */
  tpPrice?: number;
  slPrice?: number;
  meta?: Record<string, unknown>;
}

export interface OrderState extends OrderRequest {
  id: number;
  broker: string;
  status: OrderStatus;
  filledQty: number;
  avgFillPrice: number | null;
  rejectReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Fill {
  clientOrderId: string;
  symbol: string;
  side: Side;
  qty: number;
  price: number;
  ts: number;
  liquidity?: 'maker' | 'taker' | 'unknown';
}

export interface BrokerPosition {
  symbol: string;
  qty: number;          // signed: + long, - short
  avgPrice: number;
  unrealizedPnl?: number;
}

export interface BrokerAccount {
  id: string;
  cashBalance: number;
  buyingPower: number;
  currency: string;
}

export interface BrokerAdapter {
  readonly name: string;
  readonly mode: 'paper' | 'live';

  getAccount(accountId: string): Promise<BrokerAccount>;
  getPositions(accountId: string): Promise<BrokerPosition[]>;

  placeOrder(req: OrderRequest): Promise<OrderState>;
  cancelOrder(clientOrderId: string): Promise<OrderState>;

  /** Subscribe to fills for the OMS persistence loop. */
  onFill(handler: (fill: Fill) => void): () => void;
}
