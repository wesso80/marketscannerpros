import {expect,it,vi,afterEach} from 'vitest';
import {NextRequest} from 'next/server';
const m=vi.hoisted(()=>{process.env.ALPHA_VANTAGE_API_KEY='test-key';return {spotStarted:false,cache:null as any}});
vi.mock('@/lib/options/access',()=>({checkOptionsAccess:async()=>({ok:true})}));
vi.mock('@/lib/redis',()=>({getCached:async()=>m.cache,setCached:async(_:string,v:any)=>{m.cache=v},CACHE_KEYS:{optionsChain:(s:string)=>s},CACHE_TTL:{optionsChain:120}}));
vi.mock('@/lib/avRateGovernor',()=>({avFetch:async()=>{m.spotStarted=true;return {'Global Quote':{'05. price':'100','07. latest trading day':'2026-10-02'}}}}));
vi.mock('@/lib/options/chainCache',()=>({describeChainSource:()=> 'fixture',fetchSharedOptionsChain:async()=>{
 expect(m.spotStarted).toBe(true);
 return {provider:'HISTORICAL_OPTIONS',quoteBasis:'previous_session',asOfDate:'2026-10-02',quoteCoverage:1,rows:['2026-10-05','2026-10-09'].flatMap(expiration=>['call','put'].map(type=>({symbol:'XYZ',expiration,strike:'100',type,bid:'1',ask:'1.1'})))};
}}));
import {GET} from '@/app/api/options-chain/route';
afterEach(()=>vi.useRealTimers());
it('starts spot alongside chain, sends one expiry, preserves list, and never substitutes missing expiry',async()=>{
 vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-03T16:00Z'));
 const request=(expiry='')=>GET(new NextRequest(`https://fixture/api/options-chain?symbol=XYZ${expiry?'&expiration='+expiry:''}`));
 const first=await (await request()).json();expect(first.success).toBe(true);expect(first.contracts).toHaveLength(2);expect(first.expirations).toHaveLength(2);expect(first.contracts[0].expiration).toBe('2026-10-05');
 const second=await (await request('2026-10-09')).json();expect(second.contracts).toHaveLength(2);expect(second.contracts[0].expiration).toBe('2026-10-09');
 expect((await request('2026-10-12')).status).toBe(422);
});
