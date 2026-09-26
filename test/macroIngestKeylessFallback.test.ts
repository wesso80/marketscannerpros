import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ q: vi.fn(), notify: vi.fn(), admin: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/admin/notifyAdmin', () => ({ notifyAdmin: mocks.notify }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: mocks.admin }));

import { ingestFred, REGIME_REQUIRED_SERIES } from '@/lib/macro/fred';
import { POST } from '@/app/api/cron/macro-ingest/route';

const REJECTED = 'Bad Request.  The value for variable api_key is not registered.  Read https://fred.stlouisfed.org/docs/api/api_key.html for more information.';
const csv = (id: string) => `observation_date,${id}\n2026-09-21,14.50\n2026-09-22,14.21\n`;
const apiJson = { observations: [{ date: '2026-09-21', value: '14.50' }, { date: '2026-09-22', value: '14.21' }] };

type Behaviour = { api?: (id: string) => Response; csv?: (id: string) => Response };
function stubFetch(b: Behaviour) {
  const calls: { kind: 'api' | 'csv'; id: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.stlouisfed.org') {
      const id = url.searchParams.get('series_id')!;
      calls.push({ kind: 'api', id });
      return b.api ? b.api(id) : new Response(JSON.stringify(apiJson), { status: 200 });
    }
    const id = url.searchParams.get('id')!;
    calls.push({ kind: 'csv', id });
    return b.csv ? b.csv(id) : new Response(csv(id), { status: 200 });
  }));
  return calls;
}
const rejected = () => new Response(JSON.stringify({ error_code: 400, error_message: REJECTED }), { status: 400 });
const writtenKeys = () => mocks.q.mock.calls
  .filter(([sql]) => String(sql).includes('INSERT INTO macro_series ('))
  .map(([, params]) => (params as unknown[])[0]);

const ONLY = ['VIX', 'CREDIT_HY_OAS', 'US10Y'];

describe('ingestFred keyless CSV fallback (OV-12 follow-up)', () => {
  let errSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mocks.q.mockReset().mockResolvedValue([]);
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('covers the regime series', () => {
    expect([...REGIME_REQUIRED_SERIES]).toEqual(['VIX', 'CREDIT_HY_OAS']);
  });

  it('a rejected FRED_API_KEY falls back to the CSV and still stores every series', async () => {
    vi.stubEnv('FRED_API_KEY', 'bad-key');
    const calls = stubFetch({ api: rejected });
    const r = await ingestFred({ only: ONLY });
    expect(r).toMatchObject({ ok: true, via: 'csv', failed: 0, ingested: 6, requiredFailed: [] });
    expect(r.perSeries.map((s) => s.via)).toEqual(['csv', 'csv', 'csv']);
    expect(r.apiFallbacks?.[0]).toEqual({ seriesKey: 'VIX', apiError: `FRED HTTP 400: ${REJECTED}` });
    expect(r.apiFallbacks?.[1].apiError).toContain('rejected earlier');
    // One rejected API call, then CSV only (no point hitting the API with a bad key 11 times).
    expect(calls.filter((c) => c.kind === 'api')).toHaveLength(1);
    expect(calls.filter((c) => c.kind === 'csv').map((c) => c.id)).toEqual(['VIXCLS', 'BAMLH0A0HYM2', 'DGS10']);
    expect(writtenKeys()).toEqual(['VIX', 'CREDIT_HY_OAS', 'US10Y']);
  });

  it('with no key uses the CSV directly', async () => {
    vi.stubEnv('FRED_API_KEY', '');
    const calls = stubFetch({});
    const r = await ingestFred({ only: ['VIX'] });
    expect(r).toMatchObject({ ok: true, via: 'csv', ingested: 2, apiFallbacks: [] });
    expect(calls).toEqual([{ kind: 'csv', id: 'VIXCLS' }]);
  });

  it('with a working key uses the API only', async () => {
    vi.stubEnv('FRED_API_KEY', 'good-key');
    const calls = stubFetch({});
    const r = await ingestFred({ only: ONLY });
    expect(r).toMatchObject({ ok: true, via: 'api', ingested: 6, apiFallbacks: [] });
    expect(calls.every((c) => c.kind === 'api')).toBe(true);
  });

  it('a transient API error falls back for that series only and keeps using the API', async () => {
    vi.stubEnv('FRED_API_KEY', 'good-key');
    const calls = stubFetch({ api: (id) => id === 'VIXCLS' ? new Response('oops', { status: 500 }) : new Response(JSON.stringify(apiJson), { status: 200 }) });
    const r = await ingestFred({ only: ONLY });
    expect(r).toMatchObject({ ok: true, via: 'mixed', failed: 0 });
    expect(r.perSeries.map((s) => s.via)).toEqual(['csv', 'api', 'api']);
    expect(calls.filter((c) => c.kind === 'api')).toHaveLength(3);
  });

  it('reports a clear failure, with both errors, when neither path works', async () => {
    vi.stubEnv('FRED_API_KEY', 'bad-key');
    stubFetch({ api: rejected, csv: (id) => id === 'VIXCLS' ? new Response('down', { status: 503 }) : new Response(csv(id), { status: 200 }) });
    const r = await ingestFred({ only: ONLY });
    expect(r).toMatchObject({ ok: false, reason: 'fred-error', failed: 1, ingested: 4, requiredFailed: ['VIX'] });
    expect(r.perSeries[0]).toMatchObject({ seriesKey: 'VIX', rows: 0, error: `API: FRED HTTP 400: ${REJECTED}; CSV: FRED CSV HTTP 503` });
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining('[macro-ingest] VIX (VIXCLS) failed'));
    expect(writtenKeys()).toEqual(['CREDIT_HY_OAS', 'US10Y']);
  });
});

describe('POST /api/cron/macro-ingest with fallback results (OV-12 follow-up)', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 's3cret';
    mocks.q.mockReset().mockResolvedValue([]);
    mocks.notify.mockReset().mockResolvedValue(undefined);
    mocks.admin.mockResolvedValue({ ok: false });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns 502 (so curl -f fails) when a regime series could not be fetched, even if others were stored', async () => {
    vi.stubEnv('FRED_API_KEY', '');
    stubFetch({ csv: (id) => id === 'VIXCLS' ? new Response('down', { status: 503 }) : new Response(csv(id), { status: 200 }) });
    const res = await POST(new NextRequest('http://localhost/api/cron/macro-ingest?only=VIX,US10Y', { method: 'POST', headers: { 'x-cron-secret': 's3cret' } }));
    const body = await res.json();
    expect(res.status).toBe(502);
    expect(body).toMatchObject({ ok: false, failed: 1, requiredFailed: ['VIX'] });
    expect(body.ingested).toBeGreaterThan(0);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error', subject: 'macro-ingest: regime series failed (VIX)' }));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('1 series failed'));
  });

  it('stores via CSV with 200 when the key is rejected, and warns the admin to check FRED_API_KEY', async () => {
    vi.stubEnv('FRED_API_KEY', 'bad-key');
    stubFetch({ api: rejected });
    const res = await POST(new NextRequest('http://localhost/api/cron/macro-ingest?only=VIX,CREDIT_HY_OAS', { method: 'POST', headers: { 'x-cron-secret': 's3cret' } }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, via: 'csv', ingested: 4, failed: 0 });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warn', subject: 'macro-ingest: FRED API failed, used keyless CSV', body: expect.stringContaining('Check FRED_API_KEY') }));
  });

  it('still rejects an unauthorised call before touching FRED', async () => {
    const calls = stubFetch({});
    const res = await POST(new NextRequest('http://localhost/api/cron/macro-ingest', { method: 'POST' }));
    expect(res.status).toBe(401);
    expect(calls).toHaveLength(0);
  });
});
