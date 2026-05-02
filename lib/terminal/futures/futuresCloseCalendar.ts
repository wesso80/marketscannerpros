import { buildFuturesSessionState } from './futuresSessionEngine';

export type FuturesAnchorMode = 'globex' | 'rth' | 'cash_bridge';

export type FuturesCloseCalendarRow = {
  timeframe: string;
  category: 'intraday' | 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  nextCloseISO: string;
  minutesToClose: number;
  weight: number;
};

export type FuturesCloseCluster = {
  label: string;
  timeISO: string;
  timeEtLabel: string;
  timeframes: string[];
  weight: number;
  clusterScore: number;
};

export type FuturesCloseCalendarResponse = {
  symbol: string;
  anchorMode: FuturesAnchorMode;
  timezone: 'America/New_York';
  horizonDays: number;
  schedule: FuturesCloseCalendarRow[];
  clusters: FuturesCloseCluster[];
  timeline: string[];
  warnings: string[];
};

const MINUTE_TIMEFRAMES = [1, 3, 5, 10, 15, 30] as const;
const HOUR_TIMEFRAMES = [1, 2, 3, 4, 6, 8, 12] as const;
const DAY_TIMEFRAMES = [1, 2, 3, 5] as const;
const WEEK_TIMEFRAMES = [1, 2, 3, 4, 13, 26, 52] as const;
const MONTH_TIMEFRAMES = [1, 2, 3, 6, 12] as const;

const WEIGHT_BY_CATEGORY: Record<FuturesCloseCalendarRow['category'], number> = {
  intraday: 1,
  daily: 3,
  weekly: 5,
  monthly: 7,
  quarterly: 8,
  yearly: 9,
};

function getEtParts(date: Date): { year: number; month: number; day: number; weekday: number; hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const weekdayToken = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return {
    year: Number(parts.find((p) => p.type === 'year')?.value ?? '1970'),
    month: Number(parts.find((p) => p.type === 'month')?.value ?? '1'),
    day: Number(parts.find((p) => p.type === 'day')?.value ?? '1'),
    weekday: weekdayMap[weekdayToken] ?? 0,
    hour: Number(parts.find((p) => p.type === 'hour')?.value ?? '0'),
    minute: Number(parts.find((p) => p.type === 'minute')?.value ?? '0'),
  };
}

function toEtLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function dayStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function minutesBetween(now: Date, target: Date): number {
  return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
}

function nextByMinuteStep(now: Date, stepMinutes: number, anchorMinute: number): Date {
  const currentMinute = now.getHours() * 60 + now.getMinutes();
  const elapsed = Math.max(0, currentMinute - anchorMinute);
  const steps = Math.floor(elapsed / stepMinutes) + 1;
  const nextMinute = anchorMinute + steps * stepMinutes;

  const target = new Date(now);
  target.setSeconds(0, 0);
  if (nextMinute >= 24 * 60) {
    const overflow = nextMinute - 24 * 60;
    target.setDate(target.getDate() + 1);
    target.setHours(Math.floor(overflow / 60), overflow % 60, 0, 0);
  } else {
    target.setHours(Math.floor(nextMinute / 60), nextMinute % 60, 0, 0);
  }
  return target;
}

function nextDailyClose(now: Date, closeHour: number, closeMinute: number): Date {
  const candidate = new Date(now);
  candidate.setHours(closeHour, closeMinute, 0, 0);
  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

function nextWeeklyClose(now: Date, weeks: number): Date {
  const candidate = new Date(now);
  candidate.setHours(16, 0, 0, 0);
  const day = candidate.getDay();
  const daysToFriday = (5 - day + 7) % 7;
  candidate.setDate(candidate.getDate() + daysToFriday);
  if (candidate <= now) {
    candidate.setDate(candidate.getDate() + 7);
  }
  candidate.setDate(candidate.getDate() + (weeks - 1) * 7);
  return candidate;
}

function nextMonthlyClose(now: Date, months: number): Date {
  const candidate = new Date(now.getFullYear(), now.getMonth() + months, 1, 16, 0, 0, 0);
  candidate.setDate(0);
  if (candidate <= now) {
    candidate.setMonth(candidate.getMonth() + months);
  }
  return candidate;
}

function buildIntradayRows(now: Date, anchorMode: FuturesAnchorMode): FuturesCloseCalendarRow[] {
  const rows: FuturesCloseCalendarRow[] = [];
  const anchorMinute = anchorMode === 'globex' ? 18 * 60 : 9 * 60 + 30;

  for (const minuteTf of MINUTE_TIMEFRAMES) {
    const target = nextByMinuteStep(now, minuteTf, anchorMinute);
    rows.push({
      timeframe: `${minuteTf}m`,
      category: 'intraday',
      nextCloseISO: target.toISOString(),
      minutesToClose: minutesBetween(now, target),
      weight: WEIGHT_BY_CATEGORY.intraday,
    });
  }

  for (const hourTf of HOUR_TIMEFRAMES) {
    const target = nextByMinuteStep(now, hourTf * 60, anchorMinute);
    rows.push({
      timeframe: `${hourTf}h`,
      category: 'intraday',
      nextCloseISO: target.toISOString(),
      minutesToClose: minutesBetween(now, target),
      weight: WEIGHT_BY_CATEGORY.intraday + 1,
    });
  }

  return rows;
}

function buildHigherRows(now: Date): FuturesCloseCalendarRow[] {
  const rows: FuturesCloseCalendarRow[] = [];

  for (const days of DAY_TIMEFRAMES) {
    const target = nextDailyClose(addDays(now, days - 1), 16, 0);
    rows.push({
      timeframe: `${days}D`,
      category: 'daily',
      nextCloseISO: target.toISOString(),
      minutesToClose: minutesBetween(now, target),
      weight: WEIGHT_BY_CATEGORY.daily,
    });
  }

  for (const weeks of WEEK_TIMEFRAMES) {
    const target = nextWeeklyClose(now, weeks);
    const category: FuturesCloseCalendarRow['category'] = weeks >= 13 ? 'quarterly' : 'weekly';
    rows.push({
      timeframe: `${weeks}W`,
      category,
      nextCloseISO: target.toISOString(),
      minutesToClose: minutesBetween(now, target),
      weight: WEIGHT_BY_CATEGORY[category],
    });
  }

  for (const months of MONTH_TIMEFRAMES) {
    const target = nextMonthlyClose(now, months);
    const category: FuturesCloseCalendarRow['category'] = months >= 12 ? 'yearly' : 'monthly';
    rows.push({
      timeframe: `${months}M`,
      category,
      nextCloseISO: target.toISOString(),
      minutesToClose: minutesBetween(now, target),
      weight: WEIGHT_BY_CATEGORY[category],
    });
  }

  return rows;
}

function buildClusters(rows: FuturesCloseCalendarRow[]): FuturesCloseCluster[] {
  const buckets = new Map<number, FuturesCloseCalendarRow[]>();

  for (const row of rows) {
    const ts = new Date(row.nextCloseISO).getTime();
    const bucketKey = Math.round(ts / (15 * 60_000)) * (15 * 60_000);
    const list = buckets.get(bucketKey) ?? [];
    list.push(row);
    buckets.set(bucketKey, list);
  }

  return Array.from(buckets.entries())
    .map(([time, bucketRows]) => {
      const weight = bucketRows.reduce((sum, row) => sum + row.weight, 0);
      return {
        label: `${bucketRows.length} closes`,
        timeISO: new Date(time).toISOString(),
        timeEtLabel: toEtLabel(new Date(time)),
        timeframes: bucketRows.map((row) => row.timeframe),
        weight,
        clusterScore: Math.min(100, Math.round(weight * 8)),
      };
    })
    .sort((a, b) => a.timeISO.localeCompare(b.timeISO))
    .slice(0, 10);
}

function buildTimeline(anchorMode: FuturesAnchorMode): string[] {
  if (anchorMode === 'globex') {
    return [
      '17:00 ET - Futures maintenance break',
      '18:00 ET - Globex reset',
      '09:30 ET - Cash ignition',
      '16:00 ET - Cash close / Phantom handoff',
    ];
  }

  return [
    '09:30 ET - Cash ignition',
    '10:30 ET - RTH 1H close',
    '12:30 ET - RTH 3H close',
    '15:30 ET - RTH 6H close',
    '16:00 ET - Cash close / Phantom handoff',
    '17:00 ET - Futures maintenance break',
    '18:00 ET - Globex reset',
  ];
}

export function buildFuturesCloseCalendar(
  symbol: string,
  anchorMode: FuturesAnchorMode = 'globex',
  horizonDays = 1,
  now: Date = new Date(),
): FuturesCloseCalendarResponse {
  // Check whether Globex is currently in the weekend close window (Fri 17:00 – Sun 18:00 ET).
  // If so, offset all computations forward to the next Globex reopen so minute counts
  // reflect real wall-clock time from now, not from inside the dead window.
  const session = buildFuturesSessionState(symbol, now);
  const isClosed = session.currentSession === 'closed';
  const minutesUntilReopen = isClosed ? session.minutesToNextSessionEvent : 0;
  const effectiveNow = isClosed
    ? new Date(now.getTime() + minutesUntilReopen * 60_000)
    : now;

  const rawRows = [...buildIntradayRows(effectiveNow, anchorMode), ...buildHigherRows(effectiveNow)];

  // When closed, add the reopen gap to every minutesToClose so values are relative to real now.
  const rows = rawRows
    .map((row) =>
      isClosed ? { ...row, minutesToClose: row.minutesToClose + minutesUntilReopen } : row,
    )
    .filter((row) => row.minutesToClose <= horizonDays * 24 * 60 + 52 * 7 * 24 * 60)
    .sort((a, b) => a.minutesToClose - b.minutesToClose);

  const warnings: string[] = [];
  if (isClosed) {
    const h = Math.floor(minutesUntilReopen / 60);
    const m = minutesUntilReopen % 60;
    warnings.push(
      `Globex is currently closed. Next open: Sunday 18:00 ET (in ${h}h ${m > 0 ? ` ${m}m` : ''}).`,
    );
  }

  return {
    symbol: symbol.toUpperCase().trim(),
    anchorMode,
    timezone: 'America/New_York',
    horizonDays,
    schedule: rows,
    clusters: buildClusters(rows),
    timeline: buildTimeline(anchorMode),
    warnings,
  };
}
