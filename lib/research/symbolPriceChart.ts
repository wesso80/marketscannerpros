import { lastCompletedUsSessionDate } from '@/lib/time/usSession';
export type PriceHistory = { historicalDates?: string[]; historicalCloses: number[]; historicalOpens?: number[]; historicalHighs?: number[]; historicalLows?: number[]; historicalVolumes?: Array<number | null>; source?: string };
export type PricePoint = { date: string; close: number; open: number | null; high: number | null; low: number | null; volume: number | null; sma20: number | null; sma50: number | null; upper: number | null; lower: number | null; rsi: number | null; macd: number | null; signal: number | null };
export type PriceChart = { points: PricePoint[]; source: string; basis: string };
export function buildPriceChart(history: PriceHistory | null, type: 'equity' | 'crypto', days: number, now: number): PriceChart {
  const last = type === 'equity' ? lastCompletedUsSessionDate(now) : new Date(now - 86400000).toISOString().slice(0, 10);
  const cutoff = new Date(now - days * 86400000).toISOString().slice(0, 10);
  const n = history?.historicalCloses.length || 0;
  const aligned = (a: unknown[] | undefined) => a?.length === n;
  const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
  const rows = new Map<string, { date: string; close: number; open: number | null; high: number | null; low: number | null; volume: number | null }>();
  if (history && aligned(history.historicalDates)) history.historicalDates!.forEach((date, i) => {
    const d = date.slice(0, 10), close = history.historicalCloses[i];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > last || !positive(close)) return;
    const o = aligned(history.historicalOpens) ? history.historicalOpens![i] : null;
    const h = aligned(history.historicalHighs) ? history.historicalHighs![i] : null;
    const l = aligned(history.historicalLows) ? history.historicalLows![i] : null;
    const valid = positive(o) && positive(h) && positive(l) && h >= Math.max(o, close) && l <= Math.min(o, close);
    const v = aligned(history.historicalVolumes) ? history.historicalVolumes![i] : null;
    rows.set(d, { date: d, close, open: valid ? o : null, high: valid ? h : null, low: valid ? l : null, volume: typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null });
  });
  const bars = [...rows.values()].sort((a,b) => a.date.localeCompare(b.date)), closes = bars.map(b => b.close);
  const sma = (i: number, period: number) => i + 1 < period ? null : closes.slice(i + 1 - period, i + 1).reduce((a,b) => a+b,0)/period;
  let e12: number | null = null, e26: number | null = null, signal: number | null = null, gain = 0, loss = 0;
  const macds: number[] = [];
  const points = bars.map((bar,i): PricePoint => {
    e12 = i === 11 ? sma(i,12) : i > 11 ? bar.close * (2/13) + e12! * (11/13) : null;
    e26 = i === 25 ? sma(i,26) : i > 25 ? bar.close * (2/27) + e26! * (25/27) : null;
    const macd = e12 !== null && e26 !== null ? e12-e26 : null;
    if (macd !== null) { macds.push(macd); signal = macds.length === 9 ? macds.reduce((a,b)=>a+b,0)/9 : macds.length > 9 ? macd*.2 + signal!*.8 : null; }
    if (i > 0) { const delta = bar.close-closes[i-1]; if (i <= 14) { gain += Math.max(0,delta)/14; loss += Math.max(0,-delta)/14; } else { gain = (gain*13+Math.max(0,delta))/14; loss = (loss*13+Math.max(0,-delta))/14; } }
    const mean = sma(i,20), deviation = mean === null ? null : Math.sqrt(closes.slice(i-19,i+1).reduce((a,b)=>a+(b-mean)**2,0)/20);
    return { ...bar, sma20: mean, sma50: sma(i,50), upper: mean === null ? null : mean + 2*deviation!, lower: mean === null ? null : mean-2*deviation!, rsi: i < 14 ? null : loss === 0 ? gain === 0 ? null : 100 : 100-100/(1+gain/loss), macd, signal };
  }).filter(b => b.date >= cutoff);
  return { points, source: history?.source || 'Unavailable', basis: `${type === 'equity' ? 'Split-adjusted daily prices; dividends excluded' : 'Daily USD prices, UTC'}. Completed observations only, evenly spaced; gaps are not filled. Indicators use available observations before the displayed window: SMA20/50, Bollinger 20 with 2 population standard deviations, Wilder RSI14, SMA-seeded EMA MACD12/26 with 9-period signal. Warm-up and missing fields remain unavailable. Volume uses provider units.` };
}
