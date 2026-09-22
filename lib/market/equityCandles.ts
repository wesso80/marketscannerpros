import { equityObservationUtc, equitySessionForDate } from '@/lib/time/sessionCloseEngine';
import type { ClosedCandle } from './candleIntegrity';

/** Only complete regular-session bars, with exchange-local timestamps converted to UTC. */
export function equityCandles(series: Record<string, Record<string, string>>, intervalMinutes?: number, now = Date.now()): ClosedCandle[] {
  return Object.entries(series).flatMap(([timestamp, row]) => {
    const session = equitySessionForDate(timestamp.slice(0, 10));
    if (!session) return [];
    const time = intervalMinutes ? equityObservationUtc(timestamp) : session.open;
    const closeTime = intervalMinutes ? new Date(time.getTime() + intervalMinutes * 60000) : session.close;
    const open = Number(row['1. open']), high = Number(row['2. high']), low = Number(row['3. low']), close = Number(row['4. close']);
    if (time < session.open || closeTime > session.close || closeTime.getTime() > now ||
        ![open, high, low, close].every(x => Number.isFinite(x) && x > 0) || high < Math.max(open, close, low) || low > Math.min(open, close, high)) return [];
    return [{ time, closeTime, open, high, low, close }];
  }).sort((a, b) => a.time.getTime() - b.time.getTime());
}

export function aggregateEquityCandles(bars: ClosedCandle[], sourceMinutes: number, targetMinutes: number): ClosedCandle[] {
  const groups = new Map<number, ClosedCandle[]>();
  for (const bar of bars) {
    const session = equitySessionForDate(bar.time.toISOString().slice(0, 10));
    if (!session) continue;
    const start = session.open.getTime() + Math.floor((bar.time.getTime() - session.open.getTime()) / (targetMinutes * 60000)) * targetMinutes * 60000;
    // Do not claim a partial last session bar is a full requested interval.
    if (start + targetMinutes * 60000 > session.close.getTime()) continue;
    groups.set(start, [...(groups.get(start) || []), bar]);
  }
  return [...groups].flatMap(([start, group]) => {
    const sorted = group.sort((a,b) => a.time.getTime() - b.time.getTime());
    if (sorted.length !== targetMinutes / sourceMinutes || sorted.some((b,i) => b.time.getTime() !== start + i * sourceMinutes * 60000 || b.closeTime.getTime() !== start + (i+1)*sourceMinutes*60000)) return [];
    return [{time: new Date(start), closeTime: new Date(start + targetMinutes*60000), open: sorted[0].open,
      high: Math.max(...sorted.map(b=>b.high)), low: Math.min(...sorted.map(b=>b.low)), close: sorted.at(-1)!.close}];
  });
}
