import { dailyToWeekly, dailyToMonthly, weekKey, type DailyBarLike } from './positionLevels';
const DAY = 86_400_000;
export type PositionTrend = {
  version: 'position-trend.v1'; status: 'ok' | 'unavailable'; bias: 'LONG' | 'SHORT' | 'NEUTRAL';
  monthlyBias: 'LONG' | 'SHORT' | 'NEUTRAL'; alignment: 'ALIGNED' | 'CONFLICT' | 'MIXED' | 'UNAVAILABLE';
  dailyAsOf: string | null; weeklyAsOf: string | null; monthlyAsOf: string | null;
  weeklyClose: number | null; weeklySma10: number | null; weeklySma20: number | null; weeklySma20Prior: number | null;
  monthlyClose: number | null; monthlySma3: number | null;
  completedWeeks: number; completedMonths: number; reasons: string[];
};
/** Research rule, not a calibrated predictor: completed-week close / SMA10 / SMA20 + 3-week SMA20 slope;
 * completed-month close / SMA3 + 3-month SMA slope. First partial buckets and current periods excluded. */
export function computePositionTrend(bars: readonly DailyBarLike[], completedThrough: string, nowMs = Date.now()): PositionTrend {
  const base: PositionTrend = { version: 'position-trend.v1', status: 'unavailable', bias: 'NEUTRAL', monthlyBias: 'NEUTRAL', alignment: 'UNAVAILABLE',
    dailyAsOf: null, weeklyAsOf: null, monthlyAsOf: null, weeklyClose: null, weeklySma10: null, weeklySma20: null, weeklySma20Prior: null,
    monthlyClose: null, monthlySma3: null, completedWeeks: 0, completedMonths: 0, reasons: [] };
  const unique = new Map<string, DailyBarLike>();
  for (const b of bars) {
    const date = String(b.timestamp).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || date > completedThrough) continue;
    if (![b.open,b.high,b.low,b.close].every(v => Number.isFinite(v) && v > 0) || b.high < Math.max(b.open,b.close,b.low) || b.low > Math.min(b.open,b.close)) return { ...base, reasons: ['Invalid daily OHLC geometry.'] };
    unique.set(date, { ...b, timestamp: date });
  }
  const daily = [...unique.values()].sort((a,b) => a.timestamp.localeCompare(b.timestamp));
  if (!daily.length) return { ...base, reasons: ['No completed daily history.'] };
  base.dailyAsOf = daily[daily.length - 1].timestamp;
  const age = nowMs - Date.parse(base.dailyAsOf);
  if (age < 0 || age > 7 * DAY) return { ...base, reasons: ['Completed daily history is stale or future dated.'] };
  for (let i=1;i<daily.length;i++) {
    const ratio = daily[i].close / daily[i-1].close;
    if (ratio > 1.6 || ratio < 0.625) return { ...base, reasons: ['Large daily price discontinuity; verify corporate actions or price data before using trend.'] };
    if (Date.parse(daily[i].timestamp) - Date.parse(daily[i-1].timestamp) > 10 * DAY) return { ...base, reasons: ['Daily history contains a gap longer than 10 calendar days.'] };
  }
  const today = new Date(nowMs).toISOString().slice(0,10);
  const weeks = dailyToWeekly(daily).slice(1).filter(w => w.key < weekKey(today));
  const months = dailyToMonthly(daily).slice(1).filter(m => m.key < today.slice(0,7));
  base.completedWeeks = weeks.length; base.completedMonths = months.length;
  base.weeklyAsOf = weeks.at(-1)?.key ?? null; base.monthlyAsOf = months.at(-1)?.key ?? null;
  if (weeks.length < 26 || months.length < 6) return { ...base, reasons: ['Need at least 26 completed weekly bars and 6 completed monthly bars after excluding the first partial period.'] };
  const mean = (values: number[]) => values.reduce((a,b)=>a+b,0)/values.length;
  const wc = weeks.map(w=>w.close); const mc = months.map(m=>m.close);
  const w10 = mean(wc.slice(-10)), w20 = mean(wc.slice(-20)), wPrior = mean(wc.slice(-23,-3));
  const m3 = mean(mc.slice(-3)), mPrior = mean(mc.slice(-6,-3));
  const wLast = wc[wc.length-1], mLast = mc[mc.length-1];
  const bias = wLast > w10 && w10 > w20 && w20 > wPrior ? 'LONG' : wLast < w10 && w10 < w20 && w20 < wPrior ? 'SHORT' : 'NEUTRAL';
  const monthlyBias = mLast > m3 && m3 > mPrior ? 'LONG' : mLast < m3 && m3 < mPrior ? 'SHORT' : 'NEUTRAL';
  return { ...base, status: 'ok', bias, monthlyBias,
    alignment: bias === 'NEUTRAL' || monthlyBias === 'NEUTRAL' ? 'MIXED' : bias === monthlyBias ? 'ALIGNED' : 'CONFLICT',
    weeklyClose: wLast, weeklySma10: w10, weeklySma20: w20, weeklySma20Prior: wPrior, monthlyClose: mLast, monthlySma3: m3,
    reasons: ['Direction uses completed weekly closes, SMA10/SMA20 and SMA20 slope; monthly context uses completed closes and SMA3 slope. This research rule has not established predictive performance.'] };
}
