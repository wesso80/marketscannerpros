import { nyDateTime, isUsTradingDay, nextUsTradingDay, usSessionOpenMs, usSessionCloseMinutes, nyWallTimeMs, formatSessionDate, usSessionsBetween } from '@/lib/time/usSession';

/**
 * Timing and scheduled events for one ticker (ticker research page, Phase 2). Facts only, each with its time basis:
 * where the market session stands, when the daily / weekly / monthly bars next close, the next earnings date, and
 * high-importance scheduled economic releases. No timing score and no "window" verdict. US equity sessions use
 * lib/time/usSession (NYSE holidays and early closes); crypto trades continuously and its bars close at 00:00 UTC.
 */
export const TIMING_EVIDENCE = { version: 'timing-evidence-v1', eventHorizonDays: 7, preMarketStartNy: 4 * 60, afterHoursEndNy: 20 * 60 } as const;

export type SessionState = 'pre-market' | 'regular' | 'after-hours' | 'closed' | 'continuous';
export type BarClose = { timeframe: 'daily' | 'weekly' | 'monthly'; closesAtUtc: string; label: string };
export type ScheduledRelease = { name: string; country: string; releaseTimeUtc: string; referencePeriod: string | null; importance: string; timingConfirmed: boolean; source: string };
export type EarningsEvent = { date: string | null; status: 'scheduled' | 'none in horizon' | 'unknown'; sessionsAway: number | null; lastReportedQuarter: string | null };
export type TimingEvidence = {
  version: string;
  asOfUtc: string;
  session: { state: SessionState; sessionDate: string | null; earlyClose: boolean; nextOpenUtc: string | null; nextCloseUtc: string | null; note: string };
  closes: BarClose[];
  earnings: EarningsEvent | null;
  releases: ScheduledRelease[];
  /** Source and status of the release list; null when no calendar was supplied. */
  releasesBasis: { source: string; horizonDays: number; status: 'available' | 'unavailable' } | null;
  summary: string[];
};

const iso = (ms: number) => new Date(ms).toISOString();
function lastTradingDayOnOrBefore(ymd: string): string {
  let d = ymd;
  for (let i = 0; i < 15 && !isUsTradingDay(d); i++) d = new Date(Date.parse(d + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  return d;
}
const closeMs = (ymd: string) => nyWallTimeMs(ymd, usSessionCloseMinutes(ymd));

function equitySession(nowMs: number) {
  const { ymd, minutes } = nyDateTime(nowMs);
  const trading = isUsTradingDay(ymd), closeMin = trading ? usSessionCloseMinutes(ymd) : 16 * 60, early = trading && closeMin < 16 * 60;
  let state: SessionState = 'closed';
  if (trading) state = minutes < TIMING_EVIDENCE.preMarketStartNy ? 'closed' : minutes < 9 * 60 + 30 ? 'pre-market' : minutes < closeMin ? 'regular' : minutes < TIMING_EVIDENCE.afterHoursEndNy ? 'after-hours' : 'closed';
  const openToday = trading && minutes < 9 * 60 + 30;
  const nextOpenDay = openToday ? ymd : nextUsTradingDay(ymd);
  const nextCloseDay = trading && minutes < closeMin ? ymd : nextUsTradingDay(ymd);
  const note = state === 'regular' ? `US regular session in progress (${formatSessionDate(ymd)}${early ? ', early close 13:00 ET' : ''}).`
    : state === 'pre-market' ? `US pre-market; the regular session opens at 09:30 ET on ${formatSessionDate(ymd)}.`
    : state === 'after-hours' ? `US after-hours; the ${formatSessionDate(ymd)} regular session has closed.`
    : `US market closed; next regular session ${formatSessionDate(nextOpenDay)}.`;
  return { state, sessionDate: trading ? ymd : null, earlyClose: early, nextOpenUtc: iso(usSessionOpenMs(nextOpenDay)), nextCloseUtc: iso(closeMs(nextCloseDay)), note, ymd, minutes, trading, closeMin };
}

export function buildTimingEvidence(input: {
  assetClass: 'equity' | 'crypto';
  nowMs: number;
  earnings?: { date: string | null; status?: string | null; lastReportedQuarter?: string | null } | null;
  /** Upcoming calendar events (already filtered by the caller to the relevant countries/importance), or null when unavailable. */
  releases?: { events: Array<{ eventName: string; country: string; releaseTimeUtc: string; referencePeriod: string | null; importance: string; timingConfirmed: boolean; source: string }>; source: string } | null;
}): TimingEvidence {
  const now = input.nowMs, T = TIMING_EVIDENCE, closes: BarClose[] = [];
  let session: TimingEvidence['session'];
  if (input.assetClass === 'crypto') {
    session = { state: 'continuous', sessionDate: null, earlyClose: false, nextOpenUtc: null, nextCloseUtc: null, note: 'Crypto trades continuously; daily bars close at 00:00 UTC.' };
    const d = new Date(now), day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
    const wk = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
    const mo = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
    closes.push({ timeframe: 'daily', closesAtUtc: iso(day), label: 'Daily bar closes at 00:00 UTC' },
      { timeframe: 'weekly', closesAtUtc: iso(wk), label: 'Weekly bar (Monday-anchored) closes Monday 00:00 UTC' },
      { timeframe: 'monthly', closesAtUtc: iso(mo), label: 'Monthly bar closes on the 1st at 00:00 UTC' });
  } else {
    const s = equitySession(now);
    session = { state: s.state, sessionDate: s.sessionDate, earlyClose: s.earlyClose, nextOpenUtc: s.nextOpenUtc, nextCloseUtc: s.nextCloseUtc, note: s.note };
    const dailyDay = s.trading && s.minutes < s.closeMin ? s.ymd : nextUsTradingDay(s.ymd);
    // Weekly: the last trading day of the week containing the next daily close (Friday, or earlier on a holiday).
    const dw = new Date(dailyDay + 'T00:00:00Z'), fri = new Date(Date.UTC(dw.getUTCFullYear(), dw.getUTCMonth(), dw.getUTCDate() + (5 - dw.getUTCDay()))).toISOString().slice(0, 10);
    const weekDay = lastTradingDayOnOrBefore(fri);
    const monthEnd = new Date(Date.UTC(dw.getUTCFullYear(), dw.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const monthDay = lastTradingDayOnOrBefore(monthEnd);
    closes.push({ timeframe: 'daily', closesAtUtc: iso(closeMs(dailyDay)), label: `Daily bar closes ${formatSessionDate(dailyDay)} at the regular-session close` },
      { timeframe: 'weekly', closesAtUtc: iso(closeMs(weekDay)), label: `Weekly bar closes ${formatSessionDate(weekDay)}` },
      { timeframe: 'monthly', closesAtUtc: iso(closeMs(monthDay)), label: `Monthly bar closes ${formatSessionDate(monthDay)}` });
  }

  let earnings: EarningsEvent | null = null;
  if (input.assetClass === 'equity' && input.earnings) {
    const date = input.earnings.date && /^\d{4}-\d{2}-\d{2}$/.test(input.earnings.date) ? input.earnings.date : null;
    const st = String(input.earnings.status ?? '').toUpperCase();
    const today = nyDateTime(now).ymd;
    earnings = { date, status: date ? 'scheduled' : st === 'NONE_IN_HORIZON' ? 'none in horizon' : 'unknown',
      sessionsAway: date ? (date <= today ? 0 : usSessionsBetween(today, date)) : null, lastReportedQuarter: input.earnings.lastReportedQuarter ?? null };
  }

  const horizonEnd = now + T.eventHorizonDays * 86400000;
  const releases: ScheduledRelease[] = input.releases ? input.releases.events
    .filter((e) => { const t = Date.parse(e.releaseTimeUtc); return Number.isFinite(t) && t >= now && t <= horizonEnd; })
    .sort((a, b) => a.releaseTimeUtc.localeCompare(b.releaseTimeUtc))
    .map((e) => ({ name: e.eventName, country: e.country, releaseTimeUtc: e.releaseTimeUtc, referencePeriod: e.referencePeriod, importance: e.importance, timingConfirmed: e.timingConfirmed, source: e.source })) : [];
  const releasesBasis = input.releases === undefined ? null
    : { source: input.releases?.source ?? 'economic calendar', horizonDays: T.eventHorizonDays, status: input.releases ? 'available' as const : 'unavailable' as const };

  const summary: string[] = [session.note];
  if (earnings) summary.push(earnings.date ? `Next earnings ${formatSessionDate(earnings.date)}${earnings.sessionsAway ? ` (${earnings.sessionsAway} trading session${earnings.sessionsAway === 1 ? '' : 's'} away)` : ''}.`
    : earnings.status === 'none in horizon' ? 'No earnings date within the calendar horizon.' : 'Next earnings date unknown (calendar unavailable).');
  if (releasesBasis?.status === 'available') summary.push(releases.length ? `${releases.length} high-importance scheduled release${releases.length === 1 ? '' : 's'} in the next ${T.eventHorizonDays} days; the first is ${releases[0].name} (${releases[0].country}).` : `No high-importance scheduled releases in the next ${T.eventHorizonDays} days.`);
  else if (releasesBasis?.status === 'unavailable') summary.push('Economic calendar unavailable; scheduled releases not checked.');
  return { version: T.version, asOfUtc: iso(now), session, closes, earnings, releases, releasesBasis, summary };
}
