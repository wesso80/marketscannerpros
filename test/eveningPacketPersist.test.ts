import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ q: vi.fn(), notify: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: mocks.q }));
vi.mock('@/lib/adminAuth', () => ({ requireAdmin: async () => ({ ok: false }) }));
vi.mock('@/lib/eveningPacket/builder', () => ({
  buildEveningPacket: async () => ({ surfacedToday: [], invalidatedToday: [], warnings: [] }),
}));
vi.mock('@/lib/admin/edgePacketSnapshots', () => ({ pruneEdgePackets: async () => 0 }));
vi.mock('@/lib/admin/equityNewsJev', () => ({ runNewsJevDaily: async () => null }));
vi.mock('@/lib/admin/notifyAdmin', () => ({ notifyAdmin: mocks.notify }));

import { POST } from '@/app/api/cron/evening-packet/route';

describe('evening packet persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'cron-test-secret';
    mocks.notify.mockResolvedValue(undefined);
  });

  it('logs an evening_packets insert error instead of swallowing it', async () => {
    const dbError = new Error('relation "evening_packets" does not exist');
    mocks.q.mockImplementation(async (sql: string) => {
      if (sql.includes('edge_ledger_setups')) return [{ workspace_id: 'ws-1' }];
      if (sql.includes('INSERT INTO evening_packets')) throw dbError;
      return [];
    });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await POST(new NextRequest('https://example.test/api/cron/evening-packet', {
        method: 'POST',
        headers: { 'x-cron-secret': 'cron-test-secret' },
      }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.processed).toBe(1);
      expect(body.summaries[0]).toMatchObject({ workspaceId: 'ws-1', persisted: false, ok: true });
      expect(err.mock.calls.some((call) => String(call[0]).includes('[evening-packet] failed to insert evening_packets for ws-1') && call[1] === dbError)).toBe(true);
    } finally {
      err.mockRestore();
    }
  });
});
