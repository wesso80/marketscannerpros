import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// C1: the Morning Brief serves the saved brief with its age; "Rebuild" is overlap-protected and rate-limited;
// admin builds never overwrite the cron/email brief; the scan part comes from the shared saved scan; the
// email job defaults to equities while crypto is off and is idempotent per day.

const m = vi.hoisted(() => ({
  q: vi.fn(async (_sql: string, _params?: unknown[]) => [] as unknown[]),
  cg: vi.fn(() => false),
}));
vi.mock('@/lib/db', () => ({ q: m.q }));
vi.mock('@/lib/operator/market-data', async (orig) => ({
  ...(await orig<typeof import('@/lib/operator/market-data')>()),
  operatorCgFetchEnabled: m.cg,
}));

import {
  morningBriefRowId,
  requestMorningBriefRebuild,
  saveMorningBriefSnapshot,
  savedScanForBrief,
  dailyMorningBriefId,
  type MorningBrief,
} from '@/lib/admin/morning-brief';
import { defaultAdminMarket, resolveAdminMarket } from '@/lib/admin/defaultAdminMarket';
import type { SavedScanView, SavedPacket } from '@/lib/admin/sharedScan';

const brief = (over: Partial<MorningBrief> = {}) => ({
  briefId: '2026-09-27:EQUITIES:15m', generatedAt: '2026-09-26T22:00:00.000Z', market: 'EQUITIES', timeframe: '15m',
  deskState: 'WAIT', headline: 'h', topPlays: [], watchlist: [], avoidList: [], catalysts: [], ...over,
}) as unknown as MorningBrief;

beforeEach(() => {
  m.q.mockReset();
  m.q.mockImplementation(async () => []);
  m.cg.mockReturnValue(false);
});

describe('admin market default', () => {
  it('EQUITIES while crypto data is off, CRYPTO when on; explicit values win', () => {
    expect(defaultAdminMarket()).toBe('EQUITIES');
    expect(resolveAdminMarket(undefined)).toBe('EQUITIES');
    expect(resolveAdminMarket('crypto')).toBe('CRYPTO');
    expect(resolveAdminMarket('EQUITY')).toBe('EQUITIES');
    m.cg.mockReturnValue(true);
    expect(defaultAdminMarket()).toBe('CRYPTO');
    expect(resolveAdminMarket('junk')).toBe('CRYPTO');
  });
});

describe('saving briefs', () => {
  it('admin saves go to a separate ":admin" row and never replace a cron/email row', async () => {
    const saved = await saveMorningBriefSnapshot(brief(), 'admin');
    expect(saved.briefId).toBe('2026-09-27:EQUITIES:15m:admin');
    const insert = m.q.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO admin_morning_briefs'));
    expect(insert?.[1]?.[0]).toBe('2026-09-27:EQUITIES:15m:admin');
    expect(String(insert?.[0])).toContain("WHERE NOT (admin_morning_briefs.source IN ('cron', 'email') AND EXCLUDED.source = 'admin')");
  });

  it('cron saves keep the day id', async () => {
    const saved = await saveMorningBriefSnapshot(brief(), 'cron');
    expect(saved.briefId).toBe('2026-09-27:EQUITIES:15m');
    expect(morningBriefRowId({ briefId: 'x:admin' }, 'cron')).toBe('x');
    expect(morningBriefRowId({ briefId: 'x:admin' }, 'admin')).toBe('x:admin');
  });

  it('the day id matches what the brief builder uses (Sydney date)', () => {
    expect(dailyMorningBriefId('EQUITIES', '15m', Date.parse('2026-09-26T22:00:00Z'))).toBe('2026-09-27:EQUITIES:15m');
  });
});

describe('Rebuild', () => {
  it('429 when an admin brief was built within the interval', async () => {
    m.q.mockImplementation(async (sql: string) => (String(sql).includes('MAX(generated_at)') ? [{ last: new Date(Date.now() - 60_000).toISOString() }] : []));
    const build = vi.fn();
    const r = await requestMorningBriefRebuild({ market: 'EQUITIES', build: build as never });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(429);
      expect(r.retryAfterSec).toBeGreaterThan(0);
    }
    expect(build).not.toHaveBeenCalled();
  });

  it('409 while a rebuild for the market is running; the first one saves as admin', async () => {
    let release: () => void = () => {};
    const build = vi.fn(() => new Promise<MorningBrief>((res) => { release = () => res(brief()); }));
    const first = requestMorningBriefRebuild({ market: 'EQUITIES', build: build as never });
    await new Promise((r) => setTimeout(r, 0));
    const second = await requestMorningBriefRebuild({ market: 'EQUITIES', build: build as never });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.status).toBe(409);
    release();
    const done = await first;
    expect(done.ok).toBe(true);
    if (done.ok) expect(done.saved.brief.briefId).toBe('2026-09-27:EQUITIES:15m:admin');
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ market: 'EQUITIES' }));
  });
});

describe('brief from the shared saved scan', () => {
  const pkt = (symbol: string, meta: Partial<SavedPacket['savedScan']>) => ({
    symbol, savedScan: { status: 'ok', stale: false, noSetup: false, asOfLabel: null, ...meta },
  }) as unknown as SavedPacket;
  const row = (symbol: string, status: string, hits: unknown[]) => ({ symbol, status, hits }) as never;
  const view = {
    available: true, market: 'EQUITIES', timeframe: '15m', ageLabel: '20 min ago', newestScannedAt: '2026-09-26T21:40:00Z',
    running: null, lastRun: null, oldestScannedAt: null, ageSec: 1200, missingSymbols: [],
    packets: [
      pkt('MA', { asOfLabel: 'as of Fri 25 Sep 2026 close' }),
      pkt('AAPL', { noSetup: true }),
      pkt('NVDA', { status: 'failed' }),
      pkt('TSLA', { stale: true }),
    ],
    rows: [
      row('MA', 'ok', [{ symbol: 'MA', confidence: 71, marketPermission: 'GO' }]),
      row('AAPL', 'ok', []),
      row('NVDA', 'failed', [{ symbol: 'NVDA', confidence: 90, marketPermission: 'GO' }]),
      row('TSLA', 'ok', [{ symbol: 'TSLA', confidence: 80, marketPermission: 'GO' }]),
    ],
  } as unknown as SavedScanView;

  it('ranks only current, succeeded results with a setup; counts failures; labels the source', () => {
    const r = savedScanForBrief(view, 50, 'fallback');
    expect(r.symbols).toEqual(['MA']);
    expect(r.hits.map((h) => h.symbol)).toEqual(['MA']);
    expect(r.hits[0].riskSource).toBe('fallback');
    expect(r.health.errorsCount).toBe(1);
    expect(r.health.symbolsScanned).toBe(4);
    expect(r.source.kind).toBe('saved-scan');
    expect(r.source.rankedSymbols).toBe(1);
    expect(r.source.note).toContain('1 of 4 saved equities results');
    expect(r.source.note).toContain('as of Fri 25 Sep 2026 close');
  });

  it('unavailable saved scan → nothing ranked, degraded health', () => {
    const r = savedScanForBrief({ ...view, available: false, message: 'table missing', packets: [], rows: [] }, 50, 'fallback');
    expect(r.hits).toEqual([]);
    expect(r.health.feed).toBe('DEGRADED');
    expect(r.source.note).toContain('unavailable');
  });
});

describe('wiring (source checks)', () => {
  const lib = readFileSync('lib/admin/morning-brief.ts', 'utf8');
  const route = readFileSync('app/api/admin/morning-brief/route.ts', 'utf8');
  const job = readFileSync('app/api/jobs/email-morning-brief/route.ts', 'utf8');
  const page = readFileSync('app/admin/morning-brief/page.tsx', 'utf8');
  const commander = readFileSync('app/admin/commander/page.tsx', 'utf8');

  it('builder defaults to the admin market and reads the saved scan unless a custom list is given', () => {
    expect(lib).not.toContain('options.market ?? "CRYPTO"');
    expect(lib).toContain('options.market ?? defaultAdminMarket()');
    expect(lib).toContain('readSavedScan(');
  });

  it('GET serves the saved brief (load, not build+save on every request); POST is the rebuild', () => {
    expect(route).toContain('loadLatestMorningBrief(market, timeframe)');
    expect(route).toContain('requestMorningBriefRebuild(');
    expect(route).not.toContain('(searchParams.get("market") || "CRYPTO")');
    expect(route).toContain('resolveAdminMarket(');
  });

  it('email job: equities default, idempotent per day for cron, saved after sending', () => {
    expect(job).toContain('resolveAdminMarket(body.market)');
    expect(job).toContain('cronBriefAlreadySent(dayKey)');
    expect(job).toContain('"already_sent"');
    expect(job).toContain('"in_progress"');
    expect(job.indexOf('sendAlertEmail({ to, subject, html })')).toBeLessThan(job.indexOf('saveMorningBriefSnapshot(brief'));
  });

  it('page and commander use a client timeout with a clear error; page has Rebuild and shows age', () => {
    expect(page).toContain('fetchWithTimeout("/api/admin/morning-brief"');
    expect(page).toContain('Timed out after');
    expect(page).toContain('Rebuild');
    expect(page).toContain('savedMeta.ageLabel');
    expect(page).not.toContain('Building morning brief...');
    expect(commander).toContain('fetchWithTimeout("/api/admin/morning-brief"');
    expect(commander).not.toContain('morning-brief?scanLimit=20');
  });
});
