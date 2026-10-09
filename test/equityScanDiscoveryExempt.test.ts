import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { discoveryOnlyAction } from '@/lib/admin/discoveryOnly';
import { SCHEDULE, type HttpJob } from '@/lib/worker/schedule';

vi.mock('@/lib/entitlements', () => ({ isFreeForAllMode: () => false }));

const httpJobs = (prefix: string) => SCHEDULE.filter((job): job is HttpJob => job.kind === 'http' && job.name.startsWith(prefix));

function post(path: string, body?: Record<string, unknown>) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cron-secret': 'x' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function mw() {
  vi.resetModules();
  return (await import('../middleware')).middleware;
}

function continued(res: Response) {
  return res.headers.get('x-middleware-next') === '1';
}

describe('equity admin scans pass discovery-only', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.ADMIN_DISCOVERY_ONLY;
    process.env.APP_SIGNING_SECRET = 'middleware-test-secret';
  });

  it('lets the nine equity radar jobs and equity persist through, and keeps the other jobs blocked', async () => {
    expect(discoveryOnlyAction('/api/operator/engine/auto-scan', 'POST', { watchlist: 'us-mega-cap' })).toBe('allow');
    expect(discoveryOnlyAction('/api/operator/engine/auto-scan', 'POST', { watchlist: 'crypto-majors' })).toBe('skip_job');
    expect(discoveryOnlyAction('/api/operator/engine/auto-scan', 'POST', { watchlist: 'forex-majors' })).toBe('skip_job');
    expect(discoveryOnlyAction('/api/cron/persist-edge-packets', 'POST', { market: 'EQUITIES' })).toBe('allow');
    expect(discoveryOnlyAction('/api/cron/persist-edge-packets', 'POST', { asset: 'equities' })).toBe('allow');
    expect(discoveryOnlyAction('/api/cron/persist-edge-packets', 'POST', { market: 'CRYPTO' })).toBe('skip_job');
    expect(discoveryOnlyAction('/api/cron/persist-edge-packets', 'POST', { asset: 'crypto' })).toBe('skip_job');
    expect(discoveryOnlyAction('/api/cron/persist-edge-packets', 'POST')).toBe('skip_job');
    expect(discoveryOnlyAction('/api/jobs/email-morning-brief', 'POST', { market: 'EQUITIES' })).toBe('skip_job');
    expect(discoveryOnlyAction('/api/jobs/email-best-opportunities', 'POST')).toBe('skip_job');
    expect(discoveryOnlyAction('/api/cron/evening-packet', 'POST')).toBe('skip_job');
    expect(discoveryOnlyAction('/api/cron/edge-rebuild-matrix', 'POST')).toBe('skip_job');

    const middleware = await mw();
    const radar = httpJobs('admin-radar-equity-');
    expect(radar.map((job) => job.name)).toHaveLength(9);
    for (const job of radar) {
      const res = await middleware(post(job.path, job.body));
      expect(continued(res), job.name).toBe(true);
    }
    const equityPersist = SCHEDULE.find((job) => job.name === 'persist-edge-packets-equity');
    expect(equityPersist?.kind).toBe('http');
    if (equityPersist?.kind === 'http') {
      expect(continued(await middleware(post(equityPersist.path, equityPersist.body)))).toBe(true);
      expect(continued(await middleware(post(equityPersist.path, { asset: 'equity', timeframe: '15m' })))).toBe(true);
    }
    const cryptoPersist = SCHEDULE.find((job) => job.name === 'persist-edge-packets-crypto');
    expect(cryptoPersist?.kind).toBe('http');
    if (cryptoPersist?.kind === 'http') {
      const res = await middleware(post(cryptoPersist.path, cryptoPersist.body));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ skipped: true, reason: 'admin_discovery_only' });
    }
    for (const path of ['/api/jobs/email-morning-brief', '/api/jobs/email-best-opportunities', '/api/cron/evening-packet', '/api/cron/edge-rebuild-matrix']) {
      const body = path.endsWith('email-morning-brief') ? { scanLimit: 80, market: 'EQUITIES' } : undefined;
      const res = await middleware(post(path, body));
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ skipped: true, reason: 'admin_discovery_only' });
    }
  });
});
