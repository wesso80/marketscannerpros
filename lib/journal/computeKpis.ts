import { JournalKpisModel, TradeRowModel, BehavioralFlag } from '@/types/journal';
import { isLoss, isWin, toPnlUsd } from '@/lib/journal/tradeMath';

/**
 * Detect behavioral patterns: revenge trading, overtrading, loss chasing
 */
function detectBehavioralFlags(trades: TradeRowModel[]): BehavioralFlag[] {
  const flags: BehavioralFlag[] = [];
  const closed = orderedClosedTrades(trades);

  if (closed.length < 3) return flags;

  // Group trades by date
  const byDate: Record<string, TradeRowModel[]> = {};
  for (const t of closed) {
    const day = t.entry.ts.slice(0, 10);
    if (!byDate[day]) byDate[day] = [];
    byDate[day].push(t);
  }

  // Date-only records cannot establish whether an entry followed a known loss.
  // Do not infer revenge trading from entry order alone.
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
      message: `${maxLossStreak} consecutive losses detected in recorded data`,
      occurrences: maxLossStreak,
    });
  }

  return flags;
}

/** Closed outcomes require a known close time and a finite recorded P&L. */
export function orderedClosedTrades(trades: TradeRowModel[], nowMs = Date.now()): TradeRowModel[] {
  return trades.filter(t => t.status === 'closed' && t.exit?.ts
    && Number.isFinite(t.pnlUsd)
    && Number.isFinite(Date.parse(t.exit.ts)) && Date.parse(t.exit.ts) <= nowMs)
    .sort((a, b) => Date.parse(a.exit!.ts) - Date.parse(b.exit!.ts) || a.id.localeCompare(b.id));
}

/** Periods use close time. Account equity is unknown without an explicit opening balance. */
export function computeKpis(trades: TradeRowModel[], startingEquity: number | null = null, nowMs = Date.now()): JournalKpisModel {
  const closed = orderedClosedTrades(trades, nowMs);
  const since = (days: number) => nowMs - days * 86_400_000;
  const closed30d = closed.filter(t => Date.parse(t.exit!.ts) >= since(30));
  const closed90d = closed.filter(t => Date.parse(t.exit!.ts) >= since(90));
  const open = trades.filter(t => t.status === 'open');
  const sum = (rows: TradeRowModel[]) => rows.reduce((total, t) => total + toPnlUsd(t), 0);
  const realizedPnlTotal = sum(closed);
  const unpricedOpenTrades = open.filter(t => !t.mark || !Number.isFinite(t.pnlUsd)).length;
  const unrealizedPnlOpen = unpricedOpenTrades ? null : sum(open);
  const grossWin = sum(closed30d.filter(isWin));
  const grossLoss = -sum(closed30d.filter(isLoss));
  const profitFactor30d = grossLoss > 0 ? grossWin / grossLoss : null;

  const hasEquity = startingEquity != null && Number.isFinite(startingEquity) && startingEquity > 0;
  let curve = hasEquity ? startingEquity! + sum(closed.filter(t => Date.parse(t.exit!.ts) < since(90))) : 0;
  let peak = curve;
  let maxDrawdown90dUsd = 0;
  let maxDrawdown90d = hasEquity && curve > 0 ? 0 : null;
  for (const trade of closed90d) {
    curve += toPnlUsd(trade);
    peak = Math.max(peak, curve);
    maxDrawdown90dUsd = Math.max(maxDrawdown90dUsd, peak - curve);
    if (maxDrawdown90d != null && peak > 0) maxDrawdown90d = Math.max(maxDrawdown90d, (peak - curve) / peak);
  }
  const averageKnown = (key: 'mfe' | 'mae' | 'rMultiple') => {
    const values = closed30d.map(t => t[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : undefined;
  };
  return {
    equity: hasEquity && unrealizedPnlOpen != null ? startingEquity! + realizedPnlTotal + unrealizedPnlOpen : null,
    realizedPnlTotal,
    realizedPnl30d: sum(closed30d),
    unrealizedPnlOpen,
    unpricedOpenTrades,
    winRate30d: closed30d.length ? closed30d.filter(isWin).length / closed30d.length : null,
    profitFactor30d,
    profitFactorLabel: closed30d.length === 0 ? 'No closed trades' : grossLoss === 0 ? (grossWin > 0 ? 'No losing trades' : 'No gains or losses') : undefined,
    maxDrawdown90d,
    maxDrawdown90dUsd,
    closedTrades30d: closed30d.length,
    excludedClosedTrades: trades.filter(t => t.status === 'closed').length - closed.length,
    avgMfe30d: averageKnown('mfe'),
    avgMae30d: averageKnown('mae'),
    avgR30d: averageKnown('rMultiple'),
    behavioralFlags: detectBehavioralFlags(closed90d),
  };
}
