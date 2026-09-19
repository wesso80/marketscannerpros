/**
 * MSP Radar — Daily Market Intelligence Report — builder, health gate, persistence idempotency, one-send email, API shape.
 * No DB, no providers: everything runs against fixtures + the in-memory store.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MorningReport } from '@/lib/jarvis/radar/types';
import type { WatchEntry } from '@/lib/jarvis/radar/store';
import { buildDailyReport, buildFailedReport, extensionOf, lifecycleFromWatchlist } from '@/lib/jarvis/report/buildDailyReport';
import { evaluateHealth, stage2Coverage } from '@/lib/jarvis/report/reportHealth';
import { memoryReportStore } from '@/lib/jarvis/report/persistDailyReport';
import { resolveRecipients, sendDailyReport } from '@/lib/jarvis/report/sendDailyReport';
import { generateDailyReport } from '@/lib/jarvis/report/generateDailyReport';
import { renderReportMarkdown } from '@/lib/jarvis/report/renderMarkdown';
import { emailSubject, renderEmailHtml } from '@/lib/jarvis/report/renderEmailHtml';

vi.mock('@/lib/db', () => ({ q: vi.fn(async () => { throw new Error('DB must not be touched in unit tests'); }), hasDb: () => false }));
vi.mock('@/lib/email', () => ({ sendAlertEmail: vi.fn(async () => { throw new Error('real email must not be called in tests'); }) }));

const SESSION = '2026-09-17';

function scored(symbol: string, assetClass: 'equity' | 'crypto' | 'etf', ret1: number, extra: Partial<Record<string, unknown>> = {}) {
  return { f: { symbol, assetClass, ret1, ret5: ret1 * 2, volRatio: 2.8, gapPct: 1.2, flags: ['NEW_HIGH'], now: { hi20: 100, lo20: 80 }, dataQuality: { fresh: true }, crypto: null, ...extra }, score: 70, setupScore: 60, status: 'NEW_STRENGTH', opportunityType: 'BREAKOUT_CONTINUATION', reasons: [], confirming: [], conflicting: [], components: {}, bigMove: true, rejection: [] } as any;
}

function makeRun(over: Partial<MorningReport> & { stage2?: { selected: number; live: number; fallback: number; missing: number } } = {}): MorningReport {
  const { stage2 = { selected: 1929, live: 1900, fallback: 20, missing: 9 }, ...rest } = over;
  const cand = (rank: number, symbol: string, eoe: string, direction = 'up') => ({ rank, symbol, name: `${symbol} Inc`, assetClass: 'equity', status: 'NEW_STRENGTH', opportunityType: 'BREAKOUT_CONTINUATION', score: 90 - rank, direction, stage: 'confirmed', ret1: 4.2, ret5: 9.1, whatChanged: 'x', whyFlagged: `${symbol} broke out on 3x volume; RS vs SPY +2.1`, whyMayContinue: 'y', confirming: ['volume'], conflicting: rank === 1 ? [] : ['extended vs EMA20'], sectorTheme: 'Semis', catalyst: 'none identified', volume: '', volatility: '', relativeStrength: '', structure: '', momentum: '', whatToWatchNext: 'hold above 100', whatWouldReduceInterest: 'volume fade; RS loss', whatWouldInvalidate: 'close below 95', earlyOrExtended: eoe, dataQuality: 'fresh', velocity: ['accelerating'], deep: {} });
  const base: any = {
    generatedAt: '2026-09-18T06:31:37.000Z', sessionDate: SESSION, sessionBasis: 'US close', environment: 'risk-on',
    thirtySeconds: { whatMoved: 'SPY +0.62% broad advance', rotation: '', bestNewStrength: [], bestEarlySetups: [], ignore: [], watchToday: [], macro: '' },
    counts: { universe: 2186, equities: 1900, crypto: 193, other: 93, stage1Listed: 12650, stage1Quoted: 11206, stage1Liquid: 3489, stage2Selected: stage2.selected, stage2Live: stage2.live, stage2Fallback: stage2.fallback, stage2Missing: stage2.missing, meaningfulMovers: 140, unusual: 22, newStrength: 30, newWeakness: 12, initialCandidates: 60, deepDives: 20, finalShortlist: 3, rejected: 9, settingUp: 4 },
    whatMoved: { equities: ['NVDA +4.2%'], crypto: [], sectors: [], commodities: ['Gold (GLD) +1.69% · 5d +2.1%'], fx: ['Dollar (UUP) -0.30% · 5d -0.8%'], rates: ['Long bonds (TLT) +0.40% · 5d +1.1%'] },
    biggestChanges: [scored('NVDA', 'equity', 4.2), scored('SOL', 'crypto', 8.1)], newStrength: [scored('NVDA', 'equity', 4.2), scored('AMD', 'equity', 3.1)], newWeakness: [scored('XOM', 'equity', -2.4, { flags: ['NEW_BREAKDOWN'] })], unusual: [scored('SMCI', 'equity', 6.0, { volRatio: 4.1 })],
    rotation: { sectors: [{ ticker: 'XLK', label: 'Tech', rs5: 1.2, rank5: 1, rank20Prev: 3 }, { ticker: 'XLF', label: 'Financials', rs5: 0.4, rank5: 2, rank20Prev: 2 }, { ticker: 'XLE', label: 'Energy', rs5: -1.1, rank5: 9, rank20Prev: 1 }], strongYesterday: ['XLE'], strongToday: ['XLK', 'XLF'], newlyStrengthened: ['XLK'], lostLeadership: ['XLE'], crossAsset: [{ pair: 'Growth vs broad', reading: 'QQQ/SPY → growth leading', value: 0.3 }], crypto: { btc24h: 1.2, eth24h: 2.5, altMedian24h: 3.1, btc7d: 4, eth7d: 6, altMedian7d: 5, leader24h: 'alts', leader7d: 'ETH', breadth24h: 72, breadth7d: 64, categoriesUp: [{ name: 'DeFi', change24h: 4.1 }], categoriesDown: [] }, breadth: { equities: { up: 1301, total: 1900, aboveE20: 1100, aboveE50: 1050, volSurge: 77, newHi20: 210, newLo20: 40 }, crypto: {} } },
    themes: [{ name: 'Semis', assetClass: 'equity', members: 12, pctUp: 83, medianRet1: 2.4, verdict: 'GENUINE_GROUP_MOVE', confirmation: '10/12 up', early: ['AMD', 'MU'], extended: ['SMCI'], leaders: ['NVDA'] }, { name: 'DeFi', assetClass: 'crypto', members: 8, pctUp: 75, medianRet1: 5.0, verdict: 'GENUINE_GROUP_MOVE', confirmation: '6/8 up with turnover', early: ['AAVE'], extended: [], leaders: ['UNI'] }],
    shortlist: [cand(1, 'NVDA', 'EARLY — 3% above EMA20'), cand(2, 'AMD', 'MID-MOVE — 6% above EMA20'), cand(3, 'SMCI', 'EXTENDED — 18% above EMA20')],
    rejected: [{ symbol: 'ZZZ', assetClass: 'equity', ret1: 48, reasons: ['PARABOLIC', 'THIN_LIQUIDITY'], detail: ['+48% on 1 day', 'ADV $0.4M'] }],
    settingUp: [{ symbol: 'MU', assetClass: 'equity', stage: 'NEAR_TRIGGER', score: 71, ret1: 0.8, ret5: 2.1, bbWidthPctile: 4, rsBenchDelta: 1.1, accumRatio: 1.6, distToHi20Pct: 1.4, adx: 18, signals: ['BB squeeze 4th pctile', 'accumulation 1.6×'], penalties: [], triggerLevel: 101.5, themeBoost: 1 }, { symbol: 'AAVE', assetClass: 'crypto', stage: 'DEVELOPING', score: 60, ret1: 2, ret5: 4, bbWidthPctile: 12, rsBenchDelta: 0.5, accumRatio: 1.2, distToHi20Pct: 5, adx: 15, signals: ['turnover rising'], penalties: ['funding elevated'], triggerLevel: 250, themeBoost: 1 }],
    lifecycle: { changes: [], active: [] }, watchToday: [], dataGaps: [],
    providers: [{ name: 'Alpha Vantage LISTING_STATUS + REALTIME_BULK_QUOTES (Stage 1)', status: 'OK', detail: '12650 listed' }, { name: 'Alpha Vantage TIME_SERIES_DAILY_ADJUSTED (Stage 2)', status: 'OK', detail: `${stage2.live} series live, ${stage2.fallback} DB fallback (stale), ${stage2.missing} unavailable` }, { name: 'CoinGecko markets + history', status: 'OK', detail: '193 coins' }],
    apiUsage: { alphaVantage: 2374, coingecko: 220, dbQueries: 40, errors: 0, runtimeMs: 1_116_000, sustainableMaxEquities: 3500 }, macroNext24h: [], snapshot: {},
  };
  return { ...base, ...rest } as MorningReport;
}

function watchlist(): WatchEntry[] {
  const e = (symbol: string, assetClass: 'equity' | 'crypto', status: any, history: { date: string; status: any; note: string }[], metrics: Record<string, number> = {}): WatchEntry => ({ key: `${assetClass}:${symbol}`, symbol, assetClass, status, firstSeen: '2026-09-16', lastSeen: SESSION, sessionsSeen: history.length, origin: 'shortlist', state: { history, metrics, triggerLevel: 101.5, invalidationLevel: 94, note: '' } } as any);
  return [
    e('MU', 'equity', 'NEAR_TRIGGER', [{ date: '2026-09-16', status: 'DEVELOPING', note: 'squeeze forming' }, { date: SESSION, status: 'NEAR_TRIGGER', note: 'within 1.4% of trigger on rising accumulation' }], { price: 100.1 }),
    e('NVDA', 'equity', 'CONFIRMED_MOVE', [{ date: '2026-09-16', status: 'NEAR_TRIGGER', note: '' }, { date: SESSION, status: 'CONFIRMED_MOVE', note: 'closed above trigger on 3× volume' }]),
    e('XOM', 'equity', 'FAILED', [{ date: '2026-09-15', status: 'NEW', note: '' }, { date: '2026-09-16', status: 'DEVELOPING', note: '' }, { date: SESSION, status: 'FAILED', note: 'closed below invalidation' }]),
    e('AAVE', 'crypto', 'NEW', [{ date: SESSION, status: 'NEW', note: 'first seen' }]),
    e('OLD', 'equity', 'EXPIRED', [{ date: '2026-09-10', status: 'NEW', note: '' }, { date: '2026-09-16', status: 'EXPIRED', note: 'aged out' }]),
  ];
}

const inputs = (report = makeRun(), runtimeMs = 1_116_000) => ({ run: { runKey: SESSION, report, apiUsage: { av: 2374, cg: 220, db: 40, errors: 0, peakRssMb: 198, equityCap: 2000 }, runtimeMs, generatedAt: '2026-09-18T06:31:37.000Z', sessionDate: SESSION }, watchlist: watchlist() });

describe('health gate', () => {
  it('passes a complete run with ≥95% Stage 2 coverage', () => {
    const h = evaluateHealth(makeRun(), { runtimeMs: 1_116_000, apiErrors: 0 });
    expect(h.status).toBe('NORMAL');
    expect(h.stage2CoveragePct).toBeCloseTo(99.5, 1);
    expect(h.shortlistMayBeIncomplete).toBe(false);
  });
  it('degrades when Stage 2 coverage < 95%', () => {
    const h = evaluateHealth(makeRun({ stage2: { selected: 2000, live: 1500, fallback: 100, missing: 400 } }), { runtimeMs: 1, apiErrors: 0 });
    expect(h.status).toBe('DEGRADED');
    expect(h.stage2CoveragePct).toBe(80);
    expect(h.shortlistMayBeIncomplete).toBe(true);
    expect(h.summary).toMatch(/Stage 2 coverage/);
  });
  it('degrades on critical provider failure and excess errors', () => {
    const r = makeRun(); r.providers[2] = { name: 'CoinGecko markets + history', status: 'FAILED', detail: '429' };
    const h = evaluateHealth(r, { runtimeMs: 1, apiErrors: 40 });
    expect(h.status).toBe('DEGRADED');
    expect(h.failedProviders).toEqual(['CoinGecko markets + history: FAILED']);
    expect(h.checks.find((c) => c.name === 'provider error count')?.ok).toBe(false);
  });
  it('fails when the payload is unreadable', () => {
    expect(evaluateHealth(null, { runtimeMs: 0, apiErrors: 0 }).status).toBe('FAILED');
    const broken = makeRun(); (broken as any).shortlist = undefined;
    expect(evaluateHealth(broken, { runtimeMs: 0, apiErrors: 0 }).status).toBe('FAILED');
  });
  it('parses coverage from older provider detail lines when counters are absent', () => {
    const r = makeRun(); delete (r.counts as any).stage2Selected; delete (r.counts as any).stage2Live;
    expect(stage2Coverage(r)).toEqual({ selected: 1929, live: 1900, fallback: 20, missing: 9, pct: 99.5 });
  });
});

describe('report builder', () => {
  it('builds every section in order from a successful run', () => {
    const rep = buildDailyReport(inputs());
    expect(rep.status).toBe('COMPLETE');
    expect(rep.headline).toMatch(/1301\/1900 equities up, 3 research candidates, 2 genuine group moves/);
    expect(rep.marketIn30Seconds.map((l) => l.label)).toEqual(['Equities', 'Crypto', 'Sectors', 'Growth vs defensive', 'Rates / duration', 'Volatility', 'Dollar', 'Metals / commodities', 'Themes']);
    expect(rep.marketIn30Seconds[0].value).toContain('SPY +0.62%');
    expect(rep.marketIn30Seconds[7].value).toContain('Gold +1.69%');
    expect(rep.candidates).toHaveLength(3);
    expect(rep.candidates.map((c) => c.extension)).toEqual(['EARLY', 'MID', 'EXTENDED']);
    expect(rep.candidates[0].lifecycle).toBe('CONFIRMED_MOVE');
    expect(rep.whatMayMoveNext[0]).toMatchObject({ symbol: 'MU', stage: 'NEAR_TRIGGER', lifecycle: 'NEAR_TRIGGER', distanceToTriggerPct: 1.4 });
    expect(rep.whatMayMoveNext[0].confirmation).toMatch(/close above 101.50/);
    expect(rep.whatMayMoveNext[0].invalidation).toMatch(/below 94.00/);
    expect(rep.rejected[0]).toMatchObject({ symbol: 'ZZZ', change: '+48.0%', detail: '+48% on 1 day; ADV $0.4M' });
    expect(rep.probablyNoise.join(' ')).toMatch(/Parabolic micro-caps: ZZZ/);
    expect(rep.probablyNoise.join(' ')).toMatch(/SMCI/);
    expect(rep.themes.equity.leading[0]).toBe('XLK Tech (RS5 +1.2%)');
    expect(rep.themes.equity.deteriorating[0]).toBe('XLE Energy (rank 1 → 9)');
    expect(rep.dataHealth).toMatchObject({ coveragePct: 99.5, stage2Live: 1900, alphaVantageCalls: 2374, peakRssMb: 198, deepDives: 20 });
    expect(rep.run.apiUsage.equityCap).toBe(2000);
    expect(rep.disclaimer).toMatch(/not financial advice/);
  });
  it('ranks Look At First by research value: theme, non-extended setup, near-trigger, crypto theme, lifecycle', () => {
    const rep = buildDailyReport(inputs());
    expect(rep.lookAtFirst.map((a) => a.kind)).toEqual(['theme', 'setup', 'trigger', 'crypto', 'risk']);
    expect(rep.lookAtFirst[1].title).toMatch(/^NVDA/);
    expect(rep.lookAtFirst[2].why).toMatch(/MU 1.4% below 101.50/);
    expect(rep.lookAtFirst[4].why).toMatch(/NVDA moved to CONFIRMED_MOVE; XOM failed/);
  });
  it('reads lifecycle transitions from persisted watchlist history only', () => {
    const lc = lifecycleFromWatchlist(watchlist(), SESSION);
    expect(lc.source).toBe('jarvis_watchlist');
    expect(lc.counts).toMatchObject({ NEAR_TRIGGER: 1, CONFIRMED_MOVE: 1, FAILED: 1, NEW: 1, EXPIRED: 1 });
    expect(lc.transitions.map((t) => `${t.symbol}:${t.from}>${t.to}`)).toEqual(['NVDA:NEAR_TRIGGER>CONFIRMED_MOVE', 'MU:DEVELOPING>NEAR_TRIGGER', 'XOM:DEVELOPING>FAILED', 'AAVE:null>NEW']);
    expect(lc.highlights.map((t) => t.symbol)).toEqual(['NVDA', 'MU', 'XOM']); // OLD expired on a prior session → excluded
  });
  it('marks a degraded run DEGRADED with a warning headline but still renders market content', () => {
    const rep = buildDailyReport(inputs(makeRun({ stage2: { selected: 2000, live: 1500, fallback: 100, missing: 400 } })));
    expect(rep.status).toBe('DEGRADED');
    expect(rep.headline).toMatch(/^MSP RADAR DATA HEALTH WARNING/);
    expect(rep.candidates.length).toBe(3);
    const md = renderReportMarkdown(rep);
    expect(md).toMatch(/DATA HEALTH WARNING/);
    expect(md).toMatch(/TOP RESEARCH CANDIDATES/);
  });
  it('produces a FAILED report with no market content when the run is missing', () => {
    const rep = buildFailedReport(SESSION, null, 'no completed overnight run persisted for this session');
    expect(rep.status).toBe('FAILED');
    expect(rep.candidates).toEqual([]);
    expect(renderReportMarkdown(rep)).not.toMatch(/TOP RESEARCH CANDIDATES/);
  });
  it('extensionOf maps stage prefixes', () => {
    expect(extensionOf('EARLY — 2% above EMA20')).toBe('EARLY');
    expect(extensionOf('MID-MOVE — 6%')).toBe('MID');
    expect(extensionOf('EXTENDED — 18%')).toBe('EXTENDED');
    expect(extensionOf('')).toBe('n/a');
  });
});

describe('formatting', () => {
  it('email subject follows the spec for normal and warning states', () => {
    const ok = buildDailyReport(inputs());
    expect(emailSubject(ok)).toBe('MSP Radar — Daily Market Intelligence — Sep 17, 2026');
    const warn = buildDailyReport(inputs(makeRun({ stage2: { selected: 2000, live: 1500, fallback: 100, missing: 400 } })));
    expect(emailSubject(warn)).toBe('⚠ MSP Radar Data Health Warning — Sep 17, 2026');
  });
  it('email html is a short briefing with link, top 5 only, and disclaimer', () => {
    const rep = buildDailyReport(inputs());
    const html = renderEmailHtml(rep, 'https://marketscannerpros.app/admin/jarvis/daily?date=2026-09-17');
    expect(html).toContain('Market in 30 seconds');
    expect(html).toContain('Look at first today');
    expect(html).toContain('Open full report');
    expect(html).toContain('/admin/jarvis/daily?date=2026-09-17');
    expect(html).toContain('Educational research only');
    expect(html).not.toContain('Rejected');
  });
  it('markdown lists sections A–J in order', () => {
    const md = renderReportMarkdown(buildDailyReport(inputs()));
    const idx = ['## A. MARKET IN 30 SECONDS', '## B. WHAT MOVED', '## C. TOP RESEARCH CANDIDATES', '## D. WHAT MAY MOVE NEXT', '## E. LIFECYCLE CHANGES', '## F. THEMES & ROTATION', '## G. REJECTED NOISE', '## H. LOOK AT FIRST TODAY', '## I. PROBABLY NOISE', '## J. DATA / PROVIDER HEALTH'].map((h) => md.indexOf(h));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
});

describe('persistence + one-send email', () => {
  const env = { JARVIS_DAILY_REPORT_TO: 'owner@example.com' };
  let store: ReturnType<typeof memoryReportStore>;
  let sendEmail: ReturnType<typeof vi.fn>;
  beforeEach(() => { store = memoryReportStore(); sendEmail = vi.fn(async () => 'msg_1'); });

  const gen = (opts: { sendEmail: boolean; retryFailedEmail?: boolean }, deps: Record<string, unknown> = {}) =>
    generateDailyReport(SESSION, opts, { store, loadRun: async () => ({ runKey: SESSION, generatedAt: '2026-09-18T06:31:37.000Z', sessionDate: SESSION, kind: 'overnight', report: makeRun(), markdown: '', snapshot: {}, apiUsage: { av: 2374, cg: 220, db: 40, errors: 0, peakRssMb: 198, equityCap: 2000 }, runtimeMs: 1_116_000 }), loadWatch: async () => watchlist(), sendEmail: sendEmail as any, env, log: () => undefined, ...deps });

  it('regenerating the same session upserts one row and preserves email state', async () => {
    const a = await gen({ sendEmail: true });
    expect(a.email?.status).toBe('SENT');
    const b = await gen({ sendEmail: false });
    expect(store.rows.size).toBe(1);
    expect(b.row.id).toBe(a.row.id);
    expect(b.row.reportVersion).toBe(2);
    expect(b.row.emailStatus).toBe('SENT');
    expect(b.row.emailMessageId).toBe('msg_1');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it('cron-A + cron-B (or a restart) send exactly one email', async () => {
    await gen({ sendEmail: true });
    await gen({ sendEmail: true });
    await gen({ sendEmail: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect((await store.getBySession(SESSION))?.emailStatus).toBe('SENT');
  });
  it('concurrent senders: only the claim winner sends', async () => {
    const rep = buildDailyReport(inputs());
    await store.upsertReport({ sessionDate: SESSION, runId: SESSION, report: rep, markdown: '' });
    const res = await Promise.all([1, 2, 3].map(() => sendDailyReport(SESSION, rep, { store, sendEmail: sendEmail as any, env })));
    expect(res.filter((r) => r.status === 'SENT' && r.skippedReason === null)).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it('a failed send is recorded and can be retried explicitly, never implicitly', async () => {
    sendEmail.mockRejectedValueOnce(new Error('Resend 500'));
    const a = await gen({ sendEmail: true });
    expect(a.email?.status).toBe('FAILED');
    expect((await store.getBySession(SESSION))?.emailError).toBe('Resend 500');
    const b = await gen({ sendEmail: true });
    expect(b.email?.status).toBe('FAILED');
    expect(b.email?.skippedReason).toMatch(/already FAILED/);
    const c = await gen({ sendEmail: true, retryFailedEmail: true });
    expect(c.email?.status).toBe('SENT');
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
  it('a stale PENDING claim (crash mid-send) is recoverable after 30 minutes', async () => {
    const rep = buildDailyReport(inputs());
    await store.upsertReport({ sessionDate: SESSION, runId: SESSION, report: rep, markdown: '' });
    const t0 = new Date('2026-09-18T07:00:00Z');
    await store.claimEmail(SESSION, { allowRetryFailed: false, stalePendingMs: 30 * 60_000, now: t0 }); // simulate crash after claim
    const soon = await sendDailyReport(SESSION, rep, { store, sendEmail: sendEmail as any, env, now: () => new Date(t0.getTime() + 5 * 60_000) });
    expect(soon.status).toBe('PENDING');
    const later = await sendDailyReport(SESSION, rep, { store, sendEmail: sendEmail as any, env, now: () => new Date(t0.getTime() + 31 * 60_000) });
    expect(later.status).toBe('SENT');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it('missing recipient persists the report, sets NO_RECIPIENT, and does not fail', async () => {
    const res = await gen({ sendEmail: true }, { env: {} });
    expect(res.row.status).toBe('COMPLETE');
    expect(res.email?.status).toBe('NO_RECIPIENT');
    expect((await store.getBySession(SESSION))?.emailStatus).toBe('NO_RECIPIENT');
    expect(sendEmail).not.toHaveBeenCalled();
    // later, once configured, the same row can be sent
    const again = await gen({ sendEmail: true });
    expect(again.email?.status).toBe('SENT');
  });
  it('recipient resolution: dedicated var first, admin brief list as documented fallback, no hard-coded address', () => {
    expect(resolveRecipients({ JARVIS_DAILY_REPORT_TO: 'a@x.io, b@y.io' })).toEqual(['a@x.io', 'b@y.io']);
    expect(resolveRecipients({ ADMIN_DAILY_BRIEF_EMAILS: 'c@z.io' })).toEqual(['c@z.io']);
    expect(resolveRecipients({})).toEqual([]);
    expect(resolveRecipients({ JARVIS_DAILY_REPORT_TO: 'not-an-email' })).toEqual([]);
  });
  it('FAILED health suppresses email (SUPPRESSED_HEALTH), degraded sends a warning email', async () => {
    const failed = await gen({ sendEmail: true }, { loadRun: async () => null });
    expect(failed.report.status).toBe('FAILED');
    expect(failed.email?.status).toBe('SUPPRESSED_HEALTH');
    expect(sendEmail).not.toHaveBeenCalled();
    const store2 = memoryReportStore();
    const degraded = await generateDailyReport(SESSION, { sendEmail: true }, { store: store2, loadRun: async () => ({ runKey: SESSION, generatedAt: 'x', sessionDate: SESSION, kind: 'overnight', report: makeRun({ stage2: { selected: 2000, live: 1500, fallback: 100, missing: 400 } }), markdown: '', snapshot: {}, apiUsage: {}, runtimeMs: 1 }), loadWatch: async () => [], sendEmail: sendEmail as any, env, log: () => undefined });
    expect(degraded.report.status).toBe('DEGRADED');
    expect(degraded.email?.status).toBe('SENT');
    expect((sendEmail.mock.calls[0] as any)[0].subject).toMatch(/^⚠ MSP Radar Data Health Warning/);
  });
  it('archive lists metadata newest-first with neighbours', async () => {
    await gen({ sendEmail: false });
    await generateDailyReport('2026-09-16', { sendEmail: false }, { store, loadRun: async () => ({ runKey: '2026-09-16', generatedAt: 'x', sessionDate: '2026-09-16', kind: 'overnight', report: makeRun({ sessionDate: '2026-09-16' }), markdown: '', snapshot: {}, apiUsage: {}, runtimeMs: 1 }), loadWatch: async () => [], log: () => undefined });
    const list = await store.listArchive(30);
    expect(list.map((r) => r.sessionDate)).toEqual([SESSION, '2026-09-16']);
    expect(Object.keys(list[0]).sort()).toEqual(['emailStatus', 'generatedAt', 'headline', 'healthStatus', 'sessionDate', 'status']);
    expect(await store.neighbours(SESSION)).toEqual({ previous: '2026-09-16', next: null });
    expect((await store.getLatest())?.sessionDate).toBe(SESSION);
  });
  it('report-only path makes zero provider calls and touches no network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => { throw new Error('network call during report-only'); });
    const res = await gen({ sendEmail: false });
    expect(res.email).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
  it('persisted payload contains no secrets or oversized state', async () => {
    const res = await gen({ sendEmail: false });
    const json = JSON.stringify(res.row.reportJson);
    expect(json).not.toMatch(/RESEND|DATABASE_URL|ADMIN_SECRET|api[_-]?key/i);
    expect(json).not.toContain('"snapshot"');
    expect(json.length).toBeLessThan(200_000);
  });
});
