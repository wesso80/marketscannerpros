import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({ q: vi.fn(), crypto: vi.fn(), push: vi.fn(), email: vi.fn(), discord: vi.fn(), discordDetailed: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/coingecko', () => ({ getPriceBySymbol: mocks.crypto }));
vi.mock('@/lib/avRateGovernor', () => ({ avTakeToken: async () => undefined }));
vi.mock('@/lib/email', () => ({ sendAlertEmail: mocks.email }));
vi.mock('@/lib/pushServer', () => ({ sendPushToUser: mocks.push, PushTemplates: {} }));
vi.mock('@/lib/discord-bridge', () => ({
  postToDiscord: mocks.discord,
  postToDiscordDetailed: mocks.discordDetailed,
  buildAlertEmbed: (x: unknown) => x,
}));

import { GET as runCheck } from '@/app/api/alerts/check/route';

describe('user alert triggers are not posted to the shared Discord channel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM alerts')) {
        return [{ id: 'a1', workspace_id: 'ws-1', symbol: 'BTC', asset_type: 'crypto', condition_type: 'price_above', condition_value: '50000', is_recurring: false, notify_email: true, notify_push: true, name: 'BTC 50k' }];
      }
      if (sql.includes('FROM user_subscriptions')) return [{ email: 'user@example.test' }];
      return [];
    });
    mocks.crypto.mockResolvedValue({ price: 60000, change24h: 1 });
    mocks.push.mockResolvedValue(undefined);
    mocks.email.mockResolvedValue(undefined);
  });

  it('delivers to the user (push + email) and never calls the Discord bridge', async () => {
    const body = await (await runCheck(new NextRequest('https://example.test/api/alerts/check'))).json();
    expect(body.triggeredIds).toEqual(['a1']);
    expect(mocks.push).toHaveBeenCalledWith('ws-1', expect.objectContaining({ title: expect.stringContaining('BTC') }));
    expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({ to: 'user@example.test' }));
    expect(mocks.discord).not.toHaveBeenCalled();
    expect(mocks.discordDetailed).not.toHaveBeenCalled();
  });

  it('no user-alert checker references the shared msp-alerts channel', () => {
    for (const route of ['check', 'smart-check', 'signal-check', 'strategy-check', 'test-trigger']) {
      const src = readFileSync(resolve(__dirname, `../app/api/alerts/${route}/route.ts`), 'utf8');
      expect(src, route).not.toMatch(/msp-alerts|postToDiscord|discord-bridge/);
    }
  });
});
