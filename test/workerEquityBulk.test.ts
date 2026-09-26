import { describe, expect, it } from 'vitest';
import {
  AV_DAILY_COMPACT_BARS,
  buildLiveDailyBar,
  chunkSymbols,
  dailyHistoryComplete,
  dailyRefreshMarksMs,
  equityBarScheduleFromEnv,
  hourlyRefreshMarksMs,
  isDailyRefreshDue,
  isHourlyRefreshDue,
  liveDailyBarSession,
  latestDailyRefreshMarkMs,
  latestHourlyRefreshMarkMs,
  mergeLiveDailyBar,
  parseWorkerBulkQuotes,
  avPayloadError,
  workerAvRpm,
  type DailyBar,
  type WorkerEquityQuote,
} from '@/lib/worker/equityBulk';

// September 2026 is EDT (UTC-4). 2026-09-25 is a Friday, 2026-09-28 a Monday.
const ny = (ymd: string, hhmm: string) => Date.parse(`${ymd}T${hhmm}:00-04:00`);
const nyEst = (ymd: string, hhmm: string) => Date.parse(`${ymd}T${hhmm}:00-05:00`);

describe('workerAvRpm', () => {
  it('defaults to 200 and never exceeds 200', () => {
    expect(workerAvRpm(undefined)).toBe(200);
    expect(workerAvRpm('')).toBe(200);
    expect(workerAvRpm('abc')).toBe(200);
    expect(workerAvRpm('0')).toBe(200);
    expect(workerAvRpm('500')).toBe(200);
    expect(workerAvRpm('150')).toBe(150);
  });
});

describe('chunkSymbols', () => {
  it('dedupes, upper-cases and batches at 100', () => {
    const syms = Array.from({ length: 230 }, (_, i) => `s${i}`);
    const chunks = chunkSymbols([...syms, 'S0', 's1']);
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 30]);
    expect(chunks[0][0]).toBe('S0');
    expect(chunkSymbols([])).toEqual([]);
  });
});

describe('avPayloadError', () => {
  it('reports AV error, note and information payloads', () => {
    expect(avPayloadError({ Information: 'premium endpoint' })).toBe('premium endpoint');
    expect(avPayloadError({ Note: 'rate' })).toBe('rate');
    expect(avPayloadError({ 'Error Message': 'bad' })).toBe('bad');
    expect(avPayloadError(null)).toBe('empty payload');
    expect(avPayloadError({ data: [] })).toBeNull();
  });
});

describe('parseWorkerBulkQuotes', () => {
  const now = ny('2026-09-25', '13:00');

  it('maps documented REALTIME_BULK_QUOTES rows onto the GLOBAL_QUOTE-shaped worker quote', () => {
    const quotes = parseWorkerBulkQuotes({
      data: [
        {
          symbol: 'aapl', timestamp: '2026-09-25 12:59:58.123', open: '225.10', high: '228.00', low: '224.50', close: '227.50',
          volume: '31000123', previous_close: '225.00', change: '2.50', change_percent: '1.1111%',
        },
        { symbol: 'DEAD', close: '0' },
        { close: '10' },
      ],
    }, now);
    expect([...quotes.keys()]).toEqual(['AAPL']);
    expect(quotes.get('AAPL')).toEqual({
      price: 227.5, open: 225.1, high: 228, low: 224.5, prevClose: 225, volume: 31000123,
      changeAmt: 2.5, changePct: 1.1111, latestDay: '2026-09-25',
    });
  });

  it('accepts GLOBAL_QUOTE-style keys and derives change from previous close', () => {
    const q = parseWorkerBulkQuotes({ data: [{ '01. symbol': 'MSFT', '05. price': '410', '08. previous close': '400' }] }, now).get('MSFT')!;
    expect(q.changeAmt).toBe(10);
    expect(q.changePct).toBeCloseTo(2.5, 6);
    expect(q).toMatchObject({ open: 0, high: 0, low: 0, volume: 0, latestDay: '2026-09-25' });
  });

  it('keeps pre-market quotes on the previous session (as GLOBAL_QUOTE latest trading day did)', () => {
    const preMarket = ny('2026-09-28', '08:45');
    const q = parseWorkerBulkQuotes({ data: [{ symbol: 'SPY', close: '600', timestamp: '2026-09-28 08:44:00' }] }, preMarket).get('SPY')!;
    expect(q.latestDay).toBe('2026-09-25');
    const noTs = parseWorkerBulkQuotes({ data: [{ symbol: 'SPY', close: '600' }] }, ny('2026-09-27', '12:00')).get('SPY')!;
    expect(noTs.latestDay).toBe('2026-09-25');
  });

  it('returns an empty map for error payloads', () => {
    expect(parseWorkerBulkQuotes({ Information: 'x' }, now).size).toBe(0);
    expect(parseWorkerBulkQuotes(null, now).size).toBe(0);
  });
});

const quote = (over: Partial<WorkerEquityQuote> = {}): WorkerEquityQuote => ({
  price: 101, open: 100, high: 102, low: 99, prevClose: 100, volume: 1234.4, changeAmt: 1, changePct: 1, latestDay: '2026-09-25', ...over,
});

describe('buildLiveDailyBar', () => {
  it('builds today’s bar from the quote, widening high/low to cover open and price', () => {
    expect(buildLiveDailyBar(quote(), '2026-09-25')).toEqual({ timestamp: '2026-09-25', open: 100, high: 102, low: 99, close: 101, volume: 1234 });
    expect(buildLiveDailyBar(quote({ price: 105, high: 103 }), '2026-09-25')!.high).toBe(105);
    expect(buildLiveDailyBar(quote({ price: 97 }), '2026-09-25')!.low).toBe(97);
  });

  it('refuses quotes for another session or without open/high/low', () => {
    expect(buildLiveDailyBar(quote({ latestDay: '2026-09-24' }), '2026-09-25')).toBeNull();
    expect(buildLiveDailyBar(quote({ open: 0 }), '2026-09-25')).toBeNull();
    expect(buildLiveDailyBar(quote({ low: 0 }), '2026-09-25')).toBeNull();
    expect(buildLiveDailyBar(null, '2026-09-25')).toBeNull();
  });
});

describe('mergeLiveDailyBar', () => {
  const day = (ymd: string, close: number): DailyBar => ({ timestamp: ymd, open: close, high: close, low: close, close, volume: 1 });
  const history = Array.from({ length: AV_DAILY_COMPACT_BARS }, (_, i) =>
    day(new Date(Date.UTC(2026, 4, 1 + i)).toISOString().slice(0, 10), i));

  it('replaces the realtime partial bar for the same day without changing the series length', () => {
    const last = history[history.length - 1].timestamp;
    const merged = mergeLiveDailyBar(history, day(last, 999));
    expect(merged).toHaveLength(AV_DAILY_COMPACT_BARS);
    expect(merged[merged.length - 1].close).toBe(999);
    expect(merged[0]).toEqual(history[0]);
  });

  it('appends a newer live bar and drops the oldest to keep the compact length', () => {
    const merged = mergeLiveDailyBar(history, day('2026-12-31', 5));
    expect(merged).toHaveLength(AV_DAILY_COMPACT_BARS);
    expect(merged[merged.length - 1].timestamp).toBe('2026-12-31');
    expect(merged[0]).toEqual(history[1]);
  });

  it('ignores a live bar older than the held history and sorts unsorted input', () => {
    const merged = mergeLiveDailyBar([day('2026-09-25', 2), day('2026-09-24', 1)], day('2026-09-23', 9));
    expect(merged.map((b) => b.close)).toEqual([1, 2]);
    expect(mergeLiveDailyBar([], day('2026-09-25', 3))).toHaveLength(1);
  });
});

describe('refresh marks', () => {
  it('daily: pre-open 09:00 ET and close + 20 min (13:20 on early-close days); none on holidays / weekends', () => {
    expect(dailyRefreshMarksMs('2026-09-25')).toEqual([ny('2026-09-25', '09:00'), ny('2026-09-25', '16:20')]);
    expect(dailyRefreshMarksMs('2026-11-27')).toEqual([nyEst('2026-11-27', '09:00'), nyEst('2026-11-27', '13:20')]);
    expect(dailyRefreshMarksMs('2026-11-26')).toEqual([]); // Thanksgiving
    expect(dailyRefreshMarksMs('2026-09-26')).toEqual([]); // Saturday
  });

  it('hourly: pre-open plus each regular-session hourly close + 2 min (8 per full day)', () => {
    const marks = hourlyRefreshMarksMs('2026-09-25');
    expect(marks).toHaveLength(8);
    expect(marks[0]).toBe(ny('2026-09-25', '09:00'));
    expect(marks[1]).toBe(ny('2026-09-25', '10:02'));
    expect(marks[7]).toBe(ny('2026-09-25', '16:02'));
    expect(hourlyRefreshMarksMs('2026-11-27')).toHaveLength(5); // 09:00, 10:02 … 13:02
  });

  it('latest mark walks back over weekends', () => {
    expect(latestDailyRefreshMarkMs(ny('2026-09-27', '12:00'))).toBe(ny('2026-09-25', '16:20'));
    expect(latestDailyRefreshMarkMs(ny('2026-09-28', '08:59'))).toBe(ny('2026-09-25', '16:20'));
    expect(latestDailyRefreshMarkMs(ny('2026-09-28', '09:00'))).toBe(ny('2026-09-28', '09:00'));
    expect(latestHourlyRefreshMarkMs(ny('2026-09-28', '11:30'))).toBe(ny('2026-09-28', '11:02'));
  });
});

describe('due planning', () => {
  it('daily history: fetch once when missing, then only after the close + settle and pre-open', () => {
    const t0 = ny('2026-09-25', '10:15');
    expect(isDailyRefreshDue(undefined, t0)).toBe(true);
    const state = { fetchedAtMs: t0, complete: true };
    // Every minute through the session: not due
    for (let m = 1; m < 365; m++) expect(isDailyRefreshDue(state, t0 + m * 60_000)).toBe(false);
    expect(isDailyRefreshDue(state, ny('2026-09-25', '16:19'))).toBe(false);
    expect(isDailyRefreshDue(state, ny('2026-09-25', '16:20'))).toBe(true);
    const after = { fetchedAtMs: ny('2026-09-25', '16:21'), complete: true };
    expect(isDailyRefreshDue(after, ny('2026-09-27', '12:00'))).toBe(false); // weekend
    expect(isDailyRefreshDue(after, ny('2026-09-28', '09:00'))).toBe(true); // Monday pre-open
  });

  it('daily history: an incomplete post-close fetch retries every 15 min inside the retry window only', () => {
    const fetched = { fetchedAtMs: ny('2026-09-25', '16:21'), complete: false };
    expect(isDailyRefreshDue(fetched, ny('2026-09-25', '16:30'))).toBe(false);
    expect(isDailyRefreshDue(fetched, ny('2026-09-25', '16:36'))).toBe(true);
    expect(isDailyRefreshDue({ fetchedAtMs: ny('2026-09-25', '20:10'), complete: false }, ny('2026-09-25', '20:30'))).toBe(false);
  });

  it('60min: due only after each hourly close + settle (≈8 fetches per symbol per day)', () => {
    let state: { fetchedAtMs: number; complete: boolean } | undefined;
    let fetches = 0;
    for (let t = ny('2026-09-25', '04:00'); t < ny('2026-09-25', '20:00'); t += 60_000) {
      if (isHourlyRefreshDue(state, t)) { fetches++; state = { fetchedAtMs: t, complete: true }; }
    }
    expect(fetches).toBe(1 + 8); // initial fetch + 8 marks
  });

  it('dailyHistoryComplete requires the latest closed session', () => {
    const bars = [{ timestamp: '2026-09-24' }, { timestamp: '2026-09-25' }];
    expect(dailyHistoryComplete(bars, ny('2026-09-25', '16:21'))).toBe(true);
    expect(dailyHistoryComplete(bars.slice(0, 1), ny('2026-09-25', '16:21'))).toBe(false);
    expect(dailyHistoryComplete(bars.slice(0, 1), ny('2026-09-25', '12:00'))).toBe(true);
    expect(dailyHistoryComplete([], ny('2026-09-25', '12:00'))).toBe(false);
  });
});

describe('liveDailyBarSession', () => {
  it('builds the live bar for the opened session until the history was refetched after its close', () => {
    const morningFetch = { fetchedAtMs: ny('2026-09-25', '09:00'), complete: true };
    expect(liveDailyBarSession(morningFetch, ny('2026-09-25', '11:00'))).toBe('2026-09-25');
    // 16:00–16:20: still today’s bar from the quote (no gap before the post-close refetch)
    expect(liveDailyBarSession(morningFetch, ny('2026-09-25', '16:15'))).toBe('2026-09-25');
    const postClose = { fetchedAtMs: ny('2026-09-25', '16:21'), complete: true };
    expect(liveDailyBarSession(postClose, ny('2026-09-25', '19:30'))).toBeNull();
    expect(liveDailyBarSession(postClose, ny('2026-09-28', '08:45'))).toBeNull(); // Monday pre-market
    expect(liveDailyBarSession(postClose, ny('2026-09-28', '09:31'))).toBe('2026-09-28');
    // An incomplete post-close fetch keeps the quote-built bar
    expect(liveDailyBarSession({ ...postClose, complete: false }, ny('2026-09-25', '16:30'))).toBe('2026-09-25');
    expect(liveDailyBarSession(undefined, ny('2026-09-27', '12:00'))).toBe('2026-09-25');
  });
});

describe('equityBarScheduleFromEnv', () => {
  it('reads overrides and rejects out-of-range values', () => {
    const cfg = equityBarScheduleFromEnv({ WORKER_AV_DAILY_SETTLE_MINUTES: '30', WORKER_AV_PREOPEN_REFRESH: '08:30', WORKER_AV_HOURLY_SETTLE_MINUTES: '999' });
    expect(cfg.dailySettleMin).toBe(30);
    expect(cfg.preOpenMin).toBe(8 * 60 + 30);
    expect(cfg.hourlySettleMin).toBe(2);
    expect(equityBarScheduleFromEnv({ WORKER_AV_PREOPEN_REFRESH: '10:00' }).preOpenMin).toBe(9 * 60);
  });
});
