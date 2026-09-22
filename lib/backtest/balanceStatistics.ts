import type { BacktestEquityPoint } from './engine';

const DAY_MS = 86_400_000;
const YEAR_DAYS = 365.25;

export interface BacktestStatisticsBasis {
  version: 'realized_balance_v2' | 'marked_balance_v1';
  equity: 'closed_trade_balance' | 'bar_close_mark_to_market';
  sampling: 'calendar_day';
  sourceBarMinutes: number;
  periodsPerYear: number;
  observations: number;
  elapsedDays: number;
  riskFreeRate: 0;
  minimumAcceptableReturn: 0;
  warnings: string[];
}

// Keep the provider's date label. Intraday AV keys use exchange-local wall time,
// so parsing a timezone-less key into the server timezone would shift sessions.
export function balanceDay(date: string): number {
  const label = date.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) throw new Error('Invalid backtest date');
  const time = Date.parse(`${label}T00:00:00Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== label) {
    throw new Error('Invalid backtest date');
  }
  return time / DAY_MS;
}

export function roundedMetric(value: number | null, digits = 2): number | null {
  return value != null && Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

/** Statistics of the realised cash ledger, explicitly NOT marked portfolio risk. */
export function computeBalanceStatistics(curve: BacktestEquityPoint[], initialCapital: number, maxDrawdown: number, sourceBarMinutes = 1440, marked = false) {
  const basis: BacktestStatisticsBasis = {
    version: marked ? 'marked_balance_v1' : 'realized_balance_v2', equity: marked ? 'bar_close_mark_to_market' : 'closed_trade_balance', sampling: 'calendar_day',
    sourceBarMinutes, periodsPerYear: YEAR_DAYS, observations: 0, elapsedDays: 0,
    riskFreeRate: 0, minimumAcceptableReturn: 0,
    warnings: [
      marked ? 'Equity marks open positions at each available bar close including estimated exit costs. Intrabar drawdown, depth and stressed exits remain unobserved.' : 'Balance changes only when trades close. Open-position gains, losses and intrabar drawdowns are excluded; these are not marked portfolio risk statistics.',
      marked ? 'Returns use the final available mark on each provider-labelled day; missing days carry the prior mark. Annualisation uses 365.25 calendar days.' : 'Returns use the last realised balance on each provider-labelled date. Days with no closes, including weekends, carry that balance unchanged; annualisation uses 365.25 calendar days.',
      'Sharpe uses sample standard deviation and a zero risk-free rate; Sortino uses downside squared returns divided by all daily observations and a zero target. Square-root scaling assumes uncorrelated returns.',
    ],
  };
  const unavailable = { sharpeRatio: null, sortinoRatio: null, volatility: null, cagr: null, calmarRatio: null, statisticsBasis: basis };
  if (!curve.length) return unavailable;
  if (sourceBarMinutes > 1440) {
    basis.warnings.push('Annualised statistics are unavailable for multi-day bars: exact daily valuations and bar-end timing are not established.');
    return unavailable;
  }
  const endOfDay = new Map<number, number>();
  for (const point of curve) endOfDay.set(balanceDay(point.date), point.equity);
  const days = [...endOfDay.keys()].sort((a, b) => a - b);
  const elapsedDays = days[days.length - 1] - days[0] + 1;
  basis.elapsedDays = elapsedDays;
  if (elapsedDays > 36_625) throw new Error('Backtest date range exceeds 100 years');
  if (curve.some(point => !Number.isFinite(point.equity) || point.equity <= 0)) {
    basis.warnings.push('Annualised statistics are unavailable because the realised balance reached zero or below.');
    return unavailable;
  }
  const returns: number[] = [];
  let previous = initialCapital;
  for (let day = days[0]; day <= days[days.length - 1]; day++) {
    const current = endOfDay.get(day) ?? previous;
    returns.push(current / previous - 1);
    previous = current;
  }
  basis.observations = returns.length;
  // Do not extrapolate a partial or single-day run to a year.
  if (returns.length < 2) {
    basis.warnings.push('Annualised statistics require at least two calendar days.');
    return unavailable;
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const deviation = Math.sqrt(variance);
  const downside = Math.sqrt(returns.reduce((sum, value) => sum + Math.min(0, value) ** 2, 0) / returns.length);
  const annualReturn = (Math.pow(previous / initialCapital, YEAR_DAYS / elapsedDays) - 1) * 100;
  const cagr = roundedMetric(annualReturn);
  if (returns.length < YEAR_DAYS) basis.warnings.push('Less than one year: annualised figures are extrapolations from a short sample.');
  if (deviation <= 1e-12) basis.warnings.push('Sharpe is unavailable because daily return variance is zero.');
  if (downside <= 1e-12) basis.warnings.push('Sortino is unavailable because the sample has no downside deviation.');
  if (maxDrawdown <= 0) basis.warnings.push('Calmar is unavailable because the sample has no realised drawdown.');
  return {
    sharpeRatio: deviation > 1e-12 ? roundedMetric(mean / deviation * Math.sqrt(YEAR_DAYS)) : null,
    sortinoRatio: downside > 1e-12 ? roundedMetric(mean / downside * Math.sqrt(YEAR_DAYS)) : null,
    volatility: roundedMetric(deviation * Math.sqrt(YEAR_DAYS) * 100),
    cagr,
    calmarRatio: maxDrawdown > 0 && cagr != null ? roundedMetric(annualReturn / maxDrawdown) : null,
    statisticsBasis: basis,
  };
}
