import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';

const morning = vi.hoisted(() => ({
  cron: vi.fn(() => true),
  admin: vi.fn(async () => ({ ok: false })),
  send: vi.fn(async () => 'id'),
  build: vi.fn(async () => ({ briefId: 'b', market: 'EQUITIES', deskState: 'WAIT', topPlays: [] })),
  save: vi.fn(async (b: unknown) => b),
  already: vi.fn(async () => false),
}));
vi.mock('@/lib/adminAuth', () => ({ verifyCronAuth: morning.cron, requireAdmin: morning.admin }));
vi.mock('@/lib/email', () => ({ sendAlertEmail: morning.send }));
vi.mock('@/lib/admin/morning-brief', () => ({
  buildMorningBrief: morning.build,
  saveMorningBriefSnapshot: morning.save,
  cronBriefAlreadySent: morning.already,
  dailyMorningBriefId: () => '2026-10-09:EQUITIES:15m',
  renderMorningBriefEmail: () => '<p>brief</p>',
  buildDailyReview: review.build,
  renderDailyReviewEmail: () => '<p>review</p>',
  buildJournalTagReconciliationReport: vi.fn(),
  buildMorningTradePlan: vi.fn(),
  buildOpenRescore: vi.fn(),
  saveMorningTradePlan: vi.fn(),
}));
vi.mock('@/lib/operator/orchestrator', () => ({ runScan: picks.scan }));
vi.mock('@/lib/operator/market-data', () => ({ alphaVantageProvider: {} }));
vi.mock('@/lib/options-confluence-analyzer', () => ({
  optionsAnalyzer: { analyzeForOptions: async () => { throw new Error('no chain'); } },
}));
vi.mock('@/lib/admin', () => ({ wrapTruth: () => ({}) }));

const review = vi.hoisted(() => ({
  build: vi.fn(async () => ({ sessionScore: { executionScore: 80, disciplineScore: 70 } })),
}));
const picks = vi.hoisted(() => ({
  scan: vi.fn(async () => ({ radar: [], pipelines: [], symbolsScanned: 0, errors: [] })),
}));
const evening = vi.hoisted(() => ({
  q: vi.fn(),
  notify: vi.fn(async () => undefined),
  jev: vi.fn(async () => ({ scoring: { scored: 1, unavailable: 0, skipped: null }, labelling: { labelled: 0, waiting: 1 } })),
}));
vi.mock('@/lib/db', () => ({ q: evening.q }));
vi.mock('@/lib/eveningPacket/builder', () => ({
  buildEveningPacket: async () => ({ surfacedToday: [{ id: 's' }], invalidatedToday: [], warnings: [] }),
}));
vi.mock('@/lib/admin/edgePacketSnapshots', () => ({ pruneEdgePackets: async () => 0 }));
vi.mock('@/lib/admin/equityNewsJev', () => ({ runNewsJevDaily: evening.jev, runNewsJevDailyOnce: evening.jev }));
vi.mock('@/lib/admin/notifyAdmin', () => ({ notifyAdmin: evening.notify }));
vi.mock('@/lib/edge/matrix', () => ({ rebuildMatrixForWorkspace: vi.fn() }));
vi.mock('@/lib/edge/outcomeLabeller', () => ({ labelAllPending: edge.label }));

const edge = vi.hoisted(() => ({
  label: vi.fn(async () => { throw new Error('label failed'); }),
}));

import { POST as morningPost } from '@/app/api/jobs/email-morning-brief/route';
import { POST as picksPost } from '@/app/api/jobs/email-best-opportunities/route';
import { POST as reviewPost } from '@/app/api/jobs/email-daily-review/route';
import { POST as actionsPost } from '@/app/api/admin/morning-brief/actions/route';
import { POST as eveningPost } from '@/app/api/cron/evening-packet/route';
import { POST as rebuildPost } from '@/app/api/cron/edge-rebuild-matrix/route';
import { POST as labelPost } from '@/app/api/cron/edge-label-outcomes/route';
import { equityNewsJevFallback, adminEquityEmailsDisabled, adminRadarDiscordEnabled } from '@/lib/admin/equityOutbound';

const flags = ['ADMIN_EQUITY_EMAILS_DISABLED', 'ADMIN_RADAR_DISCORD_ENABLED', 'ADMIN_EQUITY_EMAILS_ENABLED', 'ADMIN_EQUITY_AI_ENABLED'] as const;
const saved = Object.fromEntries(flags.map((name) => [name, process.env[name]]));

function post(url: string, body?: unknown, admin = false) {
  return new NextRequest(url, {
    method: 'POST',
    headers: admin
      ? { 'content-type': 'application/json' }
      : { 'x-cron-secret': 'test', 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test';
  for (const name of flags) delete process.env[name];
  morning.cron.mockReturnValue(true);
  morning.admin.mockResolvedValue({ ok: false });
  evening.q.mockImplementation(async (sql: string) => (
    String(sql).includes('edge_ledger_setups') ? [{ workspace_id: 'ws-1' }] : []
  ));
  evening.notify.mockResolvedValue(undefined);
  evening.jev.mockResolvedValue({ scoring: { scored: 1, unavailable: 0, skipped: null }, labelling: { labelled: 0, waiting: 1 } });
});
afterEach(() => {
  for (const name of flags) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

describe('equity outbound flags', () => {
  it('leaves desk emails on and the radar Discord post off unless true or 1', () => {
    expect(adminEquityEmailsDisabled()).toBe(false);
    expect(adminRadarDiscordEnabled()).toBe(false);
    process.env.ADMIN_EQUITY_EMAILS_DISABLED = 'yes';
    process.env.ADMIN_RADAR_DISCORD_ENABLED = 'on';
    expect(adminEquityEmailsDisabled()).toBe(false);
    expect(adminRadarDiscordEnabled()).toBe(false);
    process.env.ADMIN_EQUITY_EMAILS_DISABLED = '1';
    process.env.ADMIN_RADAR_DISCORD_ENABLED = 'true';
    expect(adminEquityEmailsDisabled()).toBe(true);
    expect(adminRadarDiscordEnabled()).toBe(true);
  });
});

describe('morning brief email', () => {
  const call = () => morningPost(post('http://x/api/jobs/email-morning-brief', { scanLimit: 80, market: 'EQUITIES' }));

  it('sends by default', async () => {
    expect((await call()).status).toBe(200);
    expect(morning.send).toHaveBeenCalled();
    expect(morning.build).toHaveBeenCalled();
  });

  it('sends nothing when ADMIN_EQUITY_EMAILS_DISABLED is true', async () => {
    process.env.ADMIN_EQUITY_EMAILS_DISABLED = 'true';
    const body = await (await call()).json();
    expect(body).toMatchObject({ ok: true, skipped: true, reason: 'admin_equity_emails_disabled' });
    expect(morning.send).not.toHaveBeenCalled();
    expect(morning.build).not.toHaveBeenCalled();
  });
});

describe('best-opportunities email', () => {
  const call = () => picksPost(post('http://x/api/jobs/email-best-opportunities'));

  it('scans and sends by default', async () => {
    expect((await call()).status).toBe(200);
    expect(morning.send).toHaveBeenCalled();
    expect(picks.scan).toHaveBeenCalled();
  });

  it('sends nothing and does not scan when ADMIN_EQUITY_EMAILS_DISABLED is 1', async () => {
    process.env.ADMIN_EQUITY_EMAILS_DISABLED = '1';
    const body = await (await call()).json();
    expect(body).toMatchObject({ ok: true, skipped: true, reason: 'admin_equity_emails_disabled' });
    expect(morning.send).not.toHaveBeenCalled();
    expect(picks.scan).not.toHaveBeenCalled();
  });
});

describe('daily review email', () => {
  const call = () => reviewPost(post('http://x/api/jobs/email-daily-review'));

  it('sends by default', async () => {
    expect((await call()).status).toBe(200);
    expect(morning.send).toHaveBeenCalled();
    expect(review.build).toHaveBeenCalled();
  });

  it('sends nothing when ADMIN_EQUITY_EMAILS_DISABLED is true', async () => {
    process.env.ADMIN_EQUITY_EMAILS_DISABLED = 'true';
    const body = await (await call()).json();
    expect(body).toMatchObject({ ok: true, skipped: true, reason: 'admin_equity_emails_disabled' });
    expect(morning.send).not.toHaveBeenCalled();
    expect(review.build).not.toHaveBeenCalled();
  });
});

describe('morning-brief review_email action', () => {
  const call = () => {
    morning.cron.mockReturnValue(false);
    morning.admin.mockResolvedValue({ ok: true, workspaceId: 'w' });
    return actionsPost(post('http://x/api/admin/morning-brief/actions', { action: 'review_email' }, true));
  };

  it('sends by default', async () => {
    expect((await call()).status).toBe(200);
    expect(morning.send).toHaveBeenCalled();
  });

  it('sends nothing when ADMIN_EQUITY_EMAILS_DISABLED is true', async () => {
    process.env.ADMIN_EQUITY_EMAILS_DISABLED = 'true';
    const body = await (await call()).json();
    expect(body).toMatchObject({ ok: true, skipped: true, reason: 'admin_equity_emails_disabled' });
    expect(morning.send).not.toHaveBeenCalled();
  });
});

describe('evening packet', () => {
  const call = () => eveningPost(post('http://x/api/cron/evening-packet'));

  it('sends the summary and calls Jev by default', async () => {
    const body = await (await call()).json();
    expect(body.processed).toBe(1);
    expect(evening.notify).toHaveBeenCalledWith(expect.objectContaining({ subject: expect.stringContaining('Evening Packet') }));
    expect(evening.jev).toHaveBeenCalledTimes(1);
  });

  it('keeps the Jev call when the summary email is opted out', async () => {
    process.env.ADMIN_EQUITY_EMAILS_DISABLED = 'true';
    expect((await call()).status).toBe(200);
    expect(evening.notify).not.toHaveBeenCalled();
    expect(evening.jev).toHaveBeenCalledTimes(1);
  });
});

describe('edge failure emails', () => {
  it('edge rebuild emails by default and stays quiet when desk emails are opted out', async () => {
    evening.q.mockRejectedValue(new Error('db down'));
    const on = await rebuildPost(post('http://x/api/cron/edge-rebuild-matrix'));
    expect(on.status).toBe(500);
    expect(evening.notify).toHaveBeenCalledWith(expect.objectContaining({ subject: 'edge-rebuild-matrix failed' }));
    evening.notify.mockClear();
    process.env.ADMIN_EQUITY_EMAILS_DISABLED = 'true';
    const off = await rebuildPost(post('http://x/api/cron/edge-rebuild-matrix'));
    expect(off.status).toBe(500);
    expect(evening.notify).not.toHaveBeenCalled();
  });

  it('edge label emails by default and stays quiet when desk emails are opted out', async () => {
    const on = await labelPost(post('http://x/api/cron/edge-label-outcomes'));
    expect(on.status).toBe(500);
    expect(evening.notify).toHaveBeenCalledWith(expect.objectContaining({ subject: 'edge-label-outcomes failed' }));
    evening.notify.mockClear();
    process.env.ADMIN_EQUITY_EMAILS_DISABLED = '1';
    const off = await labelPost(post('http://x/api/cron/edge-label-outcomes'));
    expect(off.status).toBe(500);
    expect(evening.notify).not.toHaveBeenCalled();
  });
});

describe('arca equity Jev fallback', () => {
  it('calls Jev while the evening cron is discovery-skipped, with no AI flag', async () => {
    const run = vi.fn(async () => ({ ok: true, scored: 1 }));
    const redis = { set: async () => 'OK' };
    expect(await equityNewsJevFallback(redis, true, run)).toEqual({ ok: true, scored: 1 });
    expect(run).toHaveBeenCalledWith(redis);
    expect(await equityNewsJevFallback(redis, false, run)).toEqual({ ok: true, skipped: true, reason: 'Evening cron handles it' });
    expect(readFileSync('app/api/cron/arca-cycle/route.ts', 'utf8')).toContain('equityNewsJevFallback');
    expect(readFileSync('app/api/cron/evening-packet/route.ts', 'utf8')).toContain('runNewsJevDaily()');
    expect(readFileSync('lib/admin/equityOutbound.ts', 'utf8')).not.toContain('ADMIN_EQUITY_AI_ENABLED');
  });
});
