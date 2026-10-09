import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ q: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws-1' }) }));

import { clearRelationCache } from '@/lib/schema/relationReady';
import { getPersonalProfile } from '@/lib/doctrine/stats';
import { POST as recordOutcome } from '@/app/api/doctrine/outcome/route';

describe('doctrine_outcomes missing relation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRelationCache();
  });

  it('returns an empty profile and does not SELECT the missing table', async () => {
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ ok: null }];
      throw new Error(`unexpected query: ${sql}`);
    });
    const profile = await getPersonalProfile('ws-1');
    expect(profile.totalTrades).toBe(0);
    expect(profile.doctrineStats).toEqual([]);
    expect(mocks.q.mock.calls.some(([sql]) => String(sql).includes('FROM doctrine_outcomes'))).toBe(false);
    expect(mocks.q.mock.calls.some(([sql]) => String(sql).includes('to_regclass'))).toBe(true);
  });

  it('does not INSERT when the table is missing', async () => {
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('to_regclass')) return [{ ok: null }];
      throw new Error(`unexpected query: ${sql}`);
    });
    const res = await recordOutcome(new NextRequest('https://example.test/api/doctrine/outcome', {
      method: 'POST',
      body: JSON.stringify({
        symbol: 'AAPL',
        doctrineId: 'compression_breakout',
        side: 'long',
        outcome: 'win',
        entryPrice: 10,
        exitPrice: 12,
        entryDate: '2026-10-01',
        exitDate: '2026-10-02',
      }),
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: false, unavailable: true });
    expect(mocks.q.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO doctrine_outcomes'))).toBe(false);
  });
});
