import { expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ q: vi.fn() }));
import { q } from '@/lib/db';
import { listOpenPositions, parsePaperEntryFee } from '@/lib/admin/portfolio-lab/portfolioStore';
it('reloads the fee actually charged from workspace/portfolio/position/order-scoped fill evidence', async () => {
  vi.mocked(q).mockResolvedValue([{ id: 'pos', opened_at: '2026-09-28T00:00:00Z', fill_accounting: JSON.stringify({ version: 'paper-fill-accounting.v1', entryFee: 1.23 }) }]);
  const [position] = await listOpenPositions('w', 'p');
  expect(position.entryFee).toBe(1.23);
  expect(q).toHaveBeenCalledWith(expect.stringContaining('j.order_id = p.source_order_id'), ['w', 'p']);
});
it.each([null, undefined, 'fill_price=100.0000'])('does not retroactively charge legacy fills: %s', raw => {
  expect(parsePaperEntryFee(raw)).toBe(0);
});
it.each(['{broken', '{"version":"paper-fill-accounting.v1","entryFee":-2}', '{"version":"unknown","entryFee":1}'])('fails closed on corrupted fee evidence: %s', raw => {
  expect(() => parsePaperEntryFee(raw)).toThrow();
});
