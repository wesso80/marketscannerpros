import { TradeRowModel } from '@/types/journal';

export function toPnlUsd(trade: TradeRowModel): number {
  return Number(trade.pnlUsd ?? 0);
}

export function toRMultiple(trade: TradeRowModel): number {
  return Number(trade.rMultiple ?? 0);
}

export function isWin(trade: TradeRowModel): boolean {
  return toPnlUsd(trade) > 0;
}

export function isLoss(trade: TradeRowModel): boolean {
  return toPnlUsd(trade) < 0;
}
