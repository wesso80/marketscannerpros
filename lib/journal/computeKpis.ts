import { JournalKpisModel, TradeRowModel, BehavioralFlag } from '@/types/journal';
import { isLoss, isWin, toPnlUsd } from '@/lib/journal/tradeMath';

/**
 * Detect behavioral patterns: revenge trading, overtrading, loss chasing
 */
function detectBehavioralFlags(trades: TradeRowModel[]): BehavioralFlag[] {
  const flags: BehavioralFlag[] = [];
  const closed = trades.filter(t => t.status === 'closed' && t.entry?.ts);

  if (closed.length < 3) return flags;

  // Group trades by date
  const byDate: Record<string, TradeRowModel[]> = {};
  for (const t of closed) {
    const day = t.entry.ts.slice(0, 10);
    if (!byDate[day]) byDate[day] = [];
    byDate[day].push(t);
  }

  // Revenge trading: loss followed by another trade within same day
  let revengeCount = 0;
  for (const dayTrades of Object.values(byDate)) {
    const sorted = dayTrades.sort((a, b) => a.entry.ts.localeCompare(b.entry.ts));
    for (let i = 1; i < sorted.length; i++) {
      if (isLoss(sorted[i - 1])) {
        revengeCount++;
      }
    }
  }
  if (revengeCount >= 2) {
    flags.push({
      type: 'revenge_trading',
      severity: revengeCount >= 5 ? 'alert' : 'warning',
      message: `${revengeCount} trades entered after a same-day loss — potential revenge trading pattern`,
      occurrences: revengeCount,
    });
  }

  // Overtrading: days with 4+ trades
  let overtradeDays = 0;
  for (const [, dayTrades] of Object.entries(byDate)) {
    if (dayTrades.length >= 4) overtradeDays++;
  }
  if (overtradeDays >= 2) {
    flags.push({
      type: 'overtrading',
      severity: overtradeDays >= 5 ? 'alert' : 'warning',
      message: `${overtradeDays} days with 4+ trades — potential overtrading`,
      occurrences: overtradeDays,
    });
  }

  // Loss chasing: 3+ consecutive losses
  let maxLossStreak = 0;
  let currentStreak = 0;
  for (const t of closed) {
    if (isLoss(t)) {
      currentStreak++;
      maxLossStreak = Math.max(maxLossStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  if (maxLossStreak >= 3) {
    flags.push({
      type: 'loss_chasing',
      severity: maxLossStreak >= 5 ? 'alert' : 'warning',
      message: `${maxLossStreak} consecutive losses detected — review entry discipline`,
      occurrences: maxLossStreak,
    });
  }

  return flags;
}

/**
 * @param trades - All journal trade rows
 * @param startingEquity - User's starting account equity (from portfolio_performance or user input).
 *                         Defaults to 0 so equity = pure realized + unrealized P&L.
 */
export function computeKpis(trades: TradeRowModel[], startingEquity = 0): JournalKpisModel {
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

  const equity = startingEquity + realizedPnl30d + unrealizedPnlOpen;

  const behavioralFlags = detectBehavioralFlags(trades);

  return {
    equity,
    realizedPnl30d,
    unrealizedPnlOpen,
    winRate30d,
    profitFactor30d,
    maxDrawdown90d: maxDrawdown,
    behavioralFlags,
  };
}
