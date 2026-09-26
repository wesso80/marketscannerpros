import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';

const mocks = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));

import { GET as radarGET } from '@/app/api/share/radar/[file]/route';
import { GET as setupGET } from '@/app/api/share/setup/[file]/route';
import { GET as m2GET } from '@/app/api/share/m2/[file]/route';
import { clipText, parsePngFile, parseShareDate, parseShareSymbol, toFontSafe } from '@/lib/share/validate';
import { clearShareCache } from '@/lib/share/respond';
import { radarModelFromRow } from '@/lib/share/radarCard';
import { setupModelFromRow } from '@/lib/share/setupCard';
import { loadM2CardModel, persistedOnlyDeps } from '@/lib/share/m2Card';
import { memoryGlobalM2Store } from '@/lib/intelligence/data/globalM2Store';

const NOW = Date.UTC(2026, 8, 26, 6);
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ctx = (file: string) => ({ params: Promise.resolve({ file }) });
const isPng = async (res: Response) => {
  const b = new Uint8Array(await res.arrayBuffer());
  return PNG_SIG.every((v, i) => b[i] === v) && b.length > 10_000 && b.length < 1_500_000;
};

const radarRow = (over: Record<string, unknown> = {}) => ({
  session_date: '2026-09-25', status: 'COMPLETE', headline: '312/498 equities up, 8 research candidates', generated_at: '2026-09-25T21:42:10Z',
  market: [{ label: 'Equities', value: 'SPY +0.62% · 27 names ≥2× volume' }, { label: 'Crypto', value: 'BTC +1.8%' }, { label: 'Dollar', value: 'UUP flat' }],
  candidates: [
    { symbol: 'NVDA', assetClass: 'equity', setupType: 'PULLBACK', whySurfaced: 'SENTINEL_WHY', caveat: 'SENTINEL_CAVEAT', lifecycle: 'SENTINEL_LC', score: 91 },
    { symbol: 'SOL', assetClass: 'crypto', setupType: 'TREND_CONTINUATION' },
  ],
  ...over,
});
const pickRow = (over: Record<string, unknown> = {}) => ({
  symbol: 'NVDA', asset_class: 'equity', scan_date: '2026-09-25', price: '187.42', direction: 'bullish', score: 74,
  canonical: {
    permission: 'PASS', grade: 'B', setupType: 'PULLBACK', direction: 'long', score: 74, scoreBasis: 'factor_alignment_uncalibrated', calibration: null,
    watchReasons: [], levels: { entry: 186.9, invalidation: 181.35, target: 198.2, riskReward: 2.04, invalidationBasis: 'swing', targetBasis: 'opposing_level', flags: [] },
  },
  ...over,
});

beforeEach(() => {
  clearShareCache();
  mocks.q.mockReset();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('share card input validation', () => {
  it('accepts only real YYYY-MM-DD dates from 2020 to tomorrow', () => {
    expect(parseShareDate('2026-09-25', NOW)).toBe('2026-09-25');
    for (const bad of ['2026-9-25', '2026-02-30', '20260925', '2019-12-31', '2027-01-01', '2026-09-25T00:00', '', null, undefined]) {
      expect(parseShareDate(bad as string, NOW)).toBeNull();
    }
  });

  it('accepts ticker-shaped symbols only', () => {
    expect(parseShareSymbol('nvda')).toBe('NVDA');
    expect(parseShareSymbol('BRK.B')).toBe('BRK.B');
    expect(parseShareSymbol('BTC-USD')).toBe('BTC-USD');
    for (const bad of ['<script>', 'A B', '../etc', 'NVDA%20', 'ABCDEFGHIJKLMNOPQ', 'BUY NOW', '', null]) {
      expect(parseShareSymbol(bad as string)).toBeNull();
    }
  });

  it('serves .png names only', () => {
    expect(parsePngFile('NVDA.png')).toBe('NVDA');
    expect(parsePngFile('latest.png')).toBe('latest');
    for (const bad of ['NVDA.jpg', 'NVDA', 'NVDA.png.exe', '..%2F.png', 'a'.repeat(30) + '.png']) expect(parsePngFile(bad)).toBeNull();
  });

  it('clips stored text, strips control characters and keeps it inside the bundled font', () => {
    expect(clipText('a\u0000b\n  c', 20)).toBe('a b c');
    expect(clipText('x'.repeat(50), 10)).toBe('xxxxxxxxx…');
    expect(toFontSafe('27 names ≥2× volume → up 🚀')).toBe('27 names >=2× volume -> up ');
  });
});

describe('GET /api/share/radar/<date|latest>.png', () => {
  it('rejects bad names with plain-text 400 and never queries', async () => {
    for (const f of ['2026-13-01.png', 'today.png', 'latest.jpg', 'x.png']) {
      const res = await radarGET(new Request('http://x'), ctx(f));
      expect(res.status).toBe(400);
      expect(res.headers.get('content-type')).toContain('text/plain');
    }
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('404s (text, not an image) when there is no report', async () => {
    mocks.q.mockResolvedValue([]);
    const res = await radarGET(new Request('http://x'), ctx('2026-09-24.png'));
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('text/plain');
  });

  it('returns a cacheable PNG for a dated report, and serves repeats from memory', async () => {
    mocks.q.mockResolvedValue([radarRow()]);
    const res = await radarGET(new Request('http://x'), ctx('2026-09-25.png'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('s-maxage=86400');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(await isPng(res)).toBe(true);
    const again = await radarGET(new Request('http://x'), ctx('2026-09-25.png'));
    expect(again.headers.get('x-share-cache')).toBe('hit');
    expect(await isPng(again)).toBe(true);
    expect(mocks.q).toHaveBeenCalledTimes(1);
  });

  it('latest uses a short cache; the SQL reads only the teaser fields and never FAILED reports', async () => {
    mocks.q.mockResolvedValue([radarRow()]);
    const res = await radarGET(new Request('http://x'), ctx('latest.png'));
    expect(res.headers.get('cache-control')).toContain('s-maxage=900');
    const sql = String(mocks.q.mock.calls[0][0]);
    expect(sql).toContain("status <> 'FAILED'");
    expect(sql).not.toMatch(/SELECT \*|email_|run_id|report_markdown|dataHealth|'run'|'health'|'lifecycle'|workspace/i);
    expect(sql).toContain("report_json->'marketIn30Seconds'");
  });

  it('the card model carries only the teaser (no candidate notes, scores or delivery fields)', () => {
    const m = radarModelFromRow({ ...radarRow(), email_status: 'SENT', run_id: 'SENTINEL_RUN' } as never)!;
    const json = JSON.stringify(m);
    for (const s of ['SENTINEL', 'SENT"', '91', 'UUP']) expect(json).not.toContain(s);
    expect(m.candidates).toEqual([{ symbol: 'NVDA', setup: 'pullback' }, { symbol: 'SOL-USD', setup: 'trend continuation' }]);
    expect(m.lines.map((l) => l.label)).toEqual(['Equities', 'Crypto']);
    expect(radarModelFromRow(radarRow({ status: 'FAILED' }))).toBeNull();
  });
});

describe('GET /api/share/setup/<SYMBOL>.png', () => {
  it('rejects bad symbols and dates without querying', async () => {
    for (const [f, qs] of [['BUY%20NOW.png', ''], ['<b>.png', ''], ['NVDA.jpg', ''], ['NVDA.png', '?date=yesterday']]) {
      const res = await setupGET(new Request(`http://x/api/share/setup/${f}${qs}`), ctx(f));
      expect(res.status).toBe(400);
    }
    expect(mocks.q).not.toHaveBeenCalled();
  });

  it('renders the stored setup as a PNG; the symbol is a bound parameter; only ?date is read', async () => {
    mocks.q.mockResolvedValue([pickRow()]);
    const res = await setupGET(new Request('http://x/api/share/setup/nvda.png?date=2026-09-25&headline=BUY+NOW&sub=x'), ctx('nvda.png'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(await isPng(res)).toBe(true);
    const [sql, params] = mocks.q.mock.calls[0];
    expect(sql).not.toContain('NVDA');
    expect(params).toEqual([['NVDA'], '2026-09-25']);
    expect(String(sql)).not.toMatch(/SELECT \*|workspace|user|portfolio|journal/i);
    const src = readFileSync('app/api/share/setup/[file]/route.tsx', 'utf8');
    expect(src.match(/searchParams\.get\('(\w+)'\)/g)).toEqual(["searchParams.get('date')"]);
  });

  it('looks up crypto by base symbol and shows it as -USD', async () => {
    mocks.q.mockResolvedValue([pickRow({ symbol: 'SOL', asset_class: 'crypto' })]);
    await setupGET(new Request('http://x/api/share/setup/SOL-USD.png'), ctx('SOL-USD.png'));
    expect(mocks.q.mock.calls[0][1]).toEqual([['SOL-USD', 'SOL']]);
    expect(setupModelFromRow(pickRow({ symbol: 'SOL', asset_class: 'crypto' })).symbol).toBe('SOL-USD');
  });

  it('never presents a setup older than 7 days as latest', async () => {
    mocks.q.mockResolvedValue([pickRow({ scan_date: '2026-09-15' })]);
    const res = await setupGET(new Request('http://x/api/share/setup/NVDA.png'), ctx('NVDA.png'));
    expect(res.status).toBe(404);
  });

  it('model: verdict, score and reference levels from the stored canonical result', () => {
    const m = setupModelFromRow(pickRow());
    expect(m).toMatchObject({ symbol: 'NVDA', side: 'bullish', verdict: 'PASS · B · Pullback · uncalibrated', price: '187.42' });
    expect(m.levels).toEqual({ entry: '186.90', invalidation: '181.35', target: '198.20', targetBasis: 'swing level', riskReward: '2.04R' });
    expect(setupModelFromRow(pickRow({ canonical: null })).levels).toBeNull();
    expect(m.priceLabel).toBe('Price at scan');
  });

  it('crypto: shows the completed daily bar close the levels use, not the scan-time spot quote', () => {
    const base = pickRow().canonical as Record<string, unknown>;
    const m = setupModelFromRow(pickRow({
      symbol: 'SOL', asset_class: 'crypto', price: '121.10000000',
      canonical: { ...base, raw: { close: 117.01 }, barDate: '2026-09-24T00:00:00.000Z' },
    }));
    expect(m).toMatchObject({ symbol: 'SOL-USD', price: '117.01', priceLabel: 'Daily close 2026-09-24', barDate: '2026-09-24' });
  });
});

describe('GET /api/share/m2/latest.png', () => {
  const months = Array.from({ length: 15 }, (_, i) => new Date(Date.UTC(2025, 5 + i, 1)).toISOString().slice(0, 7));
  const series = (base: number) => ({ observations: months.map((month, i) => ({ month, usdM2: base * (1 + 0.004 * i) })), latestFetchedAt: '2026-09-02T06:00:00.000Z' });

  it('stubs every live provider, so the card reads the persisted store with no network calls', async () => {
    const deps = persistedOnlyDeps();
    expect(Object.keys(deps)).toHaveLength(21);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const m = await loadM2CardModel({ store: memoryGlobalM2Store({ US: series(21e12), CN: series(43e12), EU: series(16e12) }) });
    expect(fetchSpy).not.toHaveBeenCalled();
    // The engine reads lag-1 (latest stored Aug 2026 → observation month Jul 2026), as the Global M2 page does.
    expect(m).toMatchObject({ blocCount: '3 of 11 blocs', dataThrough: 'Jul 2026', lastIngested: '2026-09-02' });
    // Coverage below the threshold: no cross-bloc cycle on the card.
    expect(m!.interpretation).toBeNull();
    expect(m!.coverageNote).toContain('cross-bloc cycle not shown');
  });

  it('answers 503 text (not an empty image) when nothing is persisted, and 400 for other names', async () => {
    const prev = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const res = await m2GET(new Request('http://x'), ctx('latest.png'));
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await m2GET(new Request('http://x'), ctx('2026-09.png'))).status).toBe(400);
    if (prev !== undefined) process.env.DATABASE_URL = prev;
  });
});
