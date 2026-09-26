import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ ingest: vi.fn(), notify: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/macro/fred', () => ({ ingestFred: mocks.ingest }));
vi.mock('@/lib/admin/notifyAdmin', () => ({ notifyAdmin: mocks.notify }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: mocks.admin }));

import { POST } from '@/app/api/cron/macro-ingest/route';

const req = () => new NextRequest('http://localhost/api/cron/macro-ingest', { method: 'POST', headers: { 'x-cron-secret': 's3cret' } });

describe('POST /api/cron/macro-ingest failure visibility (OV-1)', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 's3cret';
    mocks.ingest.mockReset();
    mocks.notify.mockReset().mockResolvedValue(undefined);
    mocks.admin.mockResolvedValue({ ok: false });
  });

  it('returns 502 and alerts the admin when every series failed (curl -f in the cron then fails)', async () => {
    mocks.ingest.mockResolvedValue({ ok: false, reason: 'fred-error', via: 'api', ingested: 0, failed: 2, perSeries: [
      { seriesKey: 'VIX', rows: 0, latest: null, error: 'FRED: Bad Request. The value for variable api_key is not registered.' },
      { seriesKey: 'US10Y', rows: 0, latest: null, error: 'FRED HTTP 400' },
    ] });
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', body: expect.stringContaining('VIX: FRED: Bad Request') }));
  });

  it('stays 200 but still warns the admin on a partial failure', async () => {
    mocks.ingest.mockResolvedValue({ ok: false, reason: 'fred-error', via: 'csv', ingested: 120, failed: 1, perSeries: [
      { seriesKey: 'VIX', rows: 120, latest: '2026-09-22' },
      { seriesKey: 'DXY', rows: 0, latest: null, error: 'FRED CSV HTTP 500' },
    ] });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn' }));
  });

  it('200 and no alert when everything was ingested', async () => {
    mocks.ingest.mockResolvedValue({ ok: true, via: 'api', ingested: 50, failed: 0, perSeries: [{ seriesKey: 'VIX', rows: 50, latest: '2026-09-22' }] });
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mocks.notify).not.toHaveBeenCalled();
  });
});
