import { JournalKpisModel, TradeRowModel } from '@/types/journal';
import { isLoss, isWin, toPnlUsd } from '@/lib/journal/tradeMath';

export function computeKpis(trades: TradeRowModel[]): JournalKpisModel {
  const closed = trades.filter((trade) => trade.status === 'closed');
  const open = trades.filter((trade) => trade.status === 'open');

  const realizedPnl30d = closed.reduce((sum, trade) => sum + toPnlUsd(trade), 0);
  const unrealizedPnlOpen = open.reduce((sum, trade) => sum + toPnlUsd(trade), 0);

  const wins = closed.filter(isWin).length;
  const losses = closed.filter(isLoss).length;
  const winRate30d = closed.length ? wins / closed.length : 0;

  const grossWin = closed.filter(isWin).reduce((sum, trade) => sum + toPnlUsd(trade), 0);
  const grossLossAbs = Math.abs(closed.filter(isLoss).reduce((sum, trade) => sum + toPnlUsd(trade), 0));
  const profitFactor30d = grossLossAbs > 0 ? grossWin / grossLossAbs : grossWin > 0 ? 9.99 : 0;

  const curve = closed.reduce<number[]>((acc, trade) => {
    const next = (acc[acc.length - 1] || 0) + toPnlUsd(trade);
    acc.push(next);
    return acc;
  }, []);
  let peak = 0;
  let maxDrawdown = 0;
  for (const point of curve) {
    peak = Math.max(peak, point);
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, (point - peak) / peak);
    }
  }

  const equity = 100000 + realizedPnl30d + unrealizedPnlOpen;

  return {
    equity,
    realizedPnl30d,
    unrealizedPnlOpen,
    winRate30d,
    profitFactor30d,
    maxDrawdown90d: maxDrawdown,
  };
}
