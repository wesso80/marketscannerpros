import { createHmac } from 'crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DigestItem = {
  id: number;
  workspace: string;
  email: string;
  day: string;
  subject: string;
  line: string;
  sent: boolean;
};

const state = {
  mode: null as string | null,
  suppressed: new Map<string, string>(),
  counts: new Map<string, number>(),
  digest: [] as DigestItem[],
  missing: false,
  nextId: 1,
};

const mocks = vi.hoisted(() => ({
  q: vi.fn(),
  send: vi.fn(async () => 'email_123'),
}));

vi.mock('@/lib/db', () => ({ q: (...args: unknown[]) => mocks.q(...args) }));
vi.mock('@/lib/email', () => ({
  sendAlertsMailboxEmail: (...args: unknown[]) => mocks.send(...args),
}));

import {
  deliverUserAlertEmail,
  noteProviderSuppression,
  resetAlertEmailSchemaWarning,
  sendDueAlertDigests,
} from '@/lib/alerts/emailControls';
import {
  alertUnsubscribeUrl,
  listUnsubscribeHeaders,
  planUserAlertEmail,
  resolveAlertEmailMode,
  signAlertUnsubscribeToken,
  verifyAlertUnsubscribeToken,
} from '@/lib/alerts/emailPolicy';
import { GET as unsubscribeGET, POST as unsubscribePOST } from '@/app/api/email/unsubscribe/route';
import { POST as digestPOST } from '@/app/api/jobs/email-alert-digest/route';
import { POST as resendWebhookPOST } from '@/app/api/webhooks/resend/route';

function missingError() {
  const error = new Error('relation "alert_email_prefs" does not exist') as Error & { code: string };
  error.code = '42P01';
  return error;
}

function sqlOf(value: unknown): string {
  return String(value).replace(/\s+/g, ' ');
}

async function query(sql: unknown, params: unknown[] = []) {
  if (state.missing) throw missingError();
  const text = sqlOf(sql);
  if (text.includes('FROM alert_email_suppressions')) {
    const email = String(params[0]);
    return state.suppressed.has(email) ? [{ email }] : [];
  }
  if (text.includes('INSERT INTO alert_email_suppressions')) {
    state.suppressed.set(String(params[0]), String(params[1]));
    return [];
  }
  if (text.includes('FROM alert_email_prefs')) {
    return state.mode ? [{ mode: state.mode }] : [];
  }
  if (text.includes('INSERT INTO alert_email_prefs')) {
    state.mode = String(params[1]);
    return [];
  }
  if (text.includes('FROM alert_email_daily_counts')) {
    const count = state.counts.get(`${params[0]}|${params[1]}`) ?? 0;
    return count ? [{ sent_count: count }] : [];
  }
  if (text.includes('INSERT INTO alert_email_daily_counts')) {
    const key = `${params[0]}|${params[1]}`;
    const cap = Number(params[2]);
    const current = state.counts.get(key) ?? 0;
    if (current >= cap) return [];
    state.counts.set(key, current + 1);
    return [{ sent_count: current + 1 }];
  }
  if (text.includes('GREATEST(sent_count')) {
    const key = `${params[0]}|${params[1]}`;
    state.counts.set(key, Math.max((state.counts.get(key) ?? 1) - 1, 0));
    return [];
  }
  if (text.includes('INSERT INTO alert_email_digest_items')) {
    state.digest.push({
      id: state.nextId++,
      workspace: String(params[0]),
      email: String(params[1]),
      day: String(params[2]),
      subject: String(params[3]),
      line: String(params[4]),
      sent: false,
    });
    return [];
  }
  if (text.includes('UPDATE alert_email_digest_items') && text.includes('sent_at = NOW()')) {
    return state.digest
      .filter((item) => !item.sent && item.day < String(params[0]))
      .map((item) => {
        item.sent = true;
        return { id: String(item.id), workspace_id: item.workspace, email: item.email, sydney_day: item.day, line: item.line };
      });
  }
  if (text.includes('UPDATE alert_email_digest_items') && text.includes('sent_at = NULL')) {
    const ids = new Set((params[0] as string[]).map(String));
    for (const item of state.digest) if (ids.has(String(item.id))) item.sent = false;
    return [];
  }
  throw new Error(`unexpected sql: ${text}`);
}

mocks.q.mockImplementation(query);

function resetState() {
  state.mode = null;
  state.suppressed.clear();
  state.counts.clear();
  state.digest = [];
  state.missing = false;
  state.nextId = 1;
  resetAlertEmailSchemaWarning();
}

function alert(n: number) {
  return deliverUserAlertEmail({
    workspaceId: 'ws-1',
    to: 'Person@Example.test',
    subject: `Alert ${n}`,
    html: `<p>Alert ${n}</p>`,
    line: `BTC alert ${n}`,
  });
}

function webhookSecret() {
  return `whsec_${Buffer.from('resend-webhook-test-secret-key').toString('base64')}`;
}

function signWebhook(payload: string, secret: string) {
  const id = 'msg_test_1';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const key = Buffer.from(secret.slice('whsec_'.length), 'base64');
  const sig = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64');
  return { id, timestamp, signature: `v1,${sig}` };
}

describe('alert email controls', () => {
  beforeEach(() => {
    resetState();
    mocks.q.mockImplementation(query);
    mocks.send.mockReset();
    mocks.send.mockResolvedValue('email_123');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T02:00:00.000Z'));
    vi.stubEnv('DATABASE_URL', 'postgres://user:pass@127.0.0.1:5432/msp');
    vi.stubEnv('APP_SIGNING_SECRET', 'test-signing-secret');
    vi.stubEnv('ALERT_EMAIL_DAILY_CAP', '3');
    vi.stubEnv('ALERTS_FROM_EMAIL', '');
    vi.stubEnv('CRON_SECRET', 'cron-test');
    vi.stubEnv('RESEND_WEBHOOK_SECRET', '');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('sends the first three immediate alerts and queues the fourth for the digest', async () => {
    state.mode = 'each';
    const results = [];
    for (let n = 1; n <= 4; n += 1) results.push(await alert(n));
    expect(results.slice(0, 3).map((row) => row.action)).toEqual(['sent', 'sent', 'sent']);
    expect(results[3]).toMatchObject({ action: 'queued', reason: 'cap' });
    expect(mocks.send).toHaveBeenCalledTimes(3);
    expect(state.digest).toHaveLength(1);
    expect(state.digest[0].line).toBe('BTC alert 4');
    expect(planUserAlertEmail({ mode: 'each', suppressed: false, sentToday: 3, cap: 3 })).toEqual({ action: 'queue', reason: 'cap' });
  });

  it('uses the daily digest when a user has no stored preference', async () => {
    expect(resolveAlertEmailMode(null)).toBe('digest');
    expect(resolveAlertEmailMode(undefined)).toBe('digest');
    const result = await alert(1);
    expect(result).toMatchObject({ action: 'queued', reason: 'digest' });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(state.digest).toHaveLength(1);
  });

  it('puts List-Unsubscribe headers on an immediate alert and on the digest', async () => {
    state.mode = 'each';
    await alert(1);
    const sent = mocks.send.mock.calls[0][0] as { headers: Record<string, string>; html: string; text: string };
    const token = signAlertUnsubscribeToken('ws-1');
    expect(sent.headers).toEqual(listUnsubscribeHeaders(token));
    expect(sent.headers['List-Unsubscribe']).toBe(
      `<${alertUnsubscribeUrl(token)}>, <mailto:unsubscribe@marketscannerpros.app?subject=unsubscribe>`,
    );
    expect(sent.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(sent.html).toContain(alertUnsubscribeUrl(token));
    expect(sent.text).toContain(`Unsubscribe from alert emails: ${alertUnsubscribeUrl(token)}`);

    state.digest.push({
      id: 99,
      workspace: 'ws-1',
      email: 'person@example.test',
      day: '2026-10-04',
      subject: 'Alert 9',
      line: 'ETH crossed the level you saved',
      sent: false,
    });
    const summary = await sendDueAlertDigests();
    expect(summary.sent).toBe(1);
    const digest = mocks.send.mock.calls.at(-1)?.[0] as { headers: Record<string, string>; html: string; text: string; subject: string };
    expect(digest.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(digest.headers['List-Unsubscribe']).toContain('mailto:unsubscribe@marketscannerpros.app?subject=unsubscribe');
    expect(digest.html).toContain('ETH crossed the level you saved');
    expect(digest.html).toContain('Unsubscribe from alert emails');
    expect(digest.text).toContain('Unsubscribe from alert emails:');
    expect(digest.subject).toContain('alert summary');
  });

  it('signs and verifies an alerts-list token', () => {
    const token = signAlertUnsubscribeToken('user-7', 'test-signing-secret');
    expect(verifyAlertUnsubscribeToken(token, 'test-signing-secret')).toEqual({ userId: 'user-7' });
    expect(verifyAlertUnsubscribeToken(`${token}x`, 'test-signing-secret')).toBeNull();
    const other = signAlertUnsubscribeToken('user-8', 'other-secret');
    expect(verifyAlertUnsubscribeToken(other, 'test-signing-secret')).toBeNull();
    const payload = Buffer.from(JSON.stringify({ uid: 'user-7', list: 'news' }), 'utf8').toString('base64url');
    const sig = createHmac('sha256', 'test-signing-secret').update('user-7|news').digest('base64url');
    expect(verifyAlertUnsubscribeToken(`${payload}.${sig}`, 'test-signing-secret')).toBeNull();
  });

  it('POST unsubscribe turns alert mail off without a login', async () => {
    const token = signAlertUnsubscribeToken('ws-9');
    const res = await unsubscribePOST(new NextRequest(`https://marketscannerpros.app/api/email/unsubscribe?t=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'List-Unsubscribe=One-Click',
    }));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Unsubscribed');
    expect(state.mode).toBe('off');
    const after = await deliverUserAlertEmail({
      workspaceId: 'ws-9',
      to: 'person@example.test',
      subject: 'Later',
      html: '<p>Later</p>',
      line: 'Later',
    });
    expect(after).toMatchObject({ action: 'skipped', reason: 'off' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('shows a confirm page for GET and does not unsubscribe until POST', async () => {
    const token = signAlertUnsubscribeToken('ws-3');
    const res = await unsubscribeGET(new NextRequest(`https://marketscannerpros.app/api/email/unsubscribe?t=${encodeURIComponent(token)}`));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Unsubscribe from alert emails');
    expect(html).toContain('does not stop sign-in emails');
    expect(html).toContain(encodeURIComponent(token));
    expect(html).toContain('<button');
    expect(state.mode).toBeNull();
    const invalid = await unsubscribeGET(new NextRequest('https://marketscannerpros.app/api/email/unsubscribe?t=nope'));
    expect(invalid.status).toBe(200);
    expect(await invalid.text()).toContain('not valid');
  });

  it('skips alert and digest mail for a suppressed address', async () => {
    state.mode = 'each';
    state.suppressed.set('person@example.test', 'complained');
    const result = await alert(1);
    expect(result).toMatchObject({ action: 'skipped', reason: 'suppressed' });
    expect(mocks.send).not.toHaveBeenCalled();
    state.digest.push({
      id: 7,
      workspace: 'ws-1',
      email: 'person@example.test',
      day: '2026-10-04',
      subject: 'Old',
      line: 'Old alert',
      sent: false,
    });
    const summary = await sendDueAlertDigests();
    expect(summary).toMatchObject({ sent: 0, skipped: 1 });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('records complained and hard-bounced addresses from the Resend webhook', async () => {
    const secret = webhookSecret();
    vi.stubEnv('RESEND_WEBHOOK_SECRET', secret);
    const complained = JSON.stringify({
      type: 'email.complained',
      data: { email_id: 'email_c', to: ['Person@Yahoo.com.au'] },
    });
    const signedComplaint = signWebhook(complained, secret);
    const complaintRes = await resendWebhookPOST(new NextRequest('https://marketscannerpros.app/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': signedComplaint.id,
        'svix-timestamp': signedComplaint.timestamp,
        'svix-signature': signedComplaint.signature,
      },
      body: complained,
    }));
    expect(complaintRes.status).toBe(200);
    expect(state.suppressed.get('person@yahoo.com.au')).toBe('complained');

    const bounced = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'email_b', to: ['hard@example.test'], bounce: { type: 'Permanent', message: '550 user unknown' } },
    });
    const signedBounce = signWebhook(bounced, secret);
    const bounceRes = await resendWebhookPOST(new NextRequest('https://marketscannerpros.app/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': signedBounce.id,
        'svix-timestamp': signedBounce.timestamp,
        'svix-signature': signedBounce.signature,
      },
      body: bounced,
    }));
    expect(bounceRes.status).toBe(200);
    expect(state.suppressed.get('hard@example.test')).toBe('bounced');

    const soft = JSON.stringify({
      type: 'email.bounced',
      data: { email_id: 'email_s', to: ['soft@example.test'], bounce: { type: 'Temporary', message: 'mailbox full' } },
    });
    const signedSoft = signWebhook(soft, secret);
    await resendWebhookPOST(new NextRequest('https://marketscannerpros.app/api/webhooks/resend', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': signedSoft.id,
        'svix-timestamp': signedSoft.timestamp,
        'svix-signature': signedSoft.signature,
      },
      body: soft,
    }));
    expect(state.suppressed.has('soft@example.test')).toBe(false);
  });

  it('marks a provider-suppressed recipient and does not send', async () => {
    state.mode = 'each';
    mocks.send.mockRejectedValueOnce(new Error('The email address has been suppressed'));
    const result = await alert(1);
    expect(result).toMatchObject({ action: 'skipped', reason: 'provider-suppressed' });
    expect(state.suppressed.get('person@example.test')).toBe('provider');
    expect(state.counts.get('ws-1|2026-10-05') ?? 0).toBe(0);
    await noteProviderSuppression('other@example.test', 'suppressed by provider');
    expect(state.suppressed.get('other@example.test')).toBe('provider');
  });

  it('fails safe when the new tables are missing and warns once', async () => {
    state.missing = true;
    state.mode = 'each';
    const first = await alert(1);
    const second = await alert(2);
    expect(first).toMatchObject({ action: 'skipped', reason: 'schema' });
    expect(second).toMatchObject({ action: 'skipped', reason: 'schema' });
    expect(mocks.send).not.toHaveBeenCalled();
    const warnings = vi.mocked(console.warn).mock.calls.map((args) => args.join(' '));
    expect(warnings.filter((line) => line.includes('[alert-email] storage is not ready'))).toHaveLength(1);
    const res = await digestPOST(new NextRequest('https://marketscannerpros.app/api/jobs/email-alert-digest', {
      method: 'POST',
      headers: { 'x-cron-secret': 'cron-test' },
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, reason: 'schema' });
    const denied = await digestPOST(new NextRequest('https://marketscannerpros.app/api/jobs/email-alert-digest', { method: 'POST' }));
    expect(denied.status).toBe(403);
  });
});
