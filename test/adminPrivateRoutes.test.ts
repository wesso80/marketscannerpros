import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requireAdmin } from '@/lib/adminAuth';
import { getSessionFromCookie } from '@/lib/auth';
import { isOperator } from '@/lib/quant/operatorAuth';
import { q } from '@/lib/db';
import { GET as getScannerDiagnostics } from '../app/api/admin/diagnostics/scanners/route';
import { POST as postDiscordTest } from '../app/api/admin/discord/test/route';

vi.mock('@/lib/adminAuth', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSessionFromCookie: vi.fn(),
}));

vi.mock('@/lib/quant/operatorAuth', () => ({
  isOperator: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  q: vi.fn(),
}));

vi.mock('@/lib/barCache', () => ({
  getBarCacheStats: vi.fn(() => ({ size: 0, maxEntries: 1000, entries: [] })),
}));

vi.mock('@/lib/avRateGovernor', () => ({
  getAlphaVantageProviderStatus: vi.fn(() => ({ provider: 'alpha_vantage', ok: true })),
}));

vi.mock('@/lib/coingecko', () => ({
  getCoinGeckoProviderStatus: vi.fn(() => ({ provider: 'coingecko', ok: true })),
}));

vi.mock('@/lib/logger', () => ({
  generateTraceId: vi.fn(() => 'trace-test'),
  logger: {
    withTrace: vi.fn(() => ({
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    })),
  },
}));

const requireAdminMock = vi.mocked(requireAdmin);
const getSessionFromCookieMock = vi.mocked(getSessionFromCookie);
const isOperatorMock = vi.mocked(isOperator);
const qMock = vi.mocked(q);

function request(path: string, init: RequestInit = {}) {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {}),
    },
  });
}

describe('admin private API route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ADMIN_DISCORD_WEBHOOK_URL;
    delete process.env.DISCORD_ADMIN_WEBHOOK_URL;
    delete process.env.DISCORD_WEBHOOK_URL;
  });

  it('blocks scanner diagnostics for normal non-admin users', async () => {
    requireAdminMock.mockResolvedValue({ ok: false } as any);
    getSessionFromCookieMock.mockResolvedValue({ cid: 'cus_regular', workspaceId: 'workspace-regular', tier: 'pro' } as any);
    isOperatorMock.mockReturnValue(false);

    const response = await getScannerDiagnostics(request('/api/admin/diagnostics/scanners') as any);
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload).toEqual({ error: 'Unauthorized' });
    expect(qMock).not.toHaveBeenCalled();
  });

  it('allows scanner diagnostics for admin requests only after auth passes', async () => {
    requireAdminMock.mockResolvedValue({ ok: true, source: 'admin_session' } as any);
    qMock.mockResolvedValueOnce([{ '?column?': 1 }] as any);
    qMock.mockResolvedValueOnce([{ last_signal_at: null, count_24h: 0 }] as any);

    const response = await getScannerDiagnostics(request('/api/admin/diagnostics/scanners') as any);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.traceId).toBe('trace-test');
    expect(payload.database.connected).toBe(true);
    expect(qMock).toHaveBeenCalled();
  });

  it('does not leak Discord webhook URLs in response payloads or logs', async () => {
    const webhookUrl = 'https://discord.com/api/webhooks/123456789/secret-token-value';
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    requireAdminMock.mockResolvedValue({ ok: true, source: 'admin_session' } as any);
    process.env.ADMIN_DISCORD_WEBHOOK_URL = webhookUrl;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('discord-ok', { status: 200, statusText: 'OK' })));

    const response = await postDiscordTest(request('/api/admin/discord/test', {
      method: 'POST',
      body: JSON.stringify({ channelKey: 'msp-alerts' }),
    }) as any);
    const payload = await response.json();
    const responseText = JSON.stringify(payload);
    const logText = JSON.stringify(logSpy.mock.calls);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({ ok: true, sent: true, source: 'environment', discordStatus: 200 });
    expect(responseText).not.toContain(webhookUrl);
    expect(responseText).not.toContain('secret-token-value');
    expect(logText).not.toContain(webhookUrl);
    expect(logText).not.toContain('secret-token-value');

    vi.unstubAllGlobals();
    logSpy.mockRestore();
  });
});