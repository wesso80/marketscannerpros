import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({ q: vi.fn(), crypto: vi.fn(), push: vi.fn(), email: vi.fn(), bridge: vi.fn(), session: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/coingecko', () => ({ getPriceBySymbol: mocks.crypto }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/email', () => ({ sendAlertEmail: mocks.email }));
vi.mock('@/lib/pushServer', () => ({ sendPushToUser: mocks.push, PushTemplates: {} }));
vi.mock('@/lib/discord-bridge', () => ({ postToDiscord: mocks.bridge, postToDiscordDetailed: mocks.bridge, buildAlertEmbed: (x: unknown) => x }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: mocks.session }));
vi.mock('@/lib/notifications/tradeEvents', () => ({ ensureNotificationSchema: async () => undefined }));

import { isDiscordWebhookUrl, normalizeDiscordWebhookUrl, sendDiscordWebhook } from '@/lib/notifications/discordWebhook';
import { deliverAlertToUserDiscord } from '@/lib/alerts/userDiscord';
import { GET as runCheck } from '@/app/api/alerts/check/route';
import { POST as savePrefs } from '@/app/api/notifications/prefs/route';

const HOOK = 'https://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-JKLmnopQRSTuvwxyz0123456789';

describe('TR-26: Discord webhook URL validation', () => {
  it('accepts real Discord webhook URLs', () => {
    expect(isDiscordWebhookUrl(HOOK)).toBe(true);
    expect(isDiscordWebhookUrl(HOOK.replace('discord.com', 'discordapp.com'))).toBe(true);
    expect(isDiscordWebhookUrl(HOOK.replace('discord.com', 'canary.discord.com'))).toBe(true);
    expect(isDiscordWebhookUrl(HOOK.replace('/api/', '/api/v10/'))).toBe(true);
    expect(isDiscordWebhookUrl(`${HOOK}?thread_id=987654321098765432`)).toBe(true);
    expect(normalizeDiscordWebhookUrl(`  ${HOOK}  `)).toBe(HOOK);
  });

  it('rejects anything else (the server makes this request)', () => {
    for (const bad of [
      'https://example.com/api/webhooks/123456789012345678/abcDEF_ghi-JKLmnopQRSTuvwxyz',
      'http://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-JKLmnopQRSTuvwxyz',
      'https://discord.com.evil.example/api/webhooks/123456789012345678/abcDEF_ghi-JKLmnopQRSTuvwxyz',
      'https://user:pw@discord.com/api/webhooks/123456789012345678/abcDEF_ghi-JKLmnopQRSTuvwxyz',
      'https://discord.com:8443/api/webhooks/123456789012345678/abcDEF_ghi-JKLmnopQRSTuvwxyz',
      'https://discord.com/api/users/@me',
      'https://discord.com/api/webhooks/123456789012345678/abcDEF_ghi-JKLmnopQRSTuvwxyz/slack',
      `${HOOK}?redirect=https://evil.example`,
      'https://169.254.169.254/latest/meta-data',
      '', null, 42,
    ]) {
      expect(isDiscordWebhookUrl(bad), String(bad)).toBe(false);
    }
  });
});

describe('TR-26: sending', () => {
  it('posts plain content with mentions disabled and redirects refused', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const result = await sendDiscordWebhook(HOOK, 'hello @everyone', { fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ ok: true, status: 204 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(HOOK);
    expect(init.redirect).toBe('error');
    expect(JSON.parse(String(init.body))).toEqual({ content: 'hello @everyone', allowed_mentions: { parse: [] } });
  });

  it('never throws, and never calls a non-Discord URL', async () => {
    const failing = vi.fn(async () => new Response('Unknown Webhook', { status: 404 }));
    expect(await sendDiscordWebhook(HOOK, 'x', { fetchImpl: failing as unknown as typeof fetch })).toMatchObject({ ok: false, status: 404 });
    const throwing = vi.fn(async () => { throw new Error('network down'); });
    expect(await sendDiscordWebhook(HOOK, 'x', { fetchImpl: throwing as unknown as typeof fetch })).toEqual({ ok: false, error: 'network down' });
    const spy = vi.fn();
    expect(await sendDiscordWebhook('https://evil.example/hook', 'x', { fetchImpl: spy as unknown as typeof fetch })).toMatchObject({ ok: false });
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips users without an enabled webhook', async () => {
    const fetchImpl = vi.fn();
    const out = await deliverAlertToUserDiscord('ws-1', { title: 't', detail: 'd' }, { loadWebhook: async () => null, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ ok: false, skipped: 'not_configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
    const broken = await deliverAlertToUserDiscord('ws-1', { title: 't', detail: 'd' }, { loadWebhook: async () => { throw new Error('db down'); } });
    expect(broken).toMatchObject({ ok: false, error: 'db down' });
  });
});

describe('TR-26: the price checker delivers to the user webhook', () => {
  let prefsRow: { discord_enabled: boolean; discord_webhook_url: string | null } | null;
  const order: string[] = [];
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    order.length = 0;
    prefsRow = { discord_enabled: true, discord_webhook_url: HOOK };
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM alerts')) {
        return [{ id: 'a1', workspace_id: 'ws-1', symbol: 'BTC', asset_type: 'crypto', condition_type: 'price_above', condition_value: '50000', is_recurring: false, notify_email: true, notify_push: true, name: 'BTC 50k', last_price: '49000' }];
      }
      if (sql.includes('FROM user_subscriptions')) return [{ email: 'user@example.test' }];
      if (sql.includes('FROM notification_prefs')) return prefsRow ? [prefsRow] : [];
      return [];
    });
    mocks.crypto.mockResolvedValue({ price: 60000, change24h: 1 });
    mocks.email.mockImplementation(async () => { order.push('email'); });
    mocks.push.mockImplementation(async () => { order.push('push'); });
    fetchMock.mockImplementation(async () => { order.push('discord'); return new Response(null, { status: 204 }); });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const run = async () => (await runCheck(new NextRequest('https://example.test/api/alerts/check'))).json();

  it('posts the trigger to the user webhook after email and push, never to the shared channel', async () => {
    const body = await run();
    expect(body.triggeredIds).toEqual(['a1']);
    expect(order).toEqual(['email', 'push', 'discord']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(HOOK);
    const content = JSON.parse(String(init.body)).content as string;
    expect(content).toContain('BTC alert: BTC 50k');
    expect(content).toContain('workspace?tab=alerts');
    expect(mocks.bridge).not.toHaveBeenCalled();
  });

  it('a Discord failure does not block email, push or the trigger', async () => {
    fetchMock.mockImplementation(async () => { throw new Error('discord down'); });
    const body = await run();
    expect(body.triggeredIds).toEqual(['a1']);
    expect(body.errors).toBeUndefined();
    expect(mocks.email).toHaveBeenCalled();
    expect(mocks.push).toHaveBeenCalled();
  });

  it('does nothing when the webhook is off, missing or not a Discord URL', async () => {
    for (const row of [null, { discord_enabled: false, discord_webhook_url: HOOK }, { discord_enabled: true, discord_webhook_url: 'https://evil.example/hook' }]) {
      fetchMock.mockClear();
      prefsRow = row;
      const body = await run();
      expect(body.triggeredIds).toEqual(['a1']);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });
});

describe('TR-26: saving the webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ workspaceId: 'ws-1' });
    mocks.q.mockResolvedValue([]);
  });
  const post = (body: unknown) => savePrefs(new NextRequest('https://example.test/api/notifications/prefs', { method: 'POST', body: JSON.stringify(body) }));

  it('rejects a non-Discord URL and accepts a Discord webhook', async () => {
    const bad = await post({ discordEnabled: true, discordWebhookUrl: 'https://example.com/hook' });
    expect(bad.status).toBe(400);
    const good = await post({ discordEnabled: true, discordWebhookUrl: HOOK });
    expect(good.status).toBe(200);
    expect(mocks.q).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO notification_prefs'), expect.arrayContaining([HOOK]));
  });
});

describe('TR-26: every alert checker uses the user webhook helper', () => {
  it('check, smart-check, signal-check and strategy-check call deliverAlertToUserDiscord; the shared channel stays out', () => {
    for (const route of ['check', 'smart-check', 'signal-check', 'strategy-check']) {
      const src = readFileSync(resolve(__dirname, `../app/api/alerts/${route}/route.ts`), 'utf8');
      expect(src, route).toMatch(/await deliverAlertToUserDiscord\(alert\.workspace_id/);
      expect(src, route).not.toMatch(/msp-alerts|postToDiscord|discord-bridge/);
    }
    const router = readFileSync(resolve(__dirname, '../worker/notification-router.ts'), 'utf8');
    expect(router).toMatch(/sendDiscordWebhook\(recipient, content\)/);
    expect(router).not.toMatch(/fetch\(recipient/);
  });
});
