import { expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({store:new Map<string,any>(),available:true}));
vi.mock('@/lib/coingecko',()=>({getDerivativesTickers:async()=>[{contract_type:'perpetual',index_id:'BTC',market:'A',symbol:'BTCUSD',open_interest:100,last_traded_at:Date.now()/1000}]}));
vi.mock('@/lib/redis',()=>({
 getRedis:()=>state.available ? {get:async(k:string)=>state.store.get(k)??null,set:async(k:string,v:any,opts:any)=>{if(!opts?.nx||!state.store.has(k))state.store.set(k,v);return 'OK';}} : null,
 getCached:async()=>null,setCached:async()=>true,
}));
it('pins identity durably and refuses to pretend persistence works when absent',async()=>{
 const {getOiEvidence}=await import('@/lib/crypto/oiHistory');
 expect((await getOiEvidence()).totalOpenInterest).toBe(100);
 expect(state.store.get('oi:fixed-constituents:v1')).toHaveLength(1);
 state.available=false;
 await expect(getOiEvidence()).rejects.toThrow('persistence unavailable');
});
