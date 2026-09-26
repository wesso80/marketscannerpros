import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  cron: vi.fn(() => true),
  admin: vi.fn(async () => ({ ok: false })),
  send: vi.fn(async () => 'id'),
  build: vi.fn(),
  save: vi.fn(async (b: { briefId: string }) => b),
  already: vi.fn(async () => false),
  cg: vi.fn(() => false),
}));
vi.mock('@/lib/adminAuth', () => ({ verifyCronAuth: m.cron, requireAdmin: m.admin }));
vi.mock('@/lib/email', () => ({ sendAlertEmail: m.send }));
vi.mock('@/lib/operator/market-data', () => ({ operatorCgFetchEnabled: m.cg }));
vi.mock('@/lib/admin/morning-brief', () => ({
  buildMorningBrief: m.build,
  saveMorningBriefSnapshot: m.save,
  cronBriefAlreadySent: m.already,
  dailyMorningBriefId: (market: string, tf: string) => `2026-09-27:${market}:${tf}`,
  renderMorningBriefEmail: () => '<p>brief</p>',
}));

import { POST } from '@/app/api/jobs/email-morning-brief/route';

const req = (body: unknown) => new Request('http://x/api/jobs/email-morning-brief', { method: 'POST', body: JSON.stringify(body) }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.cron.mockReturnValue(true);
  m.already.mockResolvedValue(false);
  m.build.mockImplementation(async (o: { market: string }) => ({ briefId: `2026-09-27:${o.market}:15m`, market: o.market, deskState: 'WAIT', topPlays: [] }));
});

describe('email-morning-brief job', () => {
  it('cron body without a market builds EQUITIES while crypto is off, sends, then saves as cron', async () => {
    const res = await POST(req({ scanLimit: 80 }));
    expect(res.status).toBe(200);
    expect(m.build).toHaveBeenCalledWith(expect.objectContaining({ market: 'EQUITIES' }));
    expect(m.send).toHaveBeenCalled();
    expect(m.save).toHaveBeenCalledWith(expect.anything(), 'cron');
    expect(m.send.mock.invocationCallOrder[0]).toBeLessThan(m.save.mock.invocationCallOrder[0]);
  });

  it('a curl retry after today\'s cron brief was sent is skipped (no second email)', async () => {
    m.already.mockResolvedValue(true);
    const res = await POST(req({ scanLimit: 80 }));
    const data = await res.json();
    expect(data.skipped).toBe('already_sent');
    expect(m.build).not.toHaveBeenCalled();
    expect(m.send).not.toHaveBeenCalled();
  });

  it('a retry while the first run is still going is skipped', async () => {
    let release: () => void = () => {};
    m.build.mockImplementationOnce(() => new Promise((res) => { release = () => res({ briefId: 'b', market: 'EQUITIES', deskState: 'WAIT', topPlays: [] }); }));
    const first = POST(req({}));
    await new Promise((r) => setTimeout(r, 0));
    const second = await POST(req({}));
    expect((await second.json()).skipped).toBe('in_progress');
    release();
    expect((await first).status).toBe(200);
    expect(m.send).toHaveBeenCalledTimes(1);
  });

  it('a failed send is not marked as sent (so a retry can resend)', async () => {
    m.send.mockRejectedValueOnce(new Error('resend down'));
    const res = await POST(req({}));
    expect(res.status).toBe(500);
    expect(m.save).not.toHaveBeenCalled();
  });

  it('admin sends are not blocked by the cron guard', async () => {
    m.cron.mockReturnValue(false);
    m.admin.mockResolvedValue({ ok: true });
    m.already.mockResolvedValue(true);
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    expect(m.send).toHaveBeenCalled();
    expect(m.save).toHaveBeenCalledWith(expect.anything(), 'email');
  });
});
