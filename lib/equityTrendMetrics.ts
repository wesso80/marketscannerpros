import { dmi } from '@/lib/ta/core';

export interface DailyBarRow {
  date: string; // YYYY-MM-DD (US/Eastern trading date)
  high: number;
  low: number;
  close: number;
}

/** Minimum completed daily bars for a settled Wilder ADX(14) (14 for the DI smoothing + 14 for the ADX smoothing + 2). */
export const EQUITY_ADX_MIN_BARS = 30;

function etDateAndMinutes(now: Date): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * Daily Wilder ADX(14) for an equity from the daily bars /api/flow already loads for liquidity levels.
 * Only completed sessions count: today's bar is dropped until the 16:00 ET close, and any future-dated row is ignored.
 * Returns `undefined` (not a default) when there is too little clean history, so the engine keeps its
 * 'unknown_default_chop' basis instead of pretending to have measured a trend.
 */
export function equityDailyAdx(rows: DailyBarRow[], now: Date = new Date()): number | undefined {
  const et = etDateAndMinutes(now);
  const completed = rows
    .filter((r) => Number.isFinite(r.high) && Number.isFinite(r.low) && Number.isFinite(r.close) && r.high >= r.low && r.low > 0)
    .filter((r) => r.date < et.date || (r.date === et.date && et.minutes >= 16 * 60))
    .sort((a, b) => a.date.localeCompare(b.date));
  if (completed.length < EQUITY_ADX_MIN_BARS) return undefined;
  const { adx } = dmi(completed.map((r) => r.high), completed.map((r) => r.low), completed.map((r) => r.close), 14);
  return Number.isFinite(adx) ? Math.round(adx * 10) / 10 : undefined;
}
