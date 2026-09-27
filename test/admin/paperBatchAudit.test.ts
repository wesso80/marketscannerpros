import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
import { q } from '@/lib/db';
import { batchNoTradeDecisions } from '@/lib/admin/arca-brain/batchNoTradeDecisions';
import { prepareNoTradeDecision, type NoTradeCandidateInput } from '@/lib/admin/arca-brain/recordNoTradeDecisionFromCandidate';
function input(i: number): NoTradeCandidateInput {
  return { workspaceId: 'w', portfolioId: 'p', symbol: `S${i}`, rejectionStage: 'STALE_DATA', rejectionReason: 'expired packet', edgePacketId: `packet-${i}`, metadata: { gateReasons: ['packet_expired'] } };
}
beforeEach(() => { vi.mocked(q).mockReset(); });
it('records 500 complete rejection pairs in one database round trip', async () => {
  const inputs = Array.from({ length: 500 }, (_, i) => input(i));
  vi.mocked(q).mockResolvedValue(inputs.map((_, i) => ({ id: String(i) })));
  expect(await batchNoTradeDecisions(inputs)).toBe(500);
  expect(q).toHaveBeenCalledOnce();
  const [sql, params] = vi.mocked(q).mock.calls[0];
  expect(sql).toContain('INSERT INTO arca_no_trade_alpha');
  expect(sql).toContain('INSERT INTO arca_trade_journal');
  const rows = JSON.parse(params![0] as string);
  expect(rows).toHaveLength(500);
  expect(rows[499]).toEqual(prepareNoTradeDecision(inputs[499]));
  expect(rows[0].journal.sourcePacketIds).toEqual(['packet-0']);
});
it('honours cycle deduplication and updates it only after success', async () => {
  const dedupeKeys = new Set(['S0::STALE_DATA']);
  const a = { ...input(0), dedupeKeys }, b = { ...input(1), dedupeKeys };
  vi.mocked(q).mockResolvedValue([{ id: '1' }]);
  expect(await batchNoTradeDecisions([a, b, b])).toBe(1);
  expect(dedupeKeys.has('S1::STALE_DATA')).toBe(true);
});
it('propagates write failure so the paper ledger rolls back and can retry', async () => {
  const dedupeKeys = new Set<string>();
  vi.mocked(q).mockRejectedValue(new Error('database failed'));
  await expect(batchNoTradeDecisions([{ ...input(0), dedupeKeys }])).rejects.toThrow('database failed');
  expect(dedupeKeys.size).toBe(0);
});
it('rejects mixed workspaces before writing', async () => {
  await expect(batchNoTradeDecisions([input(0), { ...input(1), workspaceId: 'other' }])).rejects.toThrow('Mixed paper audit scope');
  expect(q).not.toHaveBeenCalled();
});
it('does no query for an empty batch', async () => {
  expect(await batchNoTradeDecisions([])).toBe(0);
  expect(q).not.toHaveBeenCalled();
});
