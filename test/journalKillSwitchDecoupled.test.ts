/**
 * Owner decision (admin audit M6): the admin kill switch must not stop anyone using their Journal. With the workspace
 * kill switch ON and no acknowledgement, add-trade still saves the entry; the route no longer reads the switch.
 */
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = vi.hoisted(() => ({ count: 0, ks: vi.fn(async () => ({ enabled: true, reason: 'admin test', setAt: '2026-10-09T00:00:00Z' })) }));
vi.mock('@/lib/auth', () => ({ getSessionFromCookie: async () => ({ workspaceId: 'ws-journal', tier: 'pro', cid: 'cus_user' }) }));
vi.mock('@/lib/entitlements', () => ({ getEffectiveTier: async () => 'pro' }));
vi.mock('@/lib/universe/personalUniverse', () => ({ getKillSwitchState: state.ks, isKillSwitchOn: async () => true }));
vi.mock('@/lib/db', () => ({
  atomicQueries: async (work: () => Promise<unknown>) => work(),
  q: async (sql: string) => (sql.includes('INSERT INTO journal_entries') ? [{ id: ++state.count }] : sql.includes('COUNT(*)') ? [{ count: '0' }] : []),
}));

import { POST } from '@/app/api/journal/add-trade/route';

it('saves a Journal trade while the admin kill switch is on, without any acknowledgement', async () => {
  const res = await POST(new NextRequest('https://example.test/api/journal/add-trade', {
    method: 'POST',
    body: JSON.stringify({ symbol: 'AAPL', side: 'LONG', entryPrice: 100, quantity: 1, tradeType: 'Spot', tradeDate: '2026-10-09' }),
  }));
  expect(res.status).toBe(201);
  expect(JSON.stringify(await res.json())).not.toContain('kill_switch_active');
  expect(state.ks).not.toHaveBeenCalled();
});

it('the Journal route does not read the admin kill switch', () => {
  const src = readFileSync('app/api/journal/add-trade/route.ts', 'utf8');
  expect(src).not.toMatch(/getKillSwitchState|isKillSwitchOn|killSwitchAck/);
});
