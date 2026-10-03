import { expect, it, vi } from 'vitest';
const {q}=vi.hoisted(()=>({q:vi.fn()}));
vi.mock('@/lib/db',()=>({q}));
it('derives ATR from stored percentage and carries stale timestamps, not request time',async()=>{
 q.mockResolvedValue([{asset_class:'crypto',symbol:'ETH',score:70,direction:'bullish',price:100,change_percent:2,created_at:'2020-01-02T01:00:00Z',scan_date:'2020-01-01',indicators:{atrPct:3,lastBarAt:'2020-01-01T00:00:00Z'}}]);
 const {GET}=await import('@/app/api/scanner/candidates/route');
 const data=await (await GET()).json();
 expect(data.candidates[0].atr).toBe(3);
 expect(data.candidates[0].trust.freshness).toBe('stale');
 expect(data.dataQuality.stale).toBe(true);
 expect(data.dataQuality.computedAt).toBe('2020-01-02T01:00:00.000Z');
});
it('never invents a 2 percent ATR for missing data',async()=>{
 q.mockResolvedValue([{asset_class:'crypto',symbol:'ETH',score:70,direction:'bullish',price:100,indicators:{}}]);
 const {GET}=await import('@/app/api/scanner/candidates/route');
 expect((await (await GET()).json()).candidates).toEqual([]);
});
