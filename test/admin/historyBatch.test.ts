import { beforeEach, describe, expect, it, vi } from 'vitest';
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db', () => ({ q: query }));
import { loadPriorPacketSnapshots, packetHistoryKey } from '@/lib/admin/researchPacketHistory';
import { createSingleFlight } from '@/lib/admin/singleFlight';
beforeEach(() => vi.clearAllMocks());
const equity = { symbol: 'ABC', market: 'EQUITIES', timeframe: '15m' };
const crypto = { ...equity, market: 'CRYPTO' };
describe('history batch isolation and failure semantics', () => {
  it('uses one workspace-scoped query for a large repeated cohort, keeping market keys separate', async () => {
    query.mockResolvedValue([{ ...equity, id: 1 }, { ...crypto, id: 2 }]);
    const rows = await loadPriorPacketSnapshots('workspace-a', [...Array(200).fill(equity), crypto]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['workspace-a', JSON.stringify([equity, crypto])]);
    expect(query.mock.calls[0][0]).toContain('workspace_id = $1');
    expect(rows.get(packetHistoryKey(equity))?.id).toBe(1);
    expect(rows.get(packetHistoryKey(crypto))?.id).toBe(2);
  });
  it('does not turn an outage into a missing history result', async () => {
    query.mockRejectedValue(new Error('connection unavailable'));
    await expect(loadPriorPacketSnapshots('workspace-a', [equity])).rejects.toThrow('connection unavailable');
  });
  it('skips empty cohorts', async () => {
    expect((await loadPriorPacketSnapshots('workspace-a', [])).size).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });
});
describe('overlapping opportunity reads', () => {
  it('coalesces matching requests but isolates workspaces and never retains completed data', async () => {
    const run = createSingleFlight<string>();
    let finish!: (value: string) => void;
    const work = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
    const first = run('workspace-a|ALL', work);
    const second = run('workspace-a|ALL', work);
    expect(first).toBe(second);
    expect(await run('workspace-b|ALL', async () => 'b')).toBe('b');
    finish('a');
    expect(await first).toBe('a');
    expect(work).toHaveBeenCalledTimes(1);
    expect(await run('workspace-a|ALL', async () => 'new')).toBe('new');
  });
  it('releases a failed request so recovery is possible', async () => {
    const run = createSingleFlight<string>();
    await expect(run('a', async () => { throw new Error('failed'); })).rejects.toThrow('failed');
    expect(await run('a', async () => 'recovered')).toBe('recovered');
  });
});
