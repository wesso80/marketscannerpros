import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(()=>({q:vi.fn()}));
vi.mock('@/lib/admin/positionHistory',()=>({readPositionHistory:vi.fn(async()=>[])}));
vi.mock('@/lib/db',()=>({q:m.q}));
import { enrichStoredPositionEvidence } from '@/lib/admin/decisionEvidence';
import type { SavedPacket } from '@/lib/admin/sharedScan';
beforeEach(()=>vi.clearAllMocks());
describe('read-only legacy position evidence enrichment',()=>{
  it('never reads crypto from the symbol-only equity cache',async()=>{
    const packets=[{market:'CRYPTO',symbol:'AR',snapshot:{}}] as SavedPacket[];
    expect(await enrichStoredPositionEvidence(packets)).toEqual(packets);expect(m.q).not.toHaveBeenCalled();
  });
  it('checks the stored asset identity and does not write enriched packets',async()=>{
    m.q.mockResolvedValue([]);
    const packets=[{market:'EQUITIES',symbol:'TEST',snapshot:{}}] as SavedPacket[];
    await enrichStoredPositionEvidence(packets);
    const [sql,values]=m.q.mock.calls[0];expect(sql).toContain('symbol_universe');expect(sql).toContain('lower(u.asset_type)');expect(sql).not.toMatch(/INSERT|UPDATE|DELETE/);expect(values).toEqual([['TEST']]);
  });
  it('preserves missing evidence on a cache failure without fetching a provider',async()=>{
    m.q.mockRejectedValue(new Error('offline'));
    const packets=[{market:'EQUITIES',symbol:'TEST',snapshot:{}}] as SavedPacket[];
    expect(await enrichStoredPositionEvidence(packets)).toEqual(packets);
  });
});
