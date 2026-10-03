import { lastCompletedUsSessionDate, usSessionCloseMinutes, nyWallTimeMs } from '@/lib/time/usSession';
/** Dates belong to the input candle, never the time an old candle was republished. */
export function dailyPublication(asset: string, indicators: Record<string, any>, now = Date.now()) {
  const raw = indicators.lastBarAt ?? indicators.lastCompletedBarAt ?? indicators.canonical?.barDate;
  const ms = typeof raw === 'string' ? Date.parse(raw) : NaN;
  const scanDate = Number.isFinite(ms) ? new Date(ms).toISOString().slice(0,10) : lastCompletedUsSessionDate(now);
  const close = Number.isFinite(ms) ? asset === 'equity'
    ? nyWallTimeMs(scanDate, usSessionCloseMinutes(scanDate))
    : Date.parse(scanDate) + 86_400_000 : NaN;
  return { scanDate, dataAsOf: Number.isFinite(close) ? new Date(close).toISOString() : null };
}

/** Only completed input candles may be published as immutable daily picks. */
export function isCompletedDailyBar(asset:string, date:string, now=Date.now()):boolean {
  const publication = dailyPublication(asset, {lastBarAt:date}, now);
  return publication.dataAsOf != null && Date.parse(publication.dataAsOf) <= now;
}
