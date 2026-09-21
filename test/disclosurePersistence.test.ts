import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
import { getSessionFromCookie } from '@/lib/auth';
import { q } from '@/lib/db';
import { GET } from '@/app/api/disclosure/status/route';
import { POST } from '@/app/api/disclosure/accept/route';
import { DISCLOSURE_VERSION } from '@/lib/disclosure';

const request = (version = DISCLOSURE_VERSION) => new Request('https://example.test/api/disclosure/accept', { method: 'POST', body: JSON.stringify({ version }) });
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSessionFromCookie).mockResolvedValue({ workspaceId: 'workspace-a', tier: 'pro' } as any);
  vi.mocked(q).mockResolvedValue([]);
});
describe('disclosure acceptance persistence', () => {
  it('checks the authenticated workspace and current version; never writes on status reads', async () => {
    expect(await (await GET()).json()).toMatchObject({ accepted: false, version: DISCLOSURE_VERSION });
    expect(q).toHaveBeenCalledWith(expect.stringContaining('version = $2'), ['workspace-a', DISCLOSURE_VERSION]);
    vi.mocked(q).mockResolvedValue([{ '?column?': 1 }]);
    expect(await (await GET()).json()).toMatchObject({ accepted: true });
  });
  it('returns a service error when persistence fails, never successful acceptance', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(q).mockRejectedValue(new Error('relation does not exist'));
    expect((await POST(request())).status).toBe(503);
    expect((await GET()).status).toBe(503);
    errorLog.mockRestore();
  });
  it('rejects unauthenticated or out-of-date acceptance before writing', async () => {
    expect((await POST(request('old'))).status).toBe(409);
    vi.mocked(getSessionFromCookie).mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(q).not.toHaveBeenCalled();
  });
  it('persists only explicit current-version acceptance and preserves its original time on retries', async () => {
    expect(await (await POST(request())).json()).toEqual({ ok: true, version: DISCLOSURE_VERSION });
    expect(q).toHaveBeenCalledWith(expect.stringContaining('WHERE disclosure_acceptance.version <> EXCLUDED.version'), ['workspace-a', DISCLOSURE_VERSION]);
  });
});
