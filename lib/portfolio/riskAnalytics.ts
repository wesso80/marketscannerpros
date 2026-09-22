export interface EquitySnapshot { timestamp: string; totalValue: number; basis: string }
export interface ExternalFlow { effective_date: string | Date; entry_type: string; amount: string | number }
export interface PortfolioRiskAnalytics {
  dailySharpe: number | null;
  annualizedSharpe: number | null;
  var95: number | null;
  maxDrawdown: number;
  currentDrawdown: number;
  avgDailyReturn: number;
  dailyVolatility: number;
  annualizedVolatility: number;
  observations: number;
  periodsPerYear: number;
}

const DAY = 86_400_000;
function day(value: string | Date): number { return Date.parse((value instanceof Date ? value.toISOString() : value).slice(0, 10)); }

/**
 * Daily end-of-day cash-flow convention. Link flow-adjusted returns for drawdown,
 * rather than treating deposits/withdrawals as performance. No interpolation
 * across missing days, zero-capital resets or unknown cash-flow history.
 */
export function computePortfolioRisk(
  snapshots: EquitySnapshot[], flows: ExternalFlow[] | null,
): PortfolioRiskAnalytics | null {
  if (flows == null) return null;
  const history = snapshots.filter(s => s.basis === 'account_equity_v2')
    .sort((a, b) => day(a.timestamp) - day(b.timestamp));
  if (history.length < 5 || history.some(s => !Number.isFinite(day(s.timestamp)) || !Number.isFinite(s.totalValue) || s.totalValue <= 0)) return null;
  if (flows.some(f => !Number.isFinite(day(f.effective_date)) || !Number.isFinite(Number(f.amount)) || Number(f.amount) < 0 || !['deposit', 'withdrawal'].includes(f.entry_type))) return null;

  const returns: number[] = [];
  let index = 1;
  let peak = 1;
  let maxDrawdown = 0;
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const current = history[i];
    const prevDay = day(prev.timestamp);
    const currentDay = day(current.timestamp);
    if (currentDay - prevDay !== DAY) return null;
    const netFlow = flows.reduce((sum, f) => {
      const flowDay = day(f.effective_date);
      return flowDay > prevDay && flowDay <= currentDay
        ? sum + Number(f.amount) * (f.entry_type === 'withdrawal' ? -1 : 1) : sum;
    }, 0);
    const result = (current.totalValue - prev.totalValue - netFlow) / prev.totalValue;
    if (!Number.isFinite(result) || result <= -1) return null;
    returns.push(result * 100);
    index *= 1 + result;
    peak = Math.max(peak, index);
    maxDrawdown = Math.max(maxDrawdown, (peak - index) / peak * 100);
  }
  const avg = returns.reduce((a, b) => a + b, 0) / returns.length;
  const std = Math.sqrt(returns.reduce((sum, r) => sum + (r - avg) ** 2, 0) / (returns.length - 1));
  const sorted = [...returns].sort((a, b) => a - b);
  const periodsPerYear = 365.25; // consecutive calendar-day snapshots, including crypto weekends
  const dailySharpe = std > 0 ? avg / std : null; // zero risk-free-rate assumption
  return {
    dailySharpe,
    annualizedSharpe: dailySharpe == null ? null : dailySharpe * Math.sqrt(periodsPerYear),
    var95: returns.length >= 20 ? Math.max(0, -sorted[Math.max(0, Math.ceil(returns.length * 0.05) - 1)]) : null,
    maxDrawdown,
    currentDrawdown: (peak - index) / peak * 100,
    avgDailyReturn: avg,
    dailyVolatility: std,
    annualizedVolatility: std * Math.sqrt(periodsPerYear),
    observations: returns.length,
    periodsPerYear,
  };
}
