import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isUSMarketHoliday } from '@/lib/time/marketHolidays';

vi.mock('@/lib/db', () => ({ q: vi.fn() }));
vi.mock('@/lib/coingecko', () => ({
  getOHLC: vi.fn(),
  getPriceBySymbol: vi.fn(),
  resolveSymbolToId: vi.fn(),
  COINGECKO_ID_MAP: {},
}));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: vi.fn() }));
vi.mock('@/lib/time/sessionCloseEngine', () => ({
  getNextCloseIntraday: vi.fn(() => ({ minsToClose: 30 })),
  getSessionBounds: vi.fn(),
  isMarketOpenForSession: vi.fn(() => true),
}));
vi.mock('@/lib/time/marketHolidays', () => {
  const isWeekend = (year: number, month: number, day: number) => {
    const dow = new Date(Date.UTC(year, month, day, 12)).getUTCDay();
    return dow === 0 || dow === 6;
  };
  const lastTradingDayOfMonth = (year: number, month: number) => {
    let day = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    while (day > 1 && isWeekend(year, month, day)) day--;
    return day;
  };

  return {
    isUSMarketHoliday: vi.fn(() => false),
    isNonTradingDay: vi.fn((date: Date) => {
      const dow = date.getUTCDay();
      return dow === 0 || dow === 6;
    }),
    lastTradingDayOfMonth: vi.fn(lastTradingDayOfMonth),
  };
});

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const isUSMarketHolidayMock = vi.mocked(isUSMarketHoliday);

beforeEach(() => {
  isUSMarketHolidayMock.mockReturnValue(false);
});

function findTf(calendar: { schedule: Array<{ tf: string; firstCloseAtISO: string | null; closesInHorizon: number }> }, tf: string) {
  const row = calendar.schedule.find((item) => item.tf === tf);
  expect(row).toBeDefined();
  return row!;
}

describe('time scanner schedule model truth', () => {
  it('labels crypto close calendars as 24/7 UTC without weekend or holiday sessions', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');
    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      2,
      '2026-04-25T12:00:00.000Z',
      'crypto',
      'extended',
    );

    const daily = calendar.schedule.find((row) => row.tf === '1D');

    expect(calendar.scheduleModel).toBe('crypto_247');
    expect(calendar.scheduleModelLabel).toBe('Crypto 24/7 UTC');
    expect(calendar.timezone).toBe('UTC');
    expect(calendar.scheduleBasis).toContain('24/7 UTC candle boundaries');
    expect(calendar.warnings[0]).toContain('does not observe weekends or exchange holidays');
    expect(daily?.firstCloseAtISO).toBe('2026-04-26T00:00:00.000Z');
  });

  it('labels crypto close clusters at the actual UTC close boundary, not the current-time bucket minute', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');
    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      30,
      '2026-04-28T08:16:00.000Z',
      'crypto',
      'extended',
    );

    expect(calendar.forwardClusters.length).toBeGreaterThan(0);
    for (const cluster of calendar.forwardClusters) {
      expect(cluster.label).toMatch(/00:00$/);
      expect(cluster.label).not.toContain('23:16');
      expect(new Date(cluster.windowStartISO).getUTCMinutes()).toBe(0);
    }
  });

  it('labels equity close calendars as NYSE session-based and skips weekend closes', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');
    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      3,
      '2026-04-25T12:00:00.000Z',
      'equity',
      'regular',
    );

    const daily = calendar.schedule.find((row) => row.tf === '1D');

    expect(calendar.scheduleModel).toBe('equity_session');
    expect(calendar.scheduleModelLabel).toBe('Equity NYSE Session');
    expect(calendar.timezone).toBe('America/New_York');
    expect(calendar.sessionMode).toBe('regular');
    expect(calendar.scheduleBasis).toContain('NYSE regular intraday boundaries');
    expect(calendar.warnings[0]).toContain('early-close calendars are not yet modeled');
    expect(daily?.firstCloseAtISO).toBe('2026-04-27T20:00:00.000Z');
  });

  it('keeps equity daily and higher closes on regular TradingView stock-session close even when intraday mode is extended', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');
    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      7,
      '2026-04-27T18:00:00.000Z',
      'equity',
      'extended',
    );

    expect(calendar.sessionMode).toBe('extended');
    expect(calendar.scheduleBasis).toContain('NYSE extended intraday boundaries');
    expect(calendar.scheduleBasis).toContain('daily+ closes use regular-session');
    expect(calendar.warnings.join(' ')).toContain('daily and higher timeframes use regular-session TradingView-style closes');
    expect(findTf(calendar, '1D').firstCloseAtISO).toBe('2026-04-27T20:00:00.000Z');
    expect(findTf(calendar, '1W').firstCloseAtISO).toBe('2026-05-01T20:00:00.000Z');
  });

  it('labels equity close clusters at the actual NY regular-session close time', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');
    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      30,
      '2026-04-30T04:00:00.000Z',
      'equity',
      'extended',
    );

    const anchorDailyCluster = calendar.forwardClusters.find((cluster) => cluster.tfs.includes('1D'));

    expect(anchorDailyCluster).toBeDefined();
    expect(anchorDailyCluster!.label).toBe('Thu Apr 30 16:00');
    expect(anchorDailyCluster!.windowStartISO).toBe('2026-04-30T20:00:00.000Z');
  });

  it('moves regular-session equity daily closes from 21:00Z to 20:00Z across US daylight saving time', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');

    const beforeDst = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      1,
      '2026-03-06T20:00:00.000Z',
      'equity',
      'regular',
    );
    const afterDst = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      1,
      '2026-03-09T19:00:00.000Z',
      'equity',
      'regular',
    );

    expect(findTf(beforeDst, '1D').firstCloseAtISO).toBe('2026-03-06T21:00:00.000Z');
    expect(findTf(afterDst, '1D').firstCloseAtISO).toBe('2026-03-09T20:00:00.000Z');
  });

  it('moves regular-session equity daily closes from 20:00Z back to 21:00Z after DST ends', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');

    const beforeDstEnds = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      1,
      '2026-10-30T19:00:00.000Z',
      'equity',
      'regular',
    );
    const afterDstEnds = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      1,
      '2026-11-02T20:00:00.000Z',
      'equity',
      'regular',
    );

    expect(findTf(beforeDstEnds, '1D').firstCloseAtISO).toBe('2026-10-30T20:00:00.000Z');
    expect(findTf(afterDstEnds, '1D').firstCloseAtISO).toBe('2026-11-02T21:00:00.000Z');
  });

  it('skips a US market holiday instead of treating it as an equity daily close', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');
    isUSMarketHolidayMock.mockImplementation((year, month, day) => year === 2026 && month === 10 && day === 26);

    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      3,
      '2026-11-26T15:00:00.000Z',
      'equity',
      'regular',
    );

    expect(findTf(calendar, '1D').firstCloseAtISO).toBe('2026-11-27T21:00:00.000Z');
  });

  it('surfaces early-close limitation while modeling day-after-Thanksgiving as a full session close', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');

    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      1,
      '2026-11-27T15:00:00.000Z',
      'equity',
      'regular',
    );

    expect(calendar.warnings.join(' ')).toContain('early-close calendars are not yet modeled');
    expect(findTf(calendar, '1D').firstCloseAtISO).toBe('2026-11-27T21:00:00.000Z');
  });

  it('puts weekly equity closes on Friday market close, not Saturday or Sunday', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');

    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      3,
      '2026-04-23T18:00:00.000Z',
      'equity',
      'regular',
    );

    expect(findTf(calendar, '1W').firstCloseAtISO).toBe('2026-04-24T20:00:00.000Z');
  });

  it('backs weekly equity close up when Friday is an observed market holiday', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');
    isUSMarketHolidayMock.mockImplementation((year, month, day) => year === 2026 && month === 6 && day === 3);

    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      180,
      '2026-01-06T15:00:00.000Z',
      'equity',
      'regular',
    );

    expect(calendar.horizonDays).toBe(30);
    expect(findTf(calendar, '26W').firstCloseAtISO).toBeNull();

    const directMins = confluenceLearningAgent.getMinutesToTimeframeClose(
      new Date('2026-01-06T15:00:00.000Z'),
      { tf: '26W', label: '26W', minutes: 262080 },
      'equity',
      'regular',
    );

    expect(new Date(new Date('2026-01-06T15:00:00.000Z').getTime() + directMins! * 60_000).toISOString())
      .toBe('2026-07-02T20:00:00.000Z');
  });

  it('uses the last trading day of the month for equity monthly closes', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');

    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      3,
      '2026-02-26T15:00:00.000Z',
      'equity',
      'regular',
    );

    expect(findTf(calendar, '1M').firstCloseAtISO).toBe('2026-02-27T21:00:00.000Z');
  });

  it('keeps 1D and 30D equity boundaries inside the 1-30 day horizon model', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');

    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      30,
      '2026-03-27T16:00:00.000Z',
      'equity',
      'regular',
    );

    expect(calendar.horizonDays).toBe(30);
    expect(findTf(calendar, '1D').closesInHorizon).toBeGreaterThan(0);
    expect(findTf(calendar, '30D').firstCloseAtISO).toBe('2026-03-30T20:00:00.000Z');
  });

  it('exposes 1-30 day, 1-26 week, and 1-12 month rows in the forward calendar', async () => {
    const { confluenceLearningAgent } = await import('../lib/confluence-learning-agent');

    const calendar = confluenceLearningAgent.computeForwardCloseCalendar(
      'CUSTOM',
      30,
      '2026-04-28T16:00:00.000Z',
      'equity',
      'regular',
    );
    const tfs = new Set(calendar.schedule.map((row) => row.tf));

    for (let day = 1; day <= 30; day++) expect(tfs.has(`${day}D`)).toBe(true);
    for (let week = 1; week <= 26; week++) expect(tfs.has(`${week}W`)).toBe(true);
    for (let month = 1; month <= 11; month++) expect(tfs.has(`${month}M`)).toBe(true);
    expect(tfs.has('1Y')).toBe(true);
  });

  it('surfaces schedule model and basis in API types and Time Scanner UI', () => {
    const apiTypes = read('app/v2/_lib/api.ts');
    const closeCalendar = read('components/time/CloseCalendar.tsx');
    const audit = read('docs/market-scanner-pros-elite-audit.md');

    expect(apiTypes).toContain('scheduleModel: CloseCalendarScheduleModel');
    expect(apiTypes).toContain("'crypto_247' | 'equity_session' | 'forex_session'");
    expect(closeCalendar).toContain('Schedule Basis:');
    expect(closeCalendar).toContain('data.scheduleModelLabel');
    expect(closeCalendar).toContain('data.timezone');
    expect(audit).toContain('Completed first pass: add `scheduleModel: equity_session | crypto_247 | forex_session` to forward close-calendar outputs.');
    expect(audit).toContain('Completed second pass: DST, holiday, early-close caveat, month-end, week-end, and 1-30 day/1-26 week/1-12 month boundary regression coverage');
  });
});
