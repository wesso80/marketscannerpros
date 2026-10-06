/**
 * Admin extend/revoke moves user_subscriptions.current_period_end in the same
 * transaction as user_trials. A former subscriber is included when their period
 * end still equals the locked admin-trial expiry. A live Stripe trial, whose
 * end is different, is not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: true, workspaceId: 'admin' })) }));

import { DELETE, POST } from '../app/api/admin/trials/route';

const EMAIL = 'ada@example.com';
const PREVIOUS = '2026-08-01T00:00:00.000Z';
const NEW_END = '2026-12-01T00:00:00.000Z';
const REVOKE_AT = '2026-10-06T10:00:00.000Z';
const STRIPE_END = '2026-11-15T00:00:00.000Z';
const PAST_END = '2026-03-01T00:00:00.000Z';

type SubRow = {
  email: string;
  status: string;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  tier: string;
};

const query = vi.fn();
const release = vi.fn();
const previousPool = global.__pgPool;

function request(method: 'POST' | 'DELETE', body: unknown) {
  return new NextRequest('http://localhost/api/admin/trials', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function sqlOf(calls: unknown[][], includes: string): { sql: string; params: unknown[] } {
  const found = calls.find(([sql]) => String(sql).includes(includes));
  expect(found, includes).toBeTruthy();
  return { sql: String(found![0]), params: (found![1] as unknown[]) ?? [] };
}

/** Extra digits past milliseconds. JavaScript Date drops them, Postgres does not. */
function hasSubMillisecondDigits(value: string): boolean {
  const fraction = /\.(\d+)/.exec(value)?.[1] ?? '';
  return fraction.length > 3;
}

function truncatedMillis(value: string): number {
  const match = /^(.*\.)(\d+)(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match) return Date.parse(value);
  return Date.parse(`${match[1]}${match[2].slice(0, 3).padEnd(3, '0')}${match[3]}`);
}

/** Mirrors SYNC_ADMIN_TRIAL_PERIOD_END. The SQL text is asserted by the caller. */
function applyAdminSync(rows: SubRow[], sql: string, params: unknown[]): SubRow[] {
  expect(sql).toContain("status = 'trialing'");
  expect(sql).toContain('stripe_subscription_id IS NULL');
  const compact = sql.replace(/\s+/g, ' ');
  const truncatesMillis = compact.includes("date_trunc('milliseconds', current_period_end)")
    && compact.includes("date_trunc('milliseconds', unnest($3::text[])::timestamptz AT TIME ZONE 'UTC')");
  expect(truncatesMillis).toBe(true);
  const email = String(params[0]).toLowerCase();
  const periodEnd = String(params[1]);
  const previous = (params[2] as string[]).map((value) => Date.parse(value));
  return rows.map((row) => {
    const sameEmail = row.email.toLowerCase() === email;
    const trialing = row.status === 'trialing';
    const noStripe = row.stripe_subscription_id == null;
    const sameAdminEnd = row.current_period_end != null && previous.some((ms) => {
      if (!truncatesMillis && hasSubMillisecondDigits(row.current_period_end!)) return false;
      return ms === truncatedMillis(row.current_period_end!);
    });
    const match = sameEmail && trialing && (noStripe || sameAdminEnd);
    return match ? { ...row, current_period_end: periodEnd } : row;
  });
}

function applyExpiredSync(rows: SubRow[], sql: string, params: unknown[], nowMs: number): SubRow[] {
  expect(sql).toContain("status = 'trialing'");
  expect(sql).toContain("(current_period_end AT TIME ZONE 'UTC') < NOW()");
  expect(sql).not.toContain('stripe_subscription_id IS NULL');
  const email = String(params[0]).toLowerCase();
  const periodEnd = String(params[1]);
  return rows.map((row) => {
    const past = row.current_period_end != null && Date.parse(row.current_period_end) < nowMs;
    const match = row.email.toLowerCase() === email && row.status === 'trialing' && past;
    return match ? { ...row, current_period_end: periodEnd } : row;
  });
}

beforeEach(() => {
  query.mockReset();
  release.mockReset();
  global.__pgPool = { connect: async () => ({ query, release }) } as never;
});

afterEach(() => {
  global.__pgPool = previousPool;
});

describe('admin trial extend and revoke', () => {
  it('extend locks the previous expiry and writes the new end in one transaction', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FOR UPDATE')) return { rows: [{ expires_at: PREVIOUS }] };
      if (sql.includes('UPDATE user_trials')) return { rows: [{ email: EMAIL, tier: 'pro_trader', expires_at: NEW_END }] };
      if (sql.includes('SELECT id, expires_at')) return { rows: [{ id: 1, expires_at: PREVIOUS }] };
      return { rows: [] };
    });

    const res = await POST(request('POST', { email: ` ${EMAIL.toUpperCase()} `, days: 14 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, trial: { expires_at: NEW_END } });

    const calls = query.mock.calls;
    const begin = calls.findIndex(([sql]) => sql === 'BEGIN');
    const commit = calls.findIndex(([sql]) => sql === 'COMMIT');
    const lock = calls.findIndex(([sql]) => String(sql).includes('FOR UPDATE'));
    const trial = calls.findIndex(([sql]) => String(sql).includes('UPDATE user_trials'));
    const sub = calls.findIndex(([sql]) => String(sql).includes('UPDATE user_subscriptions'));
    expect(begin).toBeGreaterThan(-1);
    expect(lock).toBeGreaterThan(begin);
    expect(trial).toBeGreaterThan(lock);
    expect(sub).toBeGreaterThan(trial);
    expect(commit).toBeGreaterThan(sub);
    expect(calls.some(([sql]) => sql === 'ROLLBACK')).toBe(false);

    const sync = sqlOf(calls, 'UPDATE user_subscriptions');
    expect(sync.params).toEqual([EMAIL, NEW_END, [PREVIOUS]]);
    const rows: SubRow[] = [
      { email: EMAIL, status: 'trialing', stripe_subscription_id: null, current_period_end: '2026-07-01T00:00:00.000Z', tier: 'pro' },
    ];
    expect(applyAdminSync(rows, sync.sql, sync.params)[0].current_period_end).toBe(NEW_END);
  });

  it('revoke sets current_period_end to the revoke time in the same transaction', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FOR UPDATE')) return { rows: [{ expires_at: PREVIOUS }] };
      if (sql.includes('UPDATE user_trials')) return { rows: [{ email: EMAIL, expires_at: REVOKE_AT }] };
      return { rows: [] };
    });

    const res = await DELETE(request('DELETE', { email: EMAIL }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, message: 'Trial revoked' });

    const calls = query.mock.calls;
    expect(calls[0][0]).toBe('BEGIN');
    expect(calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
    const sync = sqlOf(calls, 'UPDATE user_subscriptions');
    expect(sync.params).toEqual([EMAIL, REVOKE_AT, [PREVIOUS]]);
    expect(String(sqlOf(calls, 'UPDATE user_trials').sql)).toContain('expires_at = NOW()');
  });

  it('extend syncs a former subscriber and leaves a live Stripe trial alone', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FOR UPDATE')) return { rows: [{ expires_at: PREVIOUS }] };
      if (sql.includes('UPDATE user_trials')) return { rows: [{ expires_at: NEW_END }] };
      if (sql.includes('SELECT id, expires_at')) return { rows: [{ id: 1, expires_at: PREVIOUS }] };
      return { rows: [] };
    });

    await POST(request('POST', { email: EMAIL, days: 30 }));
    const sync = sqlOf(query.mock.calls, 'UPDATE user_subscriptions');
    const before: SubRow[] = [
      { email: EMAIL, status: 'trialing', stripe_subscription_id: 'sub_old', current_period_end: PREVIOUS, tier: 'pro_trader' },
      { email: EMAIL, status: 'trialing', stripe_subscription_id: 'sub_live', current_period_end: STRIPE_END, tier: 'pro_trader' },
      { email: EMAIL, status: 'active', stripe_subscription_id: null, current_period_end: null, tier: 'pro_trader' },
      { email: 'other@example.com', status: 'trialing', stripe_subscription_id: 'sub_old', current_period_end: PREVIOUS, tier: 'pro' },
    ];
    const after = applyAdminSync(before, sync.sql, sync.params);

    expect(after[0].current_period_end).toBe(NEW_END);
    expect(after[1]).toEqual(before[1]);
    expect(after[2]).toEqual(before[2]);
    expect(after[3]).toEqual(before[3]);
  });

  it('extend matches a former subscriber whose period end has microseconds', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FOR UPDATE')) return { rows: [{ expires_at: PREVIOUS }] };
      if (sql.includes('UPDATE user_trials')) return { rows: [{ expires_at: NEW_END }] };
      if (sql.includes('SELECT id, expires_at')) return { rows: [{ id: 1, expires_at: PREVIOUS }] };
      return { rows: [] };
    });

    await POST(request('POST', { email: EMAIL, days: 30 }));
    const sync = sqlOf(query.mock.calls, 'UPDATE user_subscriptions');
    const microEnd = '2026-08-01T00:00:00.000456Z';
    const nextMillisecond = '2026-08-01T00:00:00.001Z';
    const before: SubRow[] = [
      { email: EMAIL, status: 'trialing', stripe_subscription_id: 'sub_old', current_period_end: microEnd, tier: 'pro_trader' },
      { email: EMAIL, status: 'trialing', stripe_subscription_id: 'sub_off', current_period_end: nextMillisecond, tier: 'pro_trader' },
    ];
    const after = applyAdminSync(before, sync.sql, sync.params);

    expect(after[0].current_period_end).toBe(NEW_END);
    expect(after[1]).toEqual(before[1]);
  });

  it('revoke syncs a former subscriber and leaves a live Stripe trial alone', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FOR UPDATE')) return { rows: [{ expires_at: PREVIOUS }] };
      if (sql.includes('UPDATE user_trials')) return { rows: [{ expires_at: REVOKE_AT }] };
      return { rows: [] };
    });

    await DELETE(request('DELETE', { email: EMAIL }));
    const sync = sqlOf(query.mock.calls, 'UPDATE user_subscriptions');
    const before: SubRow[] = [
      { email: EMAIL, status: 'trialing', stripe_subscription_id: 'sub_old', current_period_end: PREVIOUS, tier: 'pro_trader' },
      { email: EMAIL, status: 'trialing', stripe_subscription_id: 'sub_live', current_period_end: STRIPE_END, tier: 'pro_trader' },
    ];
    const after = applyAdminSync(before, sync.sql, sync.params);

    expect(after[0].current_period_end).toBe(REVOKE_AT);
    expect(after[1]).toEqual(before[1]);
  });

  it('a new grant advances a trialing row whose period end is already past', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('INSERT INTO user_trials')) return { rows: [{ email: EMAIL, expires_at: NEW_END }] };
      if (sql.includes('SELECT id, expires_at')) return { rows: [] };
      return { rows: [] };
    });

    const res = await POST(request('POST', { email: EMAIL, days: 14 }));
    expect(res.status).toBe(200);
    const calls = query.mock.calls;
    const begin = calls.findIndex(([sql]) => sql === 'BEGIN');
    const insert = calls.findIndex(([sql]) => String(sql).includes('INSERT INTO user_trials'));
    const sub = calls.findIndex(([sql]) => String(sql).includes('UPDATE user_subscriptions'));
    const commit = calls.findIndex(([sql]) => sql === 'COMMIT');
    expect(begin).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(begin);
    expect(sub).toBeGreaterThan(insert);
    expect(commit).toBeGreaterThan(sub);

    const sync = sqlOf(calls, 'UPDATE user_subscriptions');
    expect(sync.params).toEqual([EMAIL, NEW_END]);
    const nowMs = Date.parse('2026-10-06T00:00:00.000Z');
    const before: SubRow[] = [
      { email: EMAIL, status: 'trialing', stripe_subscription_id: 'sub_old', current_period_end: PAST_END, tier: 'pro_trader' },
      { email: EMAIL, status: 'trialing', stripe_subscription_id: 'sub_live', current_period_end: STRIPE_END, tier: 'pro_trader' },
      { email: EMAIL, status: 'active', stripe_subscription_id: null, current_period_end: null, tier: 'pro_trader' },
    ];
    const after = applyExpiredSync(before, sync.sql, sync.params, nowMs);
    expect(after[0].current_period_end).toBe(NEW_END);
    expect(after[1]).toEqual(before[1]);
    expect(after[2]).toEqual(before[2]);
  });

  it('a new grant still succeeds when there is no subscription row to update', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('INSERT INTO user_trials')) return { rows: [{ email: EMAIL, expires_at: NEW_END }] };
      if (sql.includes('SELECT id, expires_at')) return { rows: [] };
      if (sql.includes('UPDATE user_subscriptions')) return { rows: [] };
      return { rows: [] };
    });

    const res = await POST(request('POST', { email: EMAIL, days: 7 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, trial: { expires_at: NEW_END } });
    expect(query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(true);
    expect(query.mock.calls.some(([sql]) => sql === 'ROLLBACK')).toBe(false);
  });

  it('rolls the transaction back and returns 500 when the subscription update fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    query.mockImplementation(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('FOR UPDATE')) return { rows: [{ expires_at: PREVIOUS }] };
      if (sql.includes('UPDATE user_trials')) return { rows: [{ expires_at: NEW_END }] };
      if (sql.includes('SELECT id, expires_at')) return { rows: [{ id: 1, expires_at: PREVIOUS }] };
      if (sql.includes('UPDATE user_subscriptions')) throw new Error('db failed');
      return { rows: [] };
    });

    const res = await POST(request('POST', { email: EMAIL, days: 14 }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to grant trial' });

    const statements = query.mock.calls.map(([sql]) => String(sql));
    const begin = statements.indexOf('BEGIN');
    const rollback = statements.indexOf('ROLLBACK');
    expect(begin).toBeGreaterThan(-1);
    expect(rollback).toBeGreaterThan(begin);
    expect(statements).not.toContain('COMMIT');
    expect(statements.some((sql) => sql.includes('UPDATE user_trials'))).toBe(true);
    expect(release).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
