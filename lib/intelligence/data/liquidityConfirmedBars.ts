// Confirmed-bar semantics for the Liquidity Transmission live layer.
//
// Pine reads cross-asset returns via request.security(..., "D"|"M", ...) with
// ta.roc(close, N)[1] — i.e. the ROC computed on the PREVIOUS confirmed HTF bar.
// From EOD provider data (Alpha Vantage / FRED daily; CoinGecko daily), the
// "previous confirmed daily close" is the last bar whose date is strictly
// before the current calendar day (UTC). Any bar dated today is treated as
// still forming and dropped, even if the provider has already published a
// pre-close value. Missing values are propagated as null (Pine `na`).
//
// Monthly returns are derived deterministically from the daily series by taking
// the last EOD close of each completed calendar month. The current calendar
// month is always excluded (the monthly bar has not closed).

export interface DailyBar { date: string; close: number }

/** YYYY-MM-DD in UTC. */
export function isoDay(t: Date | string = new Date()): string {
  return (typeof t === 'string' ? new Date(t) : t).toISOString().slice(0, 10);
}
/** YYYY-MM in UTC. */
export function isoMonth(t: Date | string = new Date()): string {
  return isoDay(t).slice(0, 7);
}

/**
 * Return bars strictly before `todayIso` (UTC ISO date). Filters out non-finite
 * closes and enforces ascending date order. Never mutates the input.
 */
export function confirmedDailyBars(bars: DailyBar[], todayIso: string = isoDay()): DailyBar[] {
  const out: DailyBar[] = [];
  for (const b of bars) {
    if (!b || !Number.isFinite(b.close)) continue;
    if (typeof b.date !== 'string' || b.date.length < 10) continue;
    const day = b.date.slice(0, 10);
    if (day >= todayIso) continue;
    out.push({ date: day, close: b.close });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

/**
 * Reduce a confirmed-daily series to one entry per COMPLETED calendar month:
 * the last EOD close of that month. Drops the current calendar month.
 */
export function monthlyClosesFromDaily(
  dailyBars: DailyBar[], nowMonth: string = isoMonth(),
): { month: string; close: number }[] {
  const byMonth = new Map<string, DailyBar>();
  for (const b of dailyBars) {
    const m = b.date.slice(0, 7);
    if (m >= nowMonth) continue;               // current month not yet completed
    const prev = byMonth.get(m);
    if (!prev || b.date > prev.date) byMonth.set(m, b);
  }
  return [...byMonth.entries()]
    .map(([month, b]) => ({ month, close: b.close }))
    .sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0));
}

/** Pine ta.roc(close, n) = 100 * (close / close[n] - 1). Null if insufficient. */
export function rocFromCloses(closes: number[], n: number): number | null {
  if (n <= 0 || closes.length <= n) return null;
  const cur = closes[closes.length - 1];
  const past = closes[closes.length - 1 - n];
  if (!Number.isFinite(cur) || !Number.isFinite(past) || past === 0) return null;
  return 100 * (cur / past - 1);
}

/**
 * Pine ta.roc(close, n)[1] on a HTF context with lookahead_on. From EOD daily
 * bars filtered to strictly-past days, the last bar IS the previous confirmed
 * daily bar, so the [1]-offset ROC computed at "now" equals the plain n-period
 * ROC of the confirmed series.
 */
export function dailyRocFromConfirmed(confirmedDaily: DailyBar[], n: number): number | null {
  return rocFromCloses(confirmedDaily.map((b) => b.close), n);
}

/** Pine ta.roc(close, 1)[1] on M context = last completed month's return. */
export function monthlyRoc1FromDaily(
  confirmedDaily: DailyBar[], nowMonth: string = isoMonth(),
): number | null {
  const months = monthlyClosesFromDaily(confirmedDaily, nowMonth);
  return rocFromCloses(months.map((m) => m.close), 1);
}

/**
 * Combined Pine pack for one asset: monthly roc(1)[1], daily roc(20)[1],
 * daily roc(5)[1]. `nowIso` should be a stable "as-of" ISO timestamp so all
 * assets share the same forming-day cutoff.
 */
export interface ConfirmedAssetPack {
  m1: number | null;
  r20: number | null;
  r5: number | null;
  latestDaily: string | null;
  latestMonthly: string | null;
  dailyCount: number;
  monthlyCount: number;
}

export function buildConfirmedAssetPack(
  bars: DailyBar[] | null | undefined, nowIso: string = new Date().toISOString(),
): ConfirmedAssetPack {
  if (!bars || bars.length === 0) {
    return { m1: null, r20: null, r5: null, latestDaily: null, latestMonthly: null, dailyCount: 0, monthlyCount: 0 };
  }
  const todayIso = nowIso.slice(0, 10);
  const nowMonth = nowIso.slice(0, 7);
  const daily = confirmedDailyBars(bars, todayIso);
  const months = monthlyClosesFromDaily(daily, nowMonth);
  return {
    m1: rocFromCloses(months.map((m) => m.close), 1),
    r20: dailyRocFromConfirmed(daily, 20),
    r5: dailyRocFromConfirmed(daily, 5),
    latestDaily: daily.length ? daily[daily.length - 1].date : null,
    latestMonthly: months.length ? months[months.length - 1].month : null,
    dailyCount: daily.length,
    monthlyCount: months.length,
  };
}
