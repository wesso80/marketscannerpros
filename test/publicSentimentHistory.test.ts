import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const store = vi.hoisted(()=>new Map<string,unknown>());
vi.mock('@/lib/redis',()=>({
 getRedis:()=>({set:async(k:string,v:unknown)=>{if(!store.has(k))store.set(k,v);}}),
 getCachedMulti:async(keys:string[])=>keys.map(k=>store.get(k)??null),
}));
vi.mock('@/lib/coingecko',()=>({
 getGlobalData:async()=>({updated_at:Date.parse('2026-10-03T10:00:00Z')/1000,market_cap_percentage:{usdt:5,usdc:3},market_cap_change_percentage_24h_usd:2}),
 getGlobalMarketCapChart:async()=>({market_cap_chart:{market_cap:[[Date.parse('2026-10-02'),100],[Date.parse('2026-10-03'),102]]}}),
}));
it('marks reconstructed days and retains the first observed score including a genuine zero',async()=>{
 store.set('sentiment:observed:v1:2026-10-03',{value:0,classification:'Extreme Fear',date:'2026-10-03T01:00:00Z',basis:'observed_inputs'});
 const {GET}=await import('@/app/api/fear-greed/route');
 const body=await(await GET(new NextRequest('https://test/api/fear-greed'))).json();
 expect(body.history[0].basis).toBe('modelled_current_stablecoin_dominance');
 expect(body.history[1].value).toBe(0);expect(body.history[1].basis).toBe('observed_inputs');
 expect(body.current.timestamp).toBe('2026-10-03T10:00:00.000Z');
});
