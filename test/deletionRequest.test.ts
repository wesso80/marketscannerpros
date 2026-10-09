import { beforeEach, describe, expect, it, vi } from 'vitest';

const qMock = vi.hoisted(() => vi.fn());
const sessionMock = vi.hoisted(() => vi.fn());
const emailMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({ q: qMock }));
vi.mock('@/lib/auth', async () => {
  const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
  return { ...actual, getSessionFromCookie: sessionMock };
});
vi.mock('@/lib/email', () => ({ sendDeletionRequestEmail: emailMock }));

describe('POST /api/auth/delete-request', () => {
  beforeEach(() => {
    vi.resetModules();
    qMock.mockReset();
    emailMock.mockReset();
    sessionMock.mockReset();
    sessionMock.mockResolvedValue({ workspaceId: 'ws_1', cid: 'free_reader@example.test' });
    qMock.mockResolvedValue([]);
    emailMock.mockResolvedValue(undefined);
  });

  it('stores the request and emails support, then promises 48 hours', async () => {
    const { POST } = await import('../app/api/auth/delete-request/route');
    const res = await POST(new Request('http://localhost/api/auth/delete-request', { method: 'POST' }) as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      success: true,
      message: 'Deletion request submitted. You will receive confirmation within 48 hours.',
    });
    expect(String(qMock.mock.calls[0][0])).toContain('INSERT INTO deletion_requests');
    expect(String(qMock.mock.calls[0][0])).toContain('ON CONFLICT (workspace_id) DO UPDATE');
    expect(qMock.mock.calls[0][1]).toEqual(['ws_1', 'free_reader@example.test']);
    expect(emailMock).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'ws_1',
      customerId: 'free_reader@example.test',
    }));
  });

  it('still confirms when the table insert fails and the email is sent', async () => {
    qMock.mockRejectedValue(Object.assign(new Error('missing'), { code: '42P01' }));
    const { POST } = await import('../app/api/auth/delete-request/route');
    const res = await POST(new Request('http://localhost/api/auth/delete-request', { method: 'POST' }) as never);
    expect(res.status).toBe(200);
    expect(emailMock).toHaveBeenCalledOnce();
  });

  it('returns an error when both the insert and the email fail', async () => {
    qMock.mockRejectedValue(Object.assign(new Error('missing'), { code: '42P01' }));
    emailMock.mockRejectedValue(Object.assign(new Error('mail'), { name: 'ResendError' }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { POST } = await import('../app/api/auth/delete-request/route');
    const res = await POST(new Request('http://localhost/api/auth/delete-request', { method: 'POST' }) as never);
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: 'Failed to process request' });
    const logged = error.mock.calls.map((call) => JSON.stringify(call)).join('\n');
    expect(logged).toContain('Deletion request was not recorded');
    expect(logged).toContain('42P01');
    expect(logged).not.toContain('reader@example.test');
    expect(logged).not.toContain('ws_1');
    error.mockRestore();
  });

  it('rejects a signed-out request', async () => {
    sessionMock.mockResolvedValue(null);
    const { POST } = await import('../app/api/auth/delete-request/route');
    const res = await POST(new Request('http://localhost/api/auth/delete-request', { method: 'POST' }) as never);
    expect(res.status).toBe(401);
    expect(qMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();
  });
});
