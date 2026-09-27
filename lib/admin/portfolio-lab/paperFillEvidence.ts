import type { EdgePacketRow } from '@/lib/admin/edgePacketSnapshots';
import { gateRow, projectCandidate } from './decisionEngine';
import { simulatedFillPrice } from './simulatedOrderEngine';
import type { ArcaPortfolio, ArcaSimOrder } from './types';

export const paperInstrumentKey = (assetClass: string, symbol: string) => `${assetClass}:${symbol}`;

/** Latest evidence wins, including a broken latest row. Never fall back to an older good quote. */
export function latestPaperEvidence(rows: EdgePacketRow[]): Map<string, EdgePacketRow | null> {
  const result = new Map<string, EdgePacketRow | null>();
  const markets = new Map<string, string>();
  const ordered = [...rows].sort((a, b) =>
    (Date.parse(b.generatedAt) || Infinity) - (Date.parse(a.generatedAt) || Infinity) || (b.id ?? 0) - (a.id ?? 0));
  for (const row of ordered) {
    const key = paperInstrumentKey(row.assetClass, row.symbol);
    if (!markets.has(key)) { markets.set(key, row.market); result.set(key, row); }
    // Orders currently carry asset class but no market. Ambiguity must not pick an arbitrary market.
    else if (markets.get(key) !== row.market) result.set(key, null);
  }
  return result;
}

/** Marking and filling both require an observed, positive, current quote. */
export function freshPaperQuote(row: EdgePacketRow | null | undefined, now = Date.now()): { price: number; at: string } | null {
  if (!row) return null;
  const p = row.packetJson;
  const generated = Date.parse(p?.generatedAt ?? '');
  const expires = Date.parse(p?.staleAfter ?? '');
  const at = Date.parse(p?.priceAt ?? '');
  const ttl = Math.min(expires - generated, 15 * 60_000);
  if (![generated, expires, at].every(Number.isFinite) || generated > now || at > now || expires <= now ||
      ttl <= 0 || now - at >= ttl || !Number.isFinite(p.price) || p.price! <= 0) return null;
  return { price: p.price!, at: p.priceAt! };
}

/** Revalidate a pending order without changing its planned levels or manufacturing replacement evidence. */
export function validatePaperFill(order: ArcaSimOrder, row: EdgePacketRow, portfolio: ArcaPortfolio, now = Date.now()):
  { ok: true; fillPrice: number; riskDollars: number; notional: number } | { ok: false; reason: string } {
  const reject = (reason: string) => ({ ok: false as const, reason });
  if (order.workspaceId !== portfolio.workspaceId || order.portfolioId !== portfolio.id ||
      order.symbol !== row.symbol || order.assetClass !== row.assetClass) return reject('order_evidence_scope_mismatch');
  const gates = gateRow(row, portfolio);
  if (gates.length) return reject(gates.join(','));
  const projection = projectCandidate(row, now);
  if (!projection.ok) return reject(projection.reason);
  const c = projection.candidate;
  const side = order.side === 'BUY' || order.side === 'LONG' ? 'LONG' : 'SHORT';
  if (side !== c.side || !order.playbookId || order.playbookId !== row.setupType) return reject('order_thesis_changed');
  const same = (a: number | null, b: number | null) => a === b ||
    (a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(1, Math.abs(b)) * 1e-9);
  if (!same(order.plannedEntry, c.entry) || !same(order.stopLoss, c.stop) || !same(order.takeProfit1, c.tp1) ||
      !same(order.takeProfit2, c.tp2) || !same(order.takeProfit3, c.tp3)) return reject('order_position_levels_changed');
  if (!Number.isFinite(order.quantity) || order.quantity <= 0) return reject('order_quantity_invalid');
  const fillPrice = simulatedFillPrice(portfolio, order, c.currentPrice);
  const sign = side === 'LONG' ? 1 : -1;
  const risk = sign * (fillPrice - c.stop), reward = sign * (c.tp1! - fillPrice);
  const levels = row.packetJson.positionLevels!;
  const minR = Math.max(1.5, Number.isFinite(levels.minRewardR) ? levels.minRewardR : 1.5);
  if (!Number.isFinite(fillPrice) || fillPrice <= 0 || risk <= 0 || reward <= 0 || reward / risk < minR ||
      fillPrice < levels.entryZoneLow! || fillPrice > levels.entryZoneHigh!) return reject('fill_price_outside_position_rules_after_slippage');
  const riskDollars = risk * order.quantity, notional = fillPrice * order.quantity;
  if (!Number.isFinite(riskDollars) || !Number.isFinite(notional) || portfolio.totalEquity <= 0 || !Number.isFinite(portfolio.totalEquity)) return reject('fill_sizing_invalid');
  if (side === 'LONG' && notional > portfolio.currentCash) return reject('fill_cash_insufficient');
  return { ok: true, fillPrice, riskDollars, notional };
}
