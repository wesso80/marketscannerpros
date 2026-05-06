// Paper broker. In-memory state, deterministic fills at the next provider tick
// (or immediate fill at estPrice for MKT). Persists every state change to DB.
//
// Goal: end-to-end testable order lifecycle without touching real money.

import { q } from '@/lib/db';
import { audit } from '@/lib/trade/audit';
import type {
  BrokerAccount,
  BrokerAdapter,
  BrokerPosition,
  Fill,
  OrderRequest,
  OrderState,
} from './types';

type FillHandler = (fill: Fill) => void;

const STARTING_CASH = Number(process.env.TRADE_PAPER_STARTING_CASH ?? '100000');

export class PaperBroker implements BrokerAdapter {
  readonly name = 'paper';
  readonly mode = 'paper' as const;
  private fillHandlers: Set<FillHandler> = new Set();
  private positions: Map<string, BrokerPosition> = new Map();
  private cash = STARTING_CASH;

  async getAccount(accountId: string): Promise<BrokerAccount> {
    return { id: accountId, cashBalance: this.cash, buyingPower: this.cash, currency: 'USD' };
  }

  async getPositions(): Promise<BrokerPosition[]> {
    return Array.from(this.positions.values());
  }

  async placeOrder(req: OrderRequest): Promise<OrderState> {
    // Idempotency by clientOrderId.
    const existing = await q<{ id: string }>(
      `SELECT id FROM trade_orders WHERE client_order_id = $1`,
      [req.clientOrderId]
    );
    if (existing.length > 0) {
      const rows = await q<DbOrder>(`SELECT * FROM trade_orders WHERE id = $1`, [existing[0].id]);
      return rowToState(rows[0]);
    }

    const inserted = await q<DbOrder>(
      `INSERT INTO trade_orders
         (client_order_id, broker, account, symbol, side, qty, order_type,
          limit_price, stop_price, tp_price, sl_price, status, meta)
       VALUES ($1,'paper',$2,$3,$4,$5,$6,$7,$8,$9,$10,'SUBMITTED',$11::jsonb)
       RETURNING *`,
      [
        req.clientOrderId,
        req.account,
        req.symbol.toUpperCase(),
        req.side,
        req.qty,
        req.type,
        req.limitPrice ?? null,
        req.stopPrice ?? null,
        req.tpPrice ?? null,
        req.slPrice ?? null,
        JSON.stringify(req.meta ?? {}),
      ]
    );
    const order = inserted[0];

    await audit({
      category: 'order',
      actor: 'broker:paper',
      action: 'SUBMITTED',
      symbol: order.symbol,
      refTable: 'trade_orders',
      refId: Number(order.id),
      payload: { req },
    });

    // MKT fills immediately at the limit_price as a placeholder estPrice.
    // Real adapter would wait for the next tick; we keep this deterministic
    // so tests don't depend on a market data source.
    if (req.type === 'MKT' && req.limitPrice) {
      await this.fill(order.id, req.qty, req.limitPrice);
    }

    const rows = await q<DbOrder>(`SELECT * FROM trade_orders WHERE id = $1`, [order.id]);
    return rowToState(rows[0]);
  }

  async cancelOrder(clientOrderId: string): Promise<OrderState> {
    const rows = await q<DbOrder>(
      `UPDATE trade_orders
          SET status = CASE WHEN status IN ('SUBMITTED','WORKING','PARTIAL') THEN 'CANCELED' ELSE status END,
              updated_at = NOW()
        WHERE client_order_id = $1
        RETURNING *`,
      [clientOrderId]
    );
    if (rows.length === 0) throw new Error('order not found');
    await audit({
      category: 'order',
      actor: 'broker:paper',
      action: 'CANCELED',
      symbol: rows[0].symbol,
      refTable: 'trade_orders',
      refId: Number(rows[0].id),
    });
    return rowToState(rows[0]);
  }

  onFill(handler: FillHandler): () => void {
    this.fillHandlers.add(handler);
    return () => this.fillHandlers.delete(handler);
  }

  private async fill(orderId: string, qty: number, price: number) {
    const updated = await q<DbOrder>(
      `UPDATE trade_orders
          SET filled_qty = filled_qty + $2,
              avg_fill_price = CASE
                WHEN avg_fill_price IS NULL THEN $3
                ELSE ((avg_fill_price * filled_qty) + ($3 * $2)) / (filled_qty + $2)
              END,
              status = CASE WHEN filled_qty + $2 >= qty THEN 'FILLED' ELSE 'PARTIAL' END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING *`,
      [orderId, qty, price]
    );
    const o = updated[0];
    const fill: Fill = {
      clientOrderId: o.client_order_id,
      symbol: o.symbol,
      side: o.side as 'BUY' | 'SELL',
      qty,
      price,
      ts: Date.now(),
      liquidity: 'unknown',
    };
    // Update in-memory position (signed quantity).
    const signed = o.side === 'BUY' ? qty : -qty;
    const cur = this.positions.get(o.symbol) ?? { symbol: o.symbol, qty: 0, avgPrice: 0 };
    const newQty = cur.qty + signed;
    const newAvg = newQty === 0 ? 0 : (cur.avgPrice * cur.qty + price * signed) / newQty;
    if (newQty === 0) this.positions.delete(o.symbol);
    else this.positions.set(o.symbol, { symbol: o.symbol, qty: newQty, avgPrice: newAvg });

    await audit({
      category: 'fill',
      actor: 'broker:paper',
      action: 'FILL',
      symbol: o.symbol,
      refTable: 'trade_orders',
      refId: Number(o.id),
      payload: { ...fill },
    });

    for (const h of this.fillHandlers) {
      try { h(fill); } catch (e) { console.error('[paper] fill handler error', e); }
    }
  }
}

interface DbOrder {
  id: string;
  client_order_id: string;
  broker: string;
  account: string;
  symbol: string;
  side: string;
  qty: string;
  order_type: string;
  limit_price: string | null;
  stop_price: string | null;
  tp_price: string | null;
  sl_price: string | null;
  status: string;
  filled_qty: string;
  avg_fill_price: string | null;
  reject_reason: string | null;
  created_at: Date;
  updated_at: Date;
  meta: Record<string, unknown>;
}

function rowToState(o: DbOrder): OrderState {
  return {
    id: Number(o.id),
    clientOrderId: o.client_order_id,
    broker: o.broker,
    account: o.account,
    symbol: o.symbol,
    side: o.side as 'BUY' | 'SELL',
    qty: Number(o.qty),
    type: o.order_type as OrderState['type'],
    limitPrice: o.limit_price == null ? undefined : Number(o.limit_price),
    stopPrice: o.stop_price == null ? undefined : Number(o.stop_price),
    tpPrice: o.tp_price == null ? undefined : Number(o.tp_price),
    slPrice: o.sl_price == null ? undefined : Number(o.sl_price),
    status: o.status as OrderState['status'],
    filledQty: Number(o.filled_qty),
    avgFillPrice: o.avg_fill_price == null ? null : Number(o.avg_fill_price),
    rejectReason: o.reject_reason,
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    meta: o.meta,
  };
}
