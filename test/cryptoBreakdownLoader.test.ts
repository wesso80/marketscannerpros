import {it,expect,vi,beforeEach} from 'vitest';
import {reserveBudget,budgetStatus} from '@/lib/crypto/breakdown/budget';
import {cachedPart,resetFlights,dayTtl} from '@/lib/crypto/breakdown/cache';
const memory=new Map<string,unknown>();
const r={eval:vi.fn(),get:vi.fn(async(k:string)=>memory.get(k)??null)};
vi.mock('@/lib/redis',()=>({getRedis:()=>r,getCached:async(k:string)=>memory.get(k)??null,setCached:async(k:string,v:unknown)=>{memory.set(k,v);return true;}}));
beforeEach(()=>{memory.clear();resetFlights();r.eval.mockReset();});
it('expires daily snapshots at the next 00:15 UTC boundary, including just after midnight',()=>{
 expect(dayTtl(Date.parse('2026-10-04T00:05:00Z'))).toBe(600);
 expect(dayTtl(Date.parse('2026-10-04T00:15:00Z'))).toBe(86400);
 expect(dayTtl(Date.parse('2026-10-04T23:55:00Z'))).toBe(1200);
});
it('fails closed on either limit and on accounting failures',async()=>{r.eval.mockResolvedValue([0,1500,100]);await expect(reserveBudget(4)).rejects.toThrow(/limit/);r.eval.mockResolvedValue([0,1,4500]);await expect(reserveBudget(4)).rejects.toThrow(/limit/);r.eval.mockRejectedValue(new Error('offline'));await expect(reserveBudget(1)).rejects.toThrow();});
it('shares simultaneous cold loads and preserves cached observation times',async()=>{r.eval.mockResolvedValue([1,4,4]);const fetcher=vi.fn(async()=>({asOf:'2026-10-01',value:20}));const a=await Promise.all([cachedPart('test',60,4,fetcher),cachedPart('test',60,4,fetcher)]);expect(fetcher).toHaveBeenCalledTimes(1);expect(a[0]).toEqual(a[1]);await cachedPart('test',60,4,fetcher);expect(fetcher).toHaveBeenCalledTimes(1);});
it('serves stale cache without a cold call when capped',async()=>{memory.set('crypto-breakdown:v1:test',{value:{asOf:'2026-01-01'},expiresAt:0});r.eval.mockResolvedValue([0,1500,1500]);const f=vi.fn();const a=await cachedPart('test',60,1,f);expect(a).toEqual({asOf:'2026-01-01'});expect(f).not.toHaveBeenCalled();});
it('reports missing accounting as blocked, not zero usage',async()=>{r.get.mockRejectedValueOnce(new Error('offline'));expect((await budgetStatus()).capped).toBe(true);});
