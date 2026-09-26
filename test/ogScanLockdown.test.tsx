import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';

const mocks = vi.hoisted(() => ({ loadShare: vi.fn(), loadLatest: vi.fn() }));
vi.mock('@/lib/og/scanShareData', () => ({ loadShare: mocks.loadShare }));
vi.mock('@/lib/og/dailyPicksLatest', () => ({ loadLatestDailyPicks: mocks.loadLatest }));

import { GET } from '@/app/api/og/scan/route';
import { buildScanOgModel, ogSafeText, parseOgScanParams, scanOgImageUrl } from '@/lib/og/scanOg';

const share = (over: Record<string, unknown> = {}) => ({
  symbol: 'NVDA', side: 'LONG', score: 74, verdict: 'PASS · B · Pullback · uncalibrated', basisNote: null,
  price: 187.42, changePct: 1.2, float: null, shortPct: null, sector: 'TECHNOLOGY',
  headline: 'NVDA: PASS · B · Pullback · uncalibrated (long side) on 2026-09-25',
  fetchedAt: '2026-09-25T00:00:00.000Z', source: 'daily_picks', ...over,
});
const day = { scan_date: '2026-09-25', picks: [{ symbol: 'NVDA', asset_class: 'equity' }, { symbol: 'SOL', asset_class: 'crypto' }, { symbol: 'AVGO', asset_class: 'equity' }, { symbol: 'NEM', asset_class: 'equity' }] };
const loaders = () => ({ loadShare: mocks.loadShare, loadLatestDailyPicks: mocks.loadLatest });
const sp = (q: string) => new URLSearchParams(q);
const INJECT = 'headline=FREE%20MONEY%20BUY%20NOW&sub=Guaranteed%2010x&score=100&price=1&sector=HACKED&float=1&shortPct=99&rvol=50&side=LONG';

beforeEach(() => {
  mocks.loadShare.mockReset();
  mocks.loadLatest.mockReset();
});

describe('parseOgScanParams', () => {
  it('accepts real symbols, DAILY and a valid date', () => {
    for (const s of ['NVDA', 'brk.b', 'BTC-USD', 'DAILY', 'X']) expect(parseOgScanParams(sp(`symbol=${s}`)).ok).toBe(true);
    expect(parseOgScanParams(sp('symbol=DAILY&date=2026-09-25'))).toEqual({ ok: true, params: { symbol: 'DAILY', date: '2026-09-25' } });
  });
  it('rejects missing, oversized or free-text symbols and bad dates', () => {
    for (const q of ['', 'symbol=', 'symbol=BUY%20NOW', 'symbol=%3Cscript%3E', 'symbol=ABCDEFGHIJKLMNOPQ', 'symbol=A..B', 'symbol=NVDA&date=2026-02-30', 'symbol=NVDA&date=tomorrow']) {
      expect(parseOgScanParams(sp(q)).ok).toBe(false);
    }
  });
});

describe('buildScanOgModel: every word comes from stored data', () => {
  it('ignores headline/sub/score/price/sector/side from the query', async () => {
    mocks.loadShare.mockResolvedValue(share());
    const r = await buildScanOgModel(sp(`symbol=nvda&${INJECT}`), loaders());
    expect(mocks.loadShare).toHaveBeenCalledWith('NVDA');
    expect(r.status).toBe(200);
    const json = JSON.stringify(r);
    for (const bad of ['FREE MONEY', 'Guaranteed', 'HACKED', '99', '$1.00', '100/100', '50x']) expect(json).not.toContain(bad);
    if (r.status === 200) {
      expect(r.model).toMatchObject({ symbol: 'NVDA', side: 'LONG', headline: share().headline });
      expect(r.model.stats).toEqual([
        { label: 'Setup score', value: '74/100' }, { label: 'Price', value: '$187.42' }, { label: 'Sector', value: 'TECHNOLOGY' },
      ]);
      expect(r.model.sub).toBe('Snapshot 2026-09-25 · Educational research only. Not financial advice.');
    }
  });

  it('DAILY uses the latest stored snapshot (top 3, crypto as -USD), not query text', async () => {
    mocks.loadLatest.mockResolvedValue(day);
    const r = await buildScanOgModel(sp(`symbol=DAILY&date=2020-01-01&${INJECT}`), loaders());
    expect(r).toMatchObject({ status: 200, model: { symbol: 'DAILY', side: 'WATCH', headline: 'Top picks for 2026-09-25', sub: 'NVDA, SOL-USD, AVGO · Educational research only. Not financial advice.' } });
    expect(JSON.stringify(r)).not.toContain('FREE MONEY');
  });

  it('bounds stored text and keeps it inside the bundled font', async () => {
    mocks.loadShare.mockResolvedValue(share({ headline: `ACME ≥ 2× ${'x'.repeat(300)} \u0007\u{1F680}`, sector: 'S'.repeat(80) }));
    const r = await buildScanOgModel(sp('symbol=ACME'), loaders());
    if (r.status !== 200) throw new Error('expected 200');
    expect(r.model.headline.length).toBeLessThanOrEqual(110);
    expect(r.model.headline.startsWith('ACME >= 2× x')).toBe(true);
    expect(r.model.headline).not.toMatch(/[\u0000-\u001F\u{1F680}]/u);
    expect(r.model.stats.find((s) => s.label === 'Sector')!.value.length).toBeLessThanOrEqual(22);
    expect(ogSafeText('a\u2014b\u00e9', 10)).toBe('a\u2014b\u00e9');
  });

  it('404 when nothing is stored, 503 when the database fails, 400 on bad input', async () => {
    mocks.loadShare.mockResolvedValue(null);
    expect((await buildScanOgModel(sp('symbol=ZZZZ'), loaders())).status).toBe(404);
    mocks.loadShare.mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await buildScanOgModel(sp('symbol=ZZZZ'), loaders())).status).toBe(503);
    expect((await buildScanOgModel(sp('headline=hi'), loaders())).status).toBe(400);
    expect(mocks.loadShare).toHaveBeenCalledTimes(2);
  });
});

describe('GET /api/og/scan', () => {
  it('returns image/png built from stored data, cached, without fetching fonts', async () => {
    mocks.loadShare.mockResolvedValue(share({ symbol: 'AMD', headline: 'AMD — research snapshot' }));
    const f = vi.spyOn(globalThis, 'fetch');
    const res = await GET(new Request(`http://x/api/og/scan?symbol=AMD&${INJECT}`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toMatch(/s-maxage=600/);
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(f).not.toHaveBeenCalled();
    const again = await GET(new Request('http://x/api/og/scan?symbol=AMD'));
    expect(again.headers.get('x-og-cache')).toBe('hit');
    f.mockRestore();
  });

  it('bad or missing symbol is a plain-text 400, never an image', async () => {
    const res = await GET(new Request('http://x/api/og/scan?headline=Buy%20now'));
    expect(res.status).toBe(400);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(mocks.loadShare).not.toHaveBeenCalled();
  });
});

describe('callers', () => {
  it('build the image URL from the symbol (and date) only', () => {
    expect(scanOgImageUrl('NVDA')).toBe('https://marketscannerpros.app/api/og/scan?symbol=NVDA');
    expect(scanOgImageUrl('DAILY', '2026-09-25')).toBe('https://marketscannerpros.app/api/og/scan?symbol=DAILY&date=2026-09-25');
    const sharePage = readFileSync('app/share/scan/[symbol]/page.tsx', 'utf8');
    const dailyPage = readFileSync('app/daily-pick/page.tsx', 'utf8');
    expect(sharePage).toContain('scanOgImageUrl(data.symbol)');
    expect(dailyPage).toContain("scanOgImageUrl('DAILY', data?.scan_date ?? null)");
    for (const src of [sharePage, dailyPage]) expect(src).not.toMatch(/api\/og\/scan\?|headline=|sub=/);
  });
});
