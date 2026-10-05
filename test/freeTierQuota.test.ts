import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const counts = vi.hoisted(() => new Map<string, number>());
vi.mock('@/lib/db', () => ({ q: vi.fn(async (sql: string, args: unknown[]) => {
  const key = `${args[0]}:${args[1]}`;
  const n = counts.get(key) ?? 0;
  if (sql.startsWith('SELECT')) return [{ scan_count: n }];
  if (n >= Number(args[2])) return [];
  counts.set(key, n + 1); return [{ scan_count: n + 1 }];
}) }));
vi.mock('@/lib/rateLimit', () => ({ getClientIP: () => '127.0.0.1' }));
import { isFirstEverScan, quotaKey, quotaDay, reserveScan, readScanQuota } from '@/lib/free/scanQuota';
import { FREE_DAILY_SCAN_LIMIT } from '@/lib/free/limits';
const req = (id?: string) => new NextRequest('https://example.test/api/scanner/run', { headers: id ? { cookie: `msp_scan_visitor=${id}` } : {} });
beforeEach(() => counts.clear());
describe('free scan allowance', () => {
  it('uses workspace identity ahead of visitor identity', () => expect(quotaKey(req(), 'workspace-1')).toBe('workspace-1'));
  it('gives two visitors independent allowances and blocks the sixth reservation', async () => {
    for (const id of ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']) {
      const key = quotaKey(req(id));
      for (let n = 1; n <= FREE_DAILY_SCAN_LIMIT; n++) expect(await reserveScan(key)).toBe(n);
      expect(await reserveScan(key)).toBeNull();
    }
  });
  it('reads never spend scans', async () => {
    for (let i = 0; i < 10; i++) expect((await readScanQuota('x')).used).toBe(0);
    await reserveScan('x'); expect((await readScanQuota('x')).used).toBe(1);
  });
  it('cookie-blocked requests share a stable hashed IP, without raw IP storage', () => {
    expect(quotaKey(req())).toBe(quotaKey(req())); expect(quotaKey(req())).not.toContain('127.0.0.1');
  });
  it('counts only the reservation that creates the first stored scan', () => {
    expect(isFirstEverScan(1, 0)).toBe(true);
    expect(isFirstEverScan(1, 2)).toBe(false);
    expect(isFirstEverScan(null, 0)).toBe(false);
    expect(isFirstEverScan(2, 0)).toBe(false);
  });
  it('resets at midnight UTC independent of daylight saving', () => {
    expect(quotaDay(new Date('2026-10-04T13:00:00Z')).resetsAt).toBe('2026-10-05T00:00:00.000Z');
  });
});
