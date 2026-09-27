import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
import { q } from '@/lib/db';
import { loadEdgePackets } from '@/lib/admin/edgePacketSnapshots';

describe('packet reads inside paper transactions', () => {
  it('reads without schema locks and propagates missing-table failures', async () => {
    vi.mocked(q).mockResolvedValueOnce([]);
    await expect(loadEdgePackets({ workspaceId: 'w', limit: 150 })).resolves.toEqual([]);
    expect(q).toHaveBeenCalledOnce();
    expect(vi.mocked(q).mock.calls[0][0].trim()).toMatch(/^SELECT/);
    const error = Object.assign(new Error('missing relation'), { code: '42P01' });
    vi.mocked(q).mockRejectedValueOnce(error);
    await expect(loadEdgePackets({ workspaceId: 'w' })).rejects.toBe(error);
  });
});
