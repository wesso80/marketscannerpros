import { createHmac } from 'crypto';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: 'email_123' }, error: null as null | { message: string } })),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => mocks.send(...args) };
  },
}));

import { resetMagicLinkEmailCooldown } from '@/lib/magicLinkCooldown';
import {
  buildSignInEmail,
  DEFAULT_AUTH_FROM_EMAIL,
  resolveAuthFromEmail,
  resolveAuthReplyTo,
  sendAlertEmail,
  sendSignInEmail,
} from '@/lib/email';
import { POST as magicLinkPOST } from '@/app/api/auth/magic-link/route';
import { POST as resendWebhookPOST } from '@/app/api/webhooks/resend/route';

const EMOJI = /\p{Extended_Pictographic}/u;

function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

function logText(): string {
  return vi.mocked(console.log).mock.calls.map((args) => args.map(String).join(' ')).join('\n');
}

function magicRequest(email: string, ip: string) {
  return new NextRequest('https://marketscannerpros.app/api/auth/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email }),
  });
}

function webhookSecret(): string {
  return `whsec_${Buffer.from('resend-webhook-test-secret-key').toString('base64')}`;
}

function signWebhook(payload: string, secret: string, signature?: string) {
  const id = 'msg_test_1';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
  return { id, timestamp, signature: signature ?? `v1,${sig}` };
}

function webhookRequest(payload: string, headers: Record<string, string>) {
  return new NextRequest('https://marketscannerpros.app/api/webhooks/resend', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: payload,
  });
}

describe('sign-in email hardening', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T02:00:00.000Z'));
    resetMagicLinkEmailCooldown();
    mocks.send.mockReset();
    mocks.send.mockResolvedValue({ data: { id: 'email_123' }, error: null });
    vi.stubEnv('RESEND_API_KEY', 're_test_dummy');
    vi.stubEnv('AUTH_FROM_EMAIL', '');
    vi.stubEnv('AUTH_REPLY_TO', '');
    vi.stubEnv('RESEND_FROM_EMAIL', 'MarketScanner Pros <alerts@marketscannerpros.app>');
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    resetMagicLinkEmailCooldown();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('builds plain text and html with the sign-in URL exactly once and no emoji', () => {
    const url = 'https://marketscannerpros.app/auth/verify?token=abc.def&next=%2Ftools';
    const built = buildSignInEmail(url);
    expect(built.subject).toBe('Your sign-in link');
    expect(count(built.text, url)).toBe(1);
    expect(count(built.html, url)).toBe(1);
    expect(built.html).toContain('background-color:#ffffff');
    expect(`${built.subject}\n${built.text}\n${built.html}`).not.toMatch(EMOJI);
    expect(built.html).not.toContain('#070B14');
    expect(built.html).not.toContain('#0f172a');
  });

  it('selects the dedicated auth sender and falls back when AUTH_FROM_EMAIL is unset', () => {
    expect(resolveAuthFromEmail({ AUTH_FROM_EMAIL: '  Login <login@example.test>  ' } as NodeJS.ProcessEnv)).toBe('Login <login@example.test>');
    expect(resolveAuthFromEmail({} as NodeJS.ProcessEnv)).toBe(DEFAULT_AUTH_FROM_EMAIL);
    expect(resolveAuthFromEmail({ RESEND_FROM_EMAIL: 'MarketScanner Pros <alerts@marketscannerpros.app>' } as NodeJS.ProcessEnv)).toBe(DEFAULT_AUTH_FROM_EMAIL);
    expect(resolveAuthReplyTo({} as NodeJS.ProcessEnv)).toBeUndefined();
    expect(resolveAuthReplyTo({ AUTH_REPLY_TO: ' support@marketscannerpros.app ' } as NodeJS.ProcessEnv)).toBe('support@marketscannerpros.app');
  });

  it('sends sign-in mail from the auth sender and leaves alert mail on the alerts sender', async () => {
    vi.stubEnv('AUTH_FROM_EMAIL', 'MarketScanner Pros <login@marketscannerpros.app>');
    vi.stubEnv('AUTH_REPLY_TO', 'support@marketscannerpros.app');
    const url = 'https://marketscannerpros.app/auth/verify?token=abc.def';
    await sendSignInEmail({ to: 'person@example.test', verifyUrl: url });

    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({
      from: 'MarketScanner Pros <login@marketscannerpros.app>',
      replyTo: 'support@marketscannerpros.app',
      to: 'person@example.test',
      subject: 'Your sign-in link',
    }));
    const signInPayload = mocks.send.mock.calls.at(-1)?.[0] as { text: string; html: string };
    expect(count(signInPayload.text, url)).toBe(1);
    expect(count(signInPayload.html, url)).toBe(1);
    expect(logText()).toContain('Email sent to person@example.test: Your sign-in link id=email_123');
    expect(logText()).not.toContain(url);
    expect(logText()).not.toContain('token=');

    mocks.send.mockClear();
    vi.mocked(console.log).mockClear();
    await sendAlertEmail({ to: 'person@example.test', subject: 'Price Alert: demo', html: '<p>alert</p>' });
    const alertPayload = mocks.send.mock.calls.at(-1)?.[0] as { from: string; replyTo?: string; text?: string; html: string };
    expect(alertPayload.from).toBe('MarketScanner Pros <alerts@marketscannerpros.app>');
    expect(alertPayload.replyTo).toBeUndefined();
    expect(alertPayload.text).toBeUndefined();
    expect(alertPayload.html).toBe('<p>alert</p>');
    expect(logText()).toContain('id=email_123');
  });

  it('keeps sign-in working with the login sender and no reply-to when the new env vars are unset', async () => {
    await sendSignInEmail({ to: 'person@example.test', verifyUrl: 'https://marketscannerpros.app/auth/verify?token=abc' });
    const payload = mocks.send.mock.calls.at(-1)?.[0] as { from: string; replyTo?: string; text?: string };
    expect(payload.from).toBe(DEFAULT_AUTH_FROM_EMAIL);
    expect(payload.from).not.toContain('alerts@');
    expect(payload.replyTo).toBeUndefined();
    expect(payload.text).toContain('https://marketscannerpros.app/auth/verify?token=abc');
  });

  it('refuses a second sign-in request for the same email within 60 seconds', async () => {
    const email = 'BradleyWessling@Yahoo.com.au';
    const first = await magicLinkPOST(magicRequest(email, '203.0.113.10'));
    expect(first.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    const sent = mocks.send.mock.calls[0][0] as { subject: string; text: string; html: string; from: string };
    const urls = sent.text.match(/https:\/\/\S+/g) ?? [];
    expect(urls).toHaveLength(1);
    expect(count(sent.html, urls[0])).toBe(1);
    expect(sent.subject).toBe('Your sign-in link');
    expect(`${sent.subject}\n${sent.text}\n${sent.html}`).not.toMatch(EMOJI);
    expect(logText()).toMatch(/id=email_123/);
    expect(logText()).not.toContain(urls[0]);

    const second = await magicLinkPOST(magicRequest('bradleywessling@yahoo.com.au', '203.0.113.10'));
    expect(second.status).toBe(429);
    const body = await second.json();
    expect(body.error).toBe('We sent a sign-in link to b***@yahoo.com.au. Check your spam folder, then try again in a minute.');
    expect(mocks.send).toHaveBeenCalledTimes(1);

    const other = await magicLinkPOST(magicRequest('other@example.test', '203.0.113.11'));
    expect(other.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(2);

    vi.setSystemTime(new Date('2026-10-05T02:01:00.000Z'));
    const after = await magicLinkPOST(magicRequest(email, '203.0.113.10'));
    expect(after.status).toBe(200);
    expect(mocks.send).toHaveBeenCalledTimes(3);
  });

  it('shows the cooldown message from the sign-in page', () => {
    const src = readFileSync(new URL('../app/auth/page.tsx', import.meta.url), 'utf8');
    expect(src).toContain('/api/auth/magic-link');
    expect(src).toContain('data.error');
    expect(src).toContain('{status.text}');
  });

  it('accepts a signed Resend webhook and logs a masked recipient', async () => {
    const secret = webhookSecret();
    vi.stubEnv('RESEND_WEBHOOK_SECRET', secret);
    const payload = JSON.stringify({
      type: 'email.bounced',
      data: {
        email_id: 'email_123',
        to: ['bradleywessling@yahoo.com.au'],
        bounce: { message: '550 5.1.1 bradleywessling@yahoo.com.au user unknown', type: 'Permanent' },
      },
    });
    const signed = signWebhook(payload, secret);
    const res = await resendWebhookPOST(webhookRequest(payload, {
      'svix-id': signed.id,
      'svix-timestamp': signed.timestamp,
      'svix-signature': signed.signature,
    }));
    expect(res.status).toBe(200);
    expect(logText()).toContain('[resend-webhook] id=email_123 type=email.bounced to=b***@yahoo.com.au reason=550 5.1.1 b***@yahoo.com.au user unknown');
    expect(logText()).not.toContain('bradleywessling');
  });

  it('rejects an invalid Resend webhook signature', async () => {
    const secret = webhookSecret();
    vi.stubEnv('RESEND_WEBHOOK_SECRET', secret);
    const payload = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 'email_999', to: ['bradleywessling@yahoo.com.au'] },
    });
    const signed = signWebhook(payload, secret, 'v1,bm90LXZhbGlk');
    const res = await resendWebhookPOST(webhookRequest(payload, {
      'svix-id': signed.id,
      'svix-timestamp': signed.timestamp,
      'svix-signature': signed.signature,
    }));
    expect(res.status).toBe(400);
    expect(logText()).not.toContain('email_999');
    expect(logText()).not.toContain('bradleywessling');
  });

  it('ignores Resend webhooks when the secret is unset', async () => {
    const secret = webhookSecret();
    const payload = JSON.stringify({
      type: 'email.delivered',
      data: { email_id: 'email_unsigned', to: ['bradleywessling@yahoo.com.au'] },
    });
    const signed = signWebhook(payload, secret);
    const res = await resendWebhookPOST(webhookRequest(payload, {
      'svix-id': signed.id,
      'svix-timestamp': signed.timestamp,
      'svix-signature': signed.signature,
    }));
    expect(res.status).toBe(503);
    expect(logText()).not.toContain('email_unsigned');
    expect(logText()).not.toContain('bradleywessling');
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
