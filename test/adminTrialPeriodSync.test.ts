/**
 * Admin extend/revoke must move user_subscriptions.current_period_end in the
 * same transaction as user_trials. Stripe-backed rows are not part of that update.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const q = vi.hoisted(() => vi.fn());
const clientQuery = vi.hoisted(() => vi.fn());
const tx = vi.hoisted(() => vi.fn(async (work: (client: { query: typeof clientQuery }) => Promise<unknown>) => work({ query: clientQuery })));

vi.mock('@/lib/adminAuth', () => ({ requireAdmin: vi.fn(async () => ({ ok: true, workspaceId: 'admin' })) }));
vi.mock('@/lib/db', () => ({ q, tx }));

import { DELETE, POST } from '../app/api/admin/trials/route';

const EMAIL = 'ada@example.com';
const NEW_END = '2026-12-01T00:00:00.000Z';
const REVOKE_AT = '2026-10-06T10:00:00.000Z';

type SubRow = {
  email: string;
  status: string;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  tier: string;
};

function request(method: 'POST' | 'DELETE', body: unknown) {
  return new NextRequest('http://localhost/api/admin/trials', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/** Apply the sync statement the route actually sent. The WHERE text is part of the assertion. */
function applyPeriodSync(rows: SubRow[], sql: string, params: unknown[]): SubRow[] {
  expect(sql).toContain('current_period_end = $2');
  expect(sql).toContain('LOWER(email) = LOWER($1)');
  expect(sql).toContain("status = 'trialing'");
  expect(sql).toContain('stripe_subscription_id IS NULL');
  const email = String(params[0]).toLowerCase();
  const periodEnd = String(params[1]);
  return rows.map((row) => {
    const match = row.email.toLowerCase() === email
      && row.status === 'trialing'
      && row.stripe_subscription_id == null;
    return match ? { ...row, current_period_end: periodEnd } : row;
  });
}

beforeEach(() => {
  q.mockReset();
  clientQuery.mockReset();
  tx.mockClear();
});

describe('admin trial extend and revoke', () => {
  it('extend writes the new expires_at onto the trialing subscription in the same transaction', async () => {
    q.mockResolvedValue([{ id: 1, expires_at: '2026-10-01T00:00:00.000Z' }]);
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE user_trials')) {
        return { rows: [{ email: EMAIL, tier: 'pro_trader', expires_at: NEW_END }] };
      }
      return { rows: [] };
    });

    const res = await POST(request('POST', { email: ` ${EMAIL.toUpperCase()} `, days: 14 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, trial: { expires_at: NEW_END } });

    expect(tx).toHaveBeenCalledOnce();
    expect(clientQuery).toHaveBeenCalledTimes(2);
    const [trialSql, trialParams] = clientQuery.mock.calls[0];
    const [subSql, subParams] = clientQuery.mock.calls[1];
    expect(trialSql).toContain('UPDATE user_trials');
    expect(trialParams[0]).toBe(EMAIL);
    expect(subParams).toEqual([EMAIL, NEW_END]);

    const rows: SubRow[] = [
      { email: EMAIL, status: 'trialing', stripe_subscription_id: null, current_period_end: '2026-10-01T00:00:00.000Z', tier: 'pro_trader' },
    ];
    expect(applyPeriodSync(rows, subSql, subParams)[0].current_period_end).toBe(NEW_END);
  });

  it('revoke sets current_period_end to the revoke time in the same transaction', async () => {
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE user_trials')) {
        return { rows: [{ email: EMAIL, expires_at: REVOKE_AT }] };
      }
      return { rows: [] };
    });

    const res = await DELETE(request('DELETE', { email: EMAIL }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, message: 'Trial revoked' });

    expect(tx).toHaveBeenCalledOnce();
    expect(q).not.toHaveBeenCalled();
    const [trialSql] = clientQuery.mock.calls[0];
    const [subSql, subParams] = clientQuery.mock.calls[1];
    expect(trialSql).toContain('expires_at = NOW()');
    expect(subParams).toEqual([EMAIL, REVOKE_AT]);
    expect(subSql).toContain('user_subscriptions');
  });

  it('does not move a Stripe-backed row, or an active manual grant, when a trial is extended', async () => {
    q.mockResolvedValue([{ id: 1 }]);
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('UPDATE user_trials')) return { rows: [{ expires_at: NEW_END }] };
      return { rows: [] };
    });

    await POST(request('POST', { email: EMAIL, days: 30 }));
    const [subSql, subParams] = clientQuery.mock.calls[1];

    const before: SubRow[] = [
      { email: EMAIL, status: 'trialing', stripe_subscription_id: null, current_period_end: '2026-08-01T00:00:00.000Z', tier: 'pro' },
      { email: EMAIL, status: 'trialing', stripe_subscription_id: 'sub_live', current_period_end: '2026-11-01T00:00:00.000Z', tier: 'pro_trader' },
      { email: EMAIL, status: 'active', stripe_subscription_id: null, current_period_end: null, tier: 'pro_trader' },
      { email: 'other@example.com', status: 'trialing', stripe_subscription_id: null, current_period_end: '2026-09-01T00:00:00.000Z', tier: 'pro' },
    ];
    const after = applyPeriodSync(before, subSql, subParams);

    expect(after[0].current_period_end).toBe(NEW_END);
    expect(after[1]).toEqual(before[1]);
    expect(after[2]).toEqual(before[2]);
    expect(after[3]).toEqual(before[3]);
  });
});
