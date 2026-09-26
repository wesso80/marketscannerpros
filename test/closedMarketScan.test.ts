/**
 * Closed-market handling for the saved admin scan (Priority Desk: 1 of 193 ranked on Sat 27 Sep 00:10 AEST).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { closedMarketDataTruth, closedSessionForBar, closedUsSession, isCurrentForClosedMarket } from '@/lib/admin/closedMarket';
import { computeDataTruth } from '@/lib/engines/dataTruth';
import { isUsRegularSessionOpen } from '@/lib/time/usSession';

const SAT_ET_1010 = Date.parse('2026-09-26T14:10:00Z'); // brad's rescan: Sun 27 Sep 00:10 AEST
const FRI_ET_1100 = Date.parse('2026-09-25T15:00:00Z');
const FRI_CLOSE = Date.parse('2026-09-25T20:00:00Z'); // 16:00 ET

describe('closedUsSession', () => {
  it('is null while the regular session is open', () => {
    expect(isUsRegularSessionOpen(FRI_ET_1100)).toBe(true);
    expect(closedUsSession(FRI_ET_1100)).toBeNull();
  });
  it('over a weekend it is Friday, closing 16:00 ET', () => {
    expect(closedUsSession(SAT_ET_1010)).toEqual({ sessionDate: '2026-09-25', closeMs: FRI_CLOSE, label: 'as of Fri 25 Sep 2026 close' });
  });
  it('after the close on a weekday it is that day; before Monday\'s open it is still Friday', () => {
    expect(closedUsSession(Date.parse('2026-09-25T21:00:00Z'))?.sessionDate).toBe('2026-09-25');
    expect(closedUsSession(Date.parse('2026-09-28T12:00:00Z'))?.sessionDate).toBe('2026-09-25'); // Mon 08:00 ET
  });
  it('skips holidays (Thanksgiving) and uses the early close (day after Thanksgiving, 13:00 ET)', () => {
    expect(closedUsSession(Date.parse('2026-11-26T16:00:00Z'))?.sessionDate).toBe('2026-11-25');
    const fri = closedUsSession(Date.parse('2026-11-27T20:00:00Z'))!;
    expect(fri.sessionDate).toBe('2026-11-27');
    expect(fri.closeMs).toBe(Date.parse('2026-11-27T18:00:00Z'));
  });
});

describe('closedSessionForBar', () => {
  it('matches a last-session bar (intraday ISO or daily date) only while closed', () => {
    expect(closedSessionForBar('2026-09-25T19:45:00.000Z', SAT_ET_1010)?.label).toBe('as of Fri 25 Sep 2026 close');
    expect(closedSessionForBar('2026-09-25', SAT_ET_1010)?.sessionDate).toBe('2026-09-25');
    expect(closedSessionForBar('2026-09-25T14:45:00.000Z', FRI_ET_1100)).toBeNull();
  });
  it('an older bar (symbol did not trade in the last session) is not current', () => {
    expect(closedSessionForBar('2026-09-24T19:45:00.000Z', SAT_ET_1010)).toBeNull();
    expect(closedSessionForBar(null, SAT_ET_1010)).toBeNull();
  });
});

describe('closedMarketDataTruth', () => {
  it('Friday\'s last 15m bar on Saturday: CACHED trust 80 with an as-of note, instead of STALE trust 15', () => {
    const ageSec = Math.round((SAT_ET_1010 - Date.parse('2026-09-25T19:45:00Z')) / 1000);
    expect(computeDataTruth({ marketDataAgeSec: ageSec, timeframe: '15m' })).toMatchObject({ status: 'STALE', trustScore: 15 });
    const dt = closedMarketDataTruth(ageSec, '15m', closedUsSession(SAT_ET_1010)!);
    expect(dt).toMatchObject({ status: 'CACHED', trustScore: 80, ageSec });
    expect(dt.notes).toEqual(["US market closed: last session's data (as of Fri 25 Sep 2026 close)."]);
  });
  it('isCurrentForClosedMarket needs a scan after the close and the market still shut', () => {
    expect(isCurrentForClosedMarket('2026-09-26T04:00:00.000Z', SAT_ET_1010)).toBe(true);
    expect(isCurrentForClosedMarket('2026-09-25T19:59:00.000Z', SAT_ET_1010)).toBe(false);
    expect(isCurrentForClosedMarket('2026-09-25T14:00:00.000Z', FRI_ET_1100)).toBe(false);
    expect(isCurrentForClosedMarket(null, SAT_ET_1010)).toBe(false);
  });
});

describe('wiring', () => {
  it('the packet builder uses the closed-market data truth for equities', () => {
    const src = readFileSync('lib/admin/getAdminResearchPacket.ts', 'utf8');
    expect(src).toContain('closedSessionForBar(bars[bars.length - 1].timestamp)');
    expect(src).toContain('closedMarketDataTruth(ageSec, timeframe, closedSession)');
    expect(src).toMatch(/market === "EQUITIES" && !noBars && sourceErrors\.length === 0/);
  });
  it('Priority Desk lists only failed/skipped/stale/degraded rows as data-degraded and reports no-setup counts', () => {
    const src = readFileSync('app/api/admin/priority-desk/route.ts', 'utf8');
    expect(src).toContain('const dataDegradedList = topBy(everything, isDataDegraded, 8);');
    expect(src).toContain('noSetupCount,');
    expect(src).toContain('marketClosedAsOf:');
  });
});
