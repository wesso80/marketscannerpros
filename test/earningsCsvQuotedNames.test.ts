import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCsv, parseCsvLine, parseCsvTable } from '@/lib/csv';
import { parseAlphaVantageEarningsCalendar } from '@/lib/earningsCalendarCsv';
import { parseEarningsCalendarCsv as parseGoldenEgg, nextEarningsFromCalendar } from '@/lib/goldenEgg/fundamentalsContext';
import { parseEarningsCalendarCsv as parseScanner, parseEarningsCalendarDetailed } from '@/lib/scanner/earningsCalendar';
import { evaluateHardBlocks } from '@/lib/scanner/hardBlocks';
import { scoreProSnapshot } from '@/lib/scanner/proScore';

// Real Alpha Vantage EARNINGS_CALENDAR lines (26 Sep 2026): CRLF, trailing timeOfTheDay column, quoted names.
const HEADER = 'symbol,name,reportDate,fiscalDateEnding,estimate,currency,timeOfTheDay';
const AV_CSV = [
  HEADER,
  'AAPL,APPLE INCORPORATED,2026-10-29,2026-09-30,1.98,USD,post-market',
  'FLG,"FLAGSTAR BANK, N.A.",2026-10-23,2026-09-30,0.09,USD,',
  'AMX,"AMERICA MOVIL, SOCIEDAD ANÓNIMAB. DE C.V.",2026-10-21,2026-09-30,0.46,USD,',
  'GEL,"GENESIS ENERGY, L.P.",2026-10-29,2026-09-30,,USD,',
  'QQX,"THE ""QUOTED"" COMPANY, INC.",2026-11-05,2026-09-30,None,USD,pre-market',
  '',
].join('\r\n');

const codes = (r: { code: string }[]) => r.map((x) => x.code);

describe('shared CSV reader (RFC 4180 basics)', () => {
  it('keeps a quoted comma inside one field', () => {
    expect(parseCsvLine('FLG,"FLAGSTAR BANK, N.A.",2026-10-23,2026-09-30,0.09,USD,')).toEqual(['FLG', 'FLAGSTAR BANK, N.A.', '2026-10-23', '2026-09-30', '0.09', 'USD', '']);
  });
  it('unescapes "" inside quotes, handles CRLF, BOM, blank lines and newlines inside quotes', () => {
    expect(parseCsvLine('X,"He said ""hi"", ok",1')).toEqual(['X', 'He said "hi", ok', '1']);
    expect(parseCsv('\ufeffa,b\r\n1,2\r\n\r\n"multi\nline",3\n')).toEqual([['a', 'b'], ['1', '2'], ['multi\nline', '3']]);
    expect(parseCsv('')).toEqual([]);
  });
  it('finds columns by header name, case-insensitively', () => {
    const t = parseCsvTable('reportDate,Symbol\n2026-10-23,FLG');
    expect(t.get(t.rows[0], 'symbol')).toBe('FLG');
    expect(t.get(t.rows[0], 'REPORTDATE')).toBe('2026-10-23');
    expect(t.get(t.rows[0], 'missing')).toBe('');
  });
});

describe('Alpha Vantage earnings calendar parser (RS-1)', () => {
  it('reads the FLG row with its quoted comma: date 2026-10-23, not dropped', () => {
    const p = parseAlphaVantageEarningsCalendar(AV_CSV, { log: false });
    expect(p.headerOk).toBe(true);
    expect(p.skipped).toEqual([]);
    expect(p.rows.find((r) => r.symbol === 'FLG')).toEqual({ symbol: 'FLG', name: 'FLAGSTAR BANK, N.A.', reportDate: '2026-10-23', fiscalDateEnding: '2026-09-30', estimate: 0.09, currency: 'USD' });
    expect(p.rows.find((r) => r.symbol === 'AMX')?.reportDate).toBe('2026-10-21');
    expect(p.rows.find((r) => r.symbol === 'GEL')).toMatchObject({ reportDate: '2026-10-29', estimate: null });
  });
  it('reads a name with escaped quotes and a comma', () => {
    const row = parseAlphaVantageEarningsCalendar(AV_CSV, { log: false }).rows.find((r) => r.symbol === 'QQX');
    expect(row).toMatchObject({ name: 'THE "QUOTED" COMPANY, INC.', reportDate: '2026-11-05', estimate: null });
  });
  it('uses header names, so column order does not matter', () => {
    const p = parseAlphaVantageEarningsCalendar('name,reportDate,symbol\n"FLAGSTAR BANK, N.A.",2026-10-23,flg', { log: false });
    expect(p.rows[0]).toMatchObject({ symbol: 'FLG', reportDate: '2026-10-23' });
  });
  it('skips a row with an unreadable date and logs it, instead of storing junk or pretending there is none', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p = parseAlphaVantageEarningsCalendar(`${HEADER}\nBAD,Bad Co,N.A.",2026-09-30,1,USD,\nOK1,Ok Co,2026-02-30,2026-09-30,1,USD,`, { source: 'test' });
    expect(p.rows).toEqual([]);
    expect(p.skipped.map((s) => s.symbol)).toEqual(['BAD', 'OK1']); // 30 Feb is not a real date either
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/skipped 2 row\(s\).*BAD \(line 2/);
    warn.mockRestore();
  });
  it('reports a non-calendar body (no header) as headerOk=false', () => {
    expect(parseAlphaVantageEarningsCalendar('<html>busy</html>').headerOk).toBe(false);
    expect(parseAlphaVantageEarningsCalendar(`${HEADER}\r\n`).headerOk).toBe(true);
  });
});

describe('every earnings consumer now sees FLG', () => {
  it('Golden Egg fundamentals: next earnings 2026-10-23', () => {
    const next = nextEarningsFromCalendar(parseGoldenEgg(AV_CSV), 'FLG', Date.UTC(2026, 8, 26));
    expect(next?.reportDate).toBe('2026-10-23');
  });
  it('scanner map stores the date, not `N.A."`', () => {
    const map = parseScanner(AV_CSV);
    expect(map.get('FLG')).toBe('2026-10-23');
    expect(map.get('AMX')).toBe('2026-10-21');
    for (const v of map.values()) expect(v).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('scanner lists symbols whose only row was unreadable', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const d = parseEarningsCalendarDetailed(`${HEADER}\nBAD,Bad Co,oops,2026-09-30,1,USD,\nFLG,"FLAGSTAR BANK, N.A.",2026-10-23,2026-09-30,0.09,USD,`);
    expect([...d.unreadable]).toEqual(['BAD']);
    expect(d.map.get('FLG')).toBe('2026-10-23');
    vi.restoreAllMocks();
  });
});

describe('scanner earnings hard block now fires for FLG', () => {
  const NOW = Date.parse('2026-10-16T02:00:00Z'); // 7 days before the 23 Oct report
  const base = { asset: 'equity' as const, timeframe: 'daily', freshness: 'fresh' as const, lastBarAt: '2026-10-15', price: 12, atrPct: 2, dollarVolumeDaily: 50_000_000, earningsCalendarLoaded: true, nowMs: NOW };

  it('gets the date from the parsed calendar and blocks inside the holding window', () => {
    const map = parseScanner(AV_CSV);
    const r = evaluateHardBlocks({ ...base, earningsDate: map.get('FLG') ?? null });
    expect(r.earnings).toMatchObject({ status: 'IN_WINDOW', date: '2026-10-23', daysUntil: 7 });
    expect(codes(r.blocks)).toContain('EARNINGS_IN_WINDOW');
  });
  it('a junk date (the old mis-split value) is UNKNOWN with a flag, never silently clear', () => {
    const r = evaluateHardBlocks({ ...base, earningsDate: 'N.A."' });
    expect(r.earnings.status).toBe('UNKNOWN');
    expect(codes(r.flags)).toContain('EARNINGS_UNKNOWN');
  });
  it('Pro snapshot: an unreadable symbol is UNKNOWN (flag), not "none in horizon"', () => {
    const pick = { symbol: 'BAD', indicators: { price: 10, ema200: 9, rsi: 60, adx: 30, atr: 0.2, macd: 1, macdSignal: 0, mfi: 60, volume: 10_000_000 }, dataBasis: { lastCompletedBarAt: '2026-10-15', barInterval: '1d', historyBars: 250 } };
    const r = scoreProSnapshot(pick, 'equity', 'daily', {}, false, { earningsMap: parseScanner(AV_CSV), earningsUnreadable: new Set(['BAD']), macroFlags: [], nowMs: NOW });
    expect(r.hardBlockDetail.earnings.status).toBe('UNKNOWN');
    expect(codes(r.compositeV2.flags)).toContain('EARNINGS_UNKNOWN');
  });
});

describe('Golden Egg next-earnings status never caches "none" after a parse failure', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('ALPHA_VANTAGE_API_KEY', 'test-key');
    vi.doMock('@/lib/avRateGovernor', () => ({ avTakeToken: vi.fn(async () => {}), avFetch: vi.fn(async () => null) }));
    vi.doMock('@/lib/onDemandFetch', () => ({ getQuote: vi.fn(async () => null) }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.doUnmock('@/lib/avRateGovernor');
    vi.doUnmock('@/lib/onDemandFetch');
  });

  it('FLG per-symbol calendar → SCHEDULED 2026-10-23', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`${HEADER}\r\nFLG,"FLAGSTAR BANK, N.A.",2026-10-23,2026-09-30,0.09,USD,\r\n`)));
    const { getNextEarningsWithStatus } = await import('@/lib/goldenEgg/companyOverview');
    const r = await getNextEarningsWithStatus('FLG');
    expect(r.status).toBe('SCHEDULED');
    expect(r.row?.reportDate).toBe('2026-10-23');
  });

  it('an unreadable row → UNKNOWN, and the next call asks the provider again', async () => {
    const fetchMock = vi.fn(async () => new Response(`${HEADER}\r\nZZZ,"Broken, Co",not-a-date,2026-09-30,1,USD,\r\n`));
    vi.stubGlobal('fetch', fetchMock);
    const { getNextEarningsWithStatus } = await import('@/lib/goldenEgg/companyOverview');
    expect((await getNextEarningsWithStatus('ZZZ')).status).toBe('UNKNOWN');
    expect((await getNextEarningsWithStatus('ZZZ')).status).toBe('UNKNOWN');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('an empty calendar (header only) is still NONE_IN_HORIZON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(`${HEADER}\r\n`)));
    const { getNextEarningsWithStatus } = await import('@/lib/goldenEgg/companyOverview');
    expect((await getNextEarningsWithStatus('NOPE')).status).toBe('NONE_IN_HORIZON');
  });
});

describe('no naive comma split left on Alpha Vantage CSV text', () => {
  const files = [
    'lib/goldenEgg/fundamentalsContext.ts',
    'lib/scanner/earningsCalendar.ts',
    'app/api/earnings/route.ts',
    'app/api/earnings-calendar/route.ts',
    'lib/jarvis/radar/collect.ts',
    'app/api/ipo-calendar/route.ts',
    'lib/jarvis/radar/stage1.ts',
  ];
  it.each(files)('%s', (f) => {
    const src = readFileSync(join(process.cwd(), f), 'utf8');
    expect(src).not.toMatch(/(line|lines\[\w+\]|lines\[0\])\.split\(\s*['"],['"]\s*\)/);
  });
});
