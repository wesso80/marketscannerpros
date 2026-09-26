import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  store: {
    acquireRunLock: vi.fn(),
    finishRun: vi.fn(async () => undefined),
    pruneOldRuns: vi.fn(async () => undefined),
    lastManualRunAt: vi.fn(async () => null as number | null),
    loadRunStatus: vi.fn(async () => ({ lastRun: null, running: null })),
    loadPriorResults: vi.fn(),
    saveScanResult: vi.fn(async () => undefined),
    markResultStatus: vi.fn(async () => undefined),
    saveQuotes: vi.fn(async () => undefined),
    loadSavedResults: vi.fn(async () => []),
    isMissingTableError: (err: unknown) => /does not exist/.test(String((err as Error)?.message)),
  },
  avFetch: vi.fn(),
  buildScan: vi.fn(),
  cross: vi.fn(async () => ({ vixState: 'unknown', dxyState: 'neutral', breadthState: 'neutral' })),
  cgEnabled: vi.fn(() => false),
  entitlement: { downgraded: false },
  recordSignals: vi.fn(async () => 0),
  opsAlert: vi.fn(async () => undefined),
}));

vi.mock('@/lib/admin/sharedScanStore', () => m.store);
vi.mock('@/lib/avRateGovernor', () => ({ avFetch: m.avFetch }));
vi.mock('@/lib/admin/scan-context', () => ({ buildAdminScanContext: vi.fn(async () => ({ context: { ctx: true }, risk: {} })) }));
vi.mock('@/lib/admin/getAdminResearchPacket', () => ({ buildAdminResearchScan: m.buildScan }));
vi.mock('@/lib/admin/serializer', () => ({ pipelineToScannerHit: (p: { verdict: { symbol: string } }) => ({ symbol: p.verdict.symbol, confidence: 0.7 }) }));
vi.mock('@/lib/admin/signal-recorder', () => ({ recordSignals: m.recordSignals }));
vi.mock('@/lib/opsAlerting', () => ({ opsAlert: m.opsAlert }));
vi.mock('@/lib/operator/market-data', () => ({
  createOperatorProvider: vi.fn(() => ({ getCrossMarketState: m.cross })),
  memoizeProvider: (p: unknown) => p,
  operatorCgFetchEnabled: m.cgEnabled,
  effectiveEquityEntitlement: () => (m.entitlement.downgraded ? 'none' : 'realtime'),
  entitlementParam: (e: string) => (e === 'none' ? '' : `&entitlement=${e}`),
  isEntitlementError: (err: unknown) => /entitle/i.test(String((err as Error)?.message)),
  rememberEntitlementRejected: () => { m.entitlement.downgraded = true; },
}));

import {
  isDataDegraded,
  isRankable,
  requestManualRescan,
  startSharedScan,
  toSavedPacket,
  withFreshQuote,
} from '@/lib/admin/sharedScan';

const NOW = Date.parse('2026-09-25T17:00:00Z');
const MIN = 60_000;
const opp = (symbol: string) => ({ symbol, permission: 'ALLOW', confidenceScore: 0.8 });
const packet = (symbol: string, price = 100) => ({ symbol, quote: { price, changePercent: 0.5, lastScanAt: '' }, snapshot: { price, changePercent: 0.5 }, dataTruth: { status: 'LIVE', trustScore: 90, notes: [] }, packetId: `${symbol}:EQUITIES:15m:1` });
const scanOk = (symbol: string, radar = true) => ({
  packet: packet(symbol),
  result: { pipelines: [{ verdict: { symbol } }], radar: radar ? [opp(symbol)] : [], errors: [] },
  bars: [{ timestamp: '2026-09-25T16:45:00.000Z', close: 100 }],
  noBars: false,
});
const scanNoSetup = (symbol: string) => ({
  packet: packet(symbol),
  result: { pipelines: [], radar: [], errors: [] },
  bars: [{ timestamp: '2026-09-25T16:45:00.000Z', close: 100 }],
  noBars: false,
});
const scanNoBars = (symbol: string) => ({
  packet: packet(symbol, 0),
  result: { pipelines: [], radar: [], errors: [{ symbol, error: 'NO_BAR_DATA' }] },
  bars: [],
  noBars: true,
});
const priorRow = (symbol: string, over: Record<string, unknown> = {}) => ({
  symbol, status: 'ok', scannedAtMs: NOW - 30 * MIN, checkedAtMs: NOW - 30 * MIN, scanPrice: 100, radarCount: 0, radar: null, hasPacket: true, ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  process.env.ALPHA_VANTAGE_API_KEY = 'k';
  delete process.env.ADMIN_RESCAN_MIN_INTERVAL_SEC;
  m.entitlement.downgraded = false;
  for (const fn of Object.values(m.store)) if (typeof fn === 'function' && 'mockClear' in fn) (fn as ReturnType<typeof vi.fn>).mockClear();
  m.store.acquireRunLock.mockReset().mockResolvedValue(true);
  m.store.lastManualRunAt.mockReset().mockResolvedValue(null);
  m.store.loadPriorResults.mockReset().mockResolvedValue(new Map());
  m.avFetch.mockReset();
  m.buildScan.mockReset();
  m.cross.mockClear();
  m.cgEnabled.mockReset().mockReturnValue(false);
  m.recordSignals.mockClear();
  m.opsAlert.mockClear();
});

async function run(req: Parameters<typeof startSharedScan>[0]) {
  const started = await startSharedScan(req);
  if (!started.started) throw new Error(`not started: ${started.reason}`);
  return started.done;
}

describe('startSharedScan — equities run', () => {
  it('one bulk-quote call, full scans only for the shortlist, quote-only for the rest, VIX once, results saved', async () => {
    m.store.loadPriorResults.mockResolvedValue(new Map([
      ['BBB', priorRow('BBB')], // quiet → quote-only
      ['CCC', priorRow('CCC')], // moved 2% → full scan (fails, keeps old packet)
      ['DDD', priorRow('DDD', { checkedAtMs: NOW - 5 * MIN })], // fresh → not due
    ]));
    m.avFetch.mockResolvedValue({
      data: [
        { symbol: 'AAA', close: '50', previous_close: '49' },
        { symbol: 'BBB', close: '100.1', previous_close: '100' },
        { symbol: 'CCC', close: '102', previous_close: '101' },
      ],
    });
    m.buildScan.mockImplementation(async ({ symbol }: { symbol: string }) => (symbol === 'CCC' ? scanNoBars(symbol) : scanOk(symbol)));

    const summary = await run({ market: 'EQUITIES', trigger: 'radar', symbols: ['AAA', 'BBB', 'CCC', 'DDD'] });

    expect(m.avFetch).toHaveBeenCalledTimes(1);
    const url = String(m.avFetch.mock.calls[0][0]);
    expect(url).toContain('function=REALTIME_BULK_QUOTES');
    expect(decodeURIComponent(url)).toContain('symbol=AAA,BBB,CCC&');
    expect(url).toContain('entitlement=realtime');
    expect(m.buildScan.mock.calls.map((c) => c[0].symbol)).toEqual(['AAA', 'CCC']);
    // day change from the bulk quote is handed to the packet builder
    expect(m.buildScan.mock.calls[0][0].quote.changePercent).toBeCloseTo(2.0408, 3);
    expect(m.cross).toHaveBeenCalledTimes(1);
    expect(m.store.saveQuotes).toHaveBeenCalledWith('EQUITIES', '15m', expect.any(String), [expect.objectContaining({ symbol: 'BBB', price: 100.1 })]);
    expect(m.store.saveScanResult).toHaveBeenCalledTimes(1);
    expect(m.store.saveScanResult.mock.calls[0][0]).toMatchObject({ symbol: 'AAA', status: 'ok', price: 50, radar: [opp('AAA')], dataAsOf: '2026-09-25T16:45:00.000Z' });
    // no bars + an older good packet: marked failed, old packet kept (not overwritten with zeros)
    expect(m.store.markResultStatus).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'CCC', status: 'failed', error: 'NO_BAR_DATA' }));
    expect(summary).toMatchObject({ symbolsDue: 3, scanned: 1, quoted: 1, failed: 1, avCalls: 1, vixState: 'unknown', quotesAvailable: true });
    expect(summary.radarChanges.map((c) => `${c.symbol}:${c.action}`)).toEqual(['AAA:appeared']);
    expect(m.opsAlert).toHaveBeenCalledTimes(1);
    expect(m.recordSignals).not.toHaveBeenCalled();
    expect(m.store.finishRun).toHaveBeenCalledWith(expect.objectContaining({ status: 'done', symbolsScanned: 1, symbolsQuoted: 1, symbolsFailed: 1, avCalls: 1 }));
  });

  it('a first scan with no bars is saved as failed, never as fresh data', async () => {
    m.avFetch.mockResolvedValue({ data: [{ symbol: 'ZZZ', close: '10', previous_close: '10' }] });
    m.buildScan.mockResolvedValue(scanNoBars('ZZZ'));
    const summary = await run({ market: 'EQUITIES', trigger: 'cron', symbols: ['ZZZ'] });
    expect(m.store.saveScanResult.mock.calls[0][0]).toMatchObject({ symbol: 'ZZZ', status: 'failed', error: 'NO_BAR_DATA' });
    expect(summary.failed).toBe(1);
    expect(summary.scanned).toBe(0);
  });

  it('bars but no playbook is a valid "no setup" result: saved ok (hits empty), not a NO_PIPELINE failure', async () => {
    m.store.loadPriorResults.mockResolvedValue(new Map([['OLD', priorRow('OLD', { status: 'failed', scannedAtMs: NOW - 300 * MIN })]]));
    m.avFetch.mockResolvedValue({ data: [{ symbol: 'NEW', close: '10', previous_close: '10' }, { symbol: 'OLD', close: '10', previous_close: '10' }] });
    m.buildScan.mockImplementation(async ({ symbol }: { symbol: string }) => scanNoSetup(symbol));
    const summary = await run({ market: 'EQUITIES', trigger: 'cron', symbols: ['NEW', 'OLD'] });
    expect(m.store.saveScanResult).toHaveBeenCalledTimes(2);
    expect(m.store.saveScanResult.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ symbol: 'NEW', status: 'ok', error: null, hits: [], radar: [] }),
      expect.objectContaining({ symbol: 'OLD', status: 'ok', error: null, hits: [] }),
    ]);
    expect(m.store.markResultStatus).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ scanned: 2, failed: 0 });
  });

  it('a pipeline error with bars is still a failure', async () => {
    m.avFetch.mockResolvedValue({ data: [{ symbol: 'ERR', close: '10', previous_close: '10' }] });
    m.buildScan.mockResolvedValue({ ...scanNoSetup('ERR'), result: { pipelines: [], radar: [], errors: [{ symbol: 'ERR', error: 'boom' }] } });
    const summary = await run({ market: 'EQUITIES', trigger: 'cron', symbols: ['ERR'] });
    expect(m.store.saveScanResult.mock.calls[0][0]).toMatchObject({ symbol: 'ERR', status: 'failed', error: 'boom' });
    expect(summary.failed).toBe(1);
  });

  it('bulk quotes fall back to no entitlement when the key is not entitled', async () => {
    m.avFetch
      .mockRejectedValueOnce(new Error('AV info error: not yet entitled to realtime data'))
      .mockResolvedValue({ data: [{ symbol: 'AAA', close: '50', previous_close: '49' }] });
    m.buildScan.mockResolvedValue(scanOk('AAA', false));
    const summary = await run({ market: 'EQUITIES', trigger: 'cron', symbols: ['AAA'] });
    expect(m.avFetch).toHaveBeenCalledTimes(2);
    expect(String(m.avFetch.mock.calls[1][0])).not.toContain('entitlement=');
    expect(summary.avCalls).toBe(2);
    expect(summary.quotesAvailable).toBe(true);
  });

  it('manual symbol rescans full-scan every requested symbol and log signals', async () => {
    m.store.loadPriorResults.mockResolvedValue(new Map([['AAA', priorRow('AAA', { checkedAtMs: NOW - MIN, scannedAtMs: NOW - MIN })]]));
    m.avFetch.mockResolvedValue({ data: [{ symbol: 'AAA', close: '100', previous_close: '100' }] });
    m.buildScan.mockResolvedValue(scanOk('AAA', false));
    const res = await requestManualRescan({ market: 'EQUITIES', symbols: ['aapl'] });
    expect(res.ok).toBe(true);
    await vi.waitFor(() => expect(m.store.finishRun).toHaveBeenCalled());
    expect(m.buildScan.mock.calls[0][0].symbol).toBe('AAPL');
    expect(m.recordSignals).toHaveBeenCalledTimes(1);
    expect(m.store.acquireRunLock).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'manual' }));
  });
});

describe('startSharedScan — crypto and locking', () => {
  it('crypto with CoinGecko off: rows marked skipped, no market-data calls, never stock endpoints', async () => {
    const summary = await run({ market: 'CRYPTO', trigger: 'cron', symbols: ['BTC', 'ETH'] });
    expect(m.avFetch).not.toHaveBeenCalled();
    expect(m.buildScan).not.toHaveBeenCalled();
    expect(m.store.markResultStatus).toHaveBeenCalledTimes(2);
    expect(m.store.markResultStatus.mock.calls[0][0]).toMatchObject({ symbol: 'BTC', status: 'skipped' });
    expect(summary.skipped).toBe(2);
  });

  it('crypto with CoinGecko on: no bulk stock quotes, symbols full-scanned as CRYPTO', async () => {
    m.cgEnabled.mockReturnValue(true);
    m.buildScan.mockResolvedValue(scanOk('BTC', false));
    await run({ market: 'CRYPTO', trigger: 'cron', symbols: ['BTC'] });
    expect(m.avFetch).not.toHaveBeenCalled();
    expect(m.buildScan.mock.calls[0][0]).toMatchObject({ symbol: 'BTC', market: 'CRYPTO' });
  });

  it('refuses to start while another run holds the lock', async () => {
    m.store.acquireRunLock.mockResolvedValue(false);
    const res = await startSharedScan({ market: 'EQUITIES', trigger: 'radar', symbols: ['AAA'] });
    expect(res).toMatchObject({ started: false, reason: 'already_running' });
    expect(m.avFetch).not.toHaveBeenCalled();
  });

  it('reports a missing migration instead of throwing', async () => {
    m.store.acquireRunLock.mockRejectedValue(new Error('relation "admin_scan_runs" does not exist'));
    const res = await startSharedScan({ market: 'EQUITIES', trigger: 'radar', symbols: ['AAA'] });
    expect(res).toMatchObject({ started: false, reason: 'table_missing' });
  });
});

describe('requestManualRescan guards', () => {
  it('rate-limits to one manual rescan per market per 5 minutes', async () => {
    m.store.lastManualRunAt.mockResolvedValue(NOW - 2 * MIN);
    const res = await requestManualRescan({ market: 'EQUITIES' });
    expect(res).toMatchObject({ ok: false, status: 429, retryAfterSec: 180 });
    expect(m.store.acquireRunLock).not.toHaveBeenCalled();
  });

  it('409 while a scan is running; 400 for too many or foreign symbols', async () => {
    m.store.acquireRunLock.mockResolvedValue(false);
    expect(await requestManualRescan({ market: 'EQUITIES' })).toMatchObject({ ok: false, status: 409 });
    expect(await requestManualRescan({ market: 'EQUITIES', symbols: Array.from({ length: 26 }, (_, i) => `S${i}`) })).toMatchObject({ ok: false, status: 400 });
    expect(await requestManualRescan({ market: 'EQUITIES', symbols: ['BTC'] })).toMatchObject({ ok: false, status: 400 });
  });
});

describe('saved packet labelling', () => {
  const row = (over: Record<string, unknown>) => ({
    symbol: 'AAA', market: 'EQUITIES', timeframe: '15m', status: 'ok', scannedAt: '2026-09-25T16:50:00.000Z', checkedAt: null, dataAsOf: null,
    ageSec: 600, price: null, changePct: null, quoteAt: null, packet: packet('AAA'), hits: [{ symbol: 'AAA' }], radar: [], error: null, ...over,
  }) as never;

  it('fresh ok rows rank; failed rows become ERROR with trust 0; stale/skipped rows become STALE', () => {
    const ok = toSavedPacket(row({}))!;
    expect(ok.savedScan).toMatchObject({ status: 'ok', ageLabel: '10 min ago', stale: false });
    expect(ok.dataTruth.status).toBe('LIVE');
    expect(isRankable(ok)).toBe(true);

    const failed = toSavedPacket(row({ status: 'failed', error: 'NO_BAR_DATA' }))!;
    expect(failed.dataTruth).toMatchObject({ status: 'ERROR', trustScore: 0 });
    expect(isRankable(failed)).toBe(false);

    const stale = toSavedPacket(row({ ageSec: 4 * 3600 }))!;
    expect(stale.dataTruth.status).toBe('STALE');
    expect(isRankable(stale)).toBe(false);

    expect(toSavedPacket(row({ packet: null }))).toBeNull();
  });

  it('a current "no setup" row is neither ranked nor data-degraded', () => {
    const p = toSavedPacket(row({ hits: [] }))!;
    expect(p.savedScan.noSetup).toBe(true);
    expect(isRankable(p)).toBe(false);
    expect(isDataDegraded(p)).toBe(false);
    expect(isDataDegraded(toSavedPacket(row({ status: 'failed', error: 'x' }))!)).toBe(true);
  });

  it('US market closed: a scan made after the last close stays current (labelled as of that close); one from before goes stale', () => {
    const sat = Date.parse('2026-09-26T14:10:00Z'); // Sat 10:10 ET (Sun 00:10 AEST)
    vi.setSystemTime(sat);
    const afterClose = toSavedPacket(row({ scannedAt: '2026-09-26T04:00:00.000Z', ageSec: 10 * 3600 }), undefined, sat)!;
    expect(afterClose.savedScan).toMatchObject({ stale: false, asOfLabel: 'as of Fri 25 Sep 2026 close' });
    expect(isRankable(afterClose)).toBe(true);
    const beforeClose = toSavedPacket(row({ scannedAt: '2026-09-25T19:00:00.000Z', ageSec: 19 * 3600 }), undefined, sat)!;
    expect(beforeClose.savedScan).toMatchObject({ stale: true, asOfLabel: null });
    expect(isRankable(beforeClose)).toBe(false);
    // crypto rows keep the wall-clock rule
    const crypto = toSavedPacket(row({ market: 'CRYPTO', scannedAt: '2026-09-26T04:00:00.000Z', ageSec: 10 * 3600 }), undefined, sat)!;
    expect(crypto.savedScan.stale).toBe(true);
    // market open again (Mon 10:00 ET): the 2.5 h rule applies
    const mon = Date.parse('2026-09-28T14:00:00Z');
    expect(toSavedPacket(row({ scannedAt: '2026-09-26T04:00:00.000Z', ageSec: 58 * 3600 }), undefined, mon)!.savedScan.stale).toBe(true);
  });

  it('withFreshQuote applies a newer bulk-quote price and gives the packet a new id', () => {
    const p = toSavedPacket(row({ price: 105, changePct: 1.5, quoteAt: '2026-09-25T16:58:00.000Z' }))!;
    const q = withFreshQuote(p);
    expect(q.snapshot.price).toBe(105);
    expect(q.quote.changePercent).toBe(1.5);
    expect(q.packetId).not.toBe(p.packetId);
    const older = toSavedPacket(row({ price: 105, quoteAt: '2026-09-25T16:00:00.000Z' }))!;
    expect(withFreshQuote(older)).toBe(older);
  });
});
