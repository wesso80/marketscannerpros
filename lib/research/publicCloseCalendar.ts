/**
 * Public Close Calendar contract (/api/confluence-scan, mode "calendar").
 *
 * The internal forward close calendar (lib/confluence-learning-agent computeForwardCloseCalendar) attaches an
 * importance weight to every timeframe and a weighted "cluster score" to every close window. Neither is published:
 * the public calendar is the schedule itself (when each timeframe closes, how often in the horizon, whether it
 * closes on the anchor day) and the windows in which several closes coincide, listed in time order with the
 * timeframes they contain. Built leaf by leaf; nothing is copied by reference from the internal result.
 */
import type { CloseCalendarAnchor, CloseCalendarScheduleModel, ForwardCloseCalendar } from '@/lib/confluence-learning-agent';

export const PUBLIC_CLOSE_CALENDAR_CONTRACT = 'public-close-calendar-v1';

export type CloseCategory = 'intraday' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface PublicCloseScheduleRow { tf: string; tfMinutes: number; category: CloseCategory; firstCloseAtISO: string | null; minsToFirstClose: number | null; closesInHorizon: number; closesOnAnchorDay: boolean }
export interface PublicCloseWindow { label: string; windowStartISO: string; windowEndISO: string; tfs: string[]; timeframeCount: number }

export interface PublicCloseCalendar {
  contract: typeof PUBLIC_CLOSE_CALENDAR_CONTRACT;
  anchor: CloseCalendarAnchor;
  anchorTimeISO: string;
  horizonDays: number;
  horizonEndISO: string;
  assetClass: 'crypto' | 'equity';
  scheduleModel: CloseCalendarScheduleModel;
  scheduleModelLabel: string;
  scheduleBasis: string;
  timezone: 'UTC' | 'America/New_York';
  sessionMode: 'regular' | 'extended' | 'full';
  warnings: string[];
  schedule: PublicCloseScheduleRow[];
  closesOnAnchorDay: PublicCloseScheduleRow[];
  /** Coinciding-close windows in time order (earliest first). */
  forwardClusters: PublicCloseWindow[];
  clusterRule: string;
  totalCloseEventsInHorizon: number;
  generatedAt: string;
}

/** Upper bound on windows published (in time order); a 30-day horizon produces far fewer. */
export const MAX_PUBLIC_CLOSE_WINDOWS = 60;
export const CLOSE_WINDOW_RULE = 'A close window is a 60-minute period, counted from the anchor time, in which two or more daily-or-longer timeframes close. Windows are listed in time order. Intraday closes are not grouped; single closes appear in the schedule.';

const CATEGORIES = new Set<CloseCategory>(['intraday', 'daily', 'weekly', 'monthly', 'yearly']);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function row(r: ForwardCloseCalendar['schedule'][number]): PublicCloseScheduleRow {
  return {
    tf: str(r.tf),
    tfMinutes: num(r.tfMinutes) ?? 0,
    category: CATEGORIES.has(r.category as CloseCategory) ? (r.category as CloseCategory) : 'intraday',
    firstCloseAtISO: typeof r.firstCloseAtISO === 'string' ? r.firstCloseAtISO : null,
    minsToFirstClose: num(r.minsToFirstClose),
    closesInHorizon: num(r.closesInHorizon) ?? 0,
    closesOnAnchorDay: r.closesOnAnchorDay === true,
  };
}

export function toPublicCloseCalendar(c: ForwardCloseCalendar, generatedAt: number | string | Date = Date.now()): PublicCloseCalendar {
  const windows = (c.forwardClusters ?? [])
    .map((w) => ({ label: str(w.label), windowStartISO: str(w.windowStartISO), windowEndISO: str(w.windowEndISO), tfs: strs(w.tfs), timeframeCount: strs(w.tfs).length }))
    // Count-only rule: the engine also admits a single close by importance weight; that is not published.
    .filter((w) => w.timeframeCount >= 2)
    .sort((a, b) => Date.parse(a.windowStartISO) - Date.parse(b.windowStartISO))
    .slice(0, MAX_PUBLIC_CLOSE_WINDOWS);
  return {
    contract: PUBLIC_CLOSE_CALENDAR_CONTRACT,
    anchor: c.anchor,
    anchorTimeISO: str(c.anchorTimeISO),
    horizonDays: num(c.horizonDays) ?? 0,
    horizonEndISO: str(c.horizonEndISO),
    assetClass: c.assetClass === 'equity' ? 'equity' : 'crypto',
    scheduleModel: c.scheduleModel,
    scheduleModelLabel: str(c.scheduleModelLabel),
    scheduleBasis: str(c.scheduleBasis),
    timezone: c.timezone === 'America/New_York' ? 'America/New_York' : 'UTC',
    sessionMode: c.sessionMode,
    warnings: strs(c.warnings),
    schedule: (c.schedule ?? []).map(row),
    closesOnAnchorDay: (c.closesOnAnchorDay ?? []).map(row),
    forwardClusters: windows,
    clusterRule: CLOSE_WINDOW_RULE,
    totalCloseEventsInHorizon: num(c.totalCloseEventsInHorizon) ?? 0,
    generatedAt: new Date(generatedAt).toISOString(),
  };
}
