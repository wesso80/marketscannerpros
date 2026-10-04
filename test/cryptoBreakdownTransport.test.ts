import {it,expect,vi,beforeEach,afterEach} from 'vitest';
const memory=vi.hoisted(()=>new Map<string,any>());
const now=Date.parse('2026-10-04T01:00Z'),day=86400000;
const r=vi.hoisted(()=>({
 get:async(k:string)=>memory.get(k)??null,set:async(k:string,v:unknown)=>{memory.set(k,v);return 'OK';},
 incrby:async(k:string,n:number)=>{const v=(memory.get(k)??0)+n;memory.set(k,v);return v;},expire:async()=>1,hincrby:async()=>1,
 eval:async(_s:string,k:string[],a:number[])=>{const own=Number(memory.get(k[0])??0),app=Number(memory.get(k[1])??0),shadow=Math.max(app,Number(memory.get(k[2])??0)),n=a[0];if(own+n>1500||shadow+n>4500)return [0,own,app];memory.set(k[0],own+n);memory.set(k[2],shadow+n);return [1,own+n,app];}
}));
vi.mock('@/lib/redis',()=>({getRedis:()=>r,getCached:async(k:string)=>memory.get(k)??null,setCached:async(k:string,v:unknown)=>{memory.set(k,v);return true;}}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:vi.fn()}));
vi.mock('@/lib/proTraderAccess',()=>({hasPaidSessionAccess:vi.fn()}));
import {loadBreakdown} from '@/lib/crypto/breakdown/load';
import {resetFlights} from '@/lib/crypto/breakdown/cache';
import {GET} from '@/app/api/crypto/breakdown/route';
import {getSessionFromCookie} from '@/lib/auth';
import {hasPaidSessionAccess} from '@/lib/proTraderAccess';
import {NextRequest} from 'next/server';
let cgCalls=0,failed='',noSwap=false;
const chart=()=>({prices:Array.from({length:400},(_,i)=>[Math.floor(now/day)*day-(399-i)*day,100]),market_caps:Array.from({length:400},(_,i)=>[Math.floor(now/day)*day-(399-i)*day,1000000]),total_volumes:Array.from({length:400},(_,i)=>[Math.floor(now/day)*day-(399-i)*day,10000000])});
const response=(x:unknown,status=200)=>new Response(JSON.stringify(x),{status,headers:{'content-type':'application/json'}});
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(now);memory.clear();resetFlights();cgCalls=0;failed='';noSwap=false;
 vi.stubGlobal('fetch',vi.fn(async(raw:RequestInfo|URL)=>{
 const u=new URL(String(raw)),p=u.pathname;
 if(u.hostname.includes('coingecko')){
  cgCalls++;
  if(failed&&p.includes(failed))return response({error:'fixture unavailable'},400);
  if(p.endsWith('/search'))return response({coins:[{id:'quant-network',symbol:'QNT',name:'Quant',market_cap_rank:50},{id:'fake-quant',symbol:'QNT',name:'Other',market_cap_rank:500},{id:'crvusd',symbol:'CRVUSD',name:'crvUSD',market_cap_rank:100}]});
  if(p.endsWith('/simple/price'))return response({[u.searchParams.get('ids')!]:{usd:100,usd_24h_change:2,last_updated_at:now/1000}});
  if(p.endsWith('/ohlc/range')){const from=Number(u.searchParams.get('from'))*1000,to=Number(u.searchParams.get('to'))*1000;return response(Array.from({length:180},(_,i)=>[Math.floor(to/day)*day-i*day,100,102,98,100]).filter(a=>a[0]>=from));}
  if(p.endsWith('/market_chart/range')||p.endsWith('/market_chart'))return response(chart());
  if(p.endsWith('/global/market_cap_chart'))return response({market_cap_chart:{market_cap:chart().market_caps.map(([t])=>[t,1e8])}});
  if(p.endsWith('/tickers'))return response({tickers:[{base:'LINK',target:'USD',market:{name:'Coinbase',identifier:'gdax'},converted_volume:{usd:1e7},bid_ask_spread_percentage:.1,trust_score:'green',is_stale:false,is_anomaly:false,last_traded_at:new Date(now).toISOString(),timestamp:new Date(now).toISOString()}]});
  const id=p.split('/').at(-1);return response({id,symbol:id==='chainlink'?'LINK':id==='quant-network'?'QNT':'CRVUSD',name:id,market_cap_rank:50,last_updated:new Date(now).toISOString(),market_data:{market_cap:{usd:1e9},current_price:{usd:100},total_volume:{usd:1e7},max_supply:1e8,circulating_supply:5e7,total_supply:1e8,ath:{usd:120},ath_date:{usd:'2024-01-01'},price_change_percentage_7d:2,price_change_percentage_30d:3}});
 }
 if(u.hostname.includes('okx')){
  const inst=u.searchParams.get('instId')!;
  if(p.endsWith('/instruments'))return response({code:'0',data:noSwap?[]:[{instId:inst}]});
  if(p.endsWith('/funding-rate'))return response({code:'0',data:[{instId:inst,ts:String(now),fundingRate:'.0001',fundingTime:String(now+3600000),nextFundingTime:String(now+9*3600000)}]});
  if(p.endsWith('/open-interest'))return response({code:'0',data:[{instId:inst,ts:String(now),oiUsd:'30000000',oiCcy:'300000'}]});
  if(p.endsWith('/open-interest-history'))return response({code:'0',data:Array.from({length:25},(_,i)=>[String(now-i*3600000),'100','300000','30000000'])});
  return response({code:'0',data:[{instId:inst,ts:String(now),last:'100.1',volCcy24h:'100000'}]});
 }
 if(u.hostname.includes('yahoo'))return response({chart:{result:[{meta:{symbol:'LINK-USD',regularMarketPrice:100.05,previousClose:98},indicators:{quote:[{}]}}]}});
 throw Error('Unexpected network request: '+u.hostname);
 }));
});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('measures actual mocked transport calls: LINK cold 10, warm zero; concurrent share',async()=>{
 const [a,b]=await Promise.all([loadBreakdown('LINK',undefined,now),loadBreakdown('LINK',undefined,now)]);expect(a.coinId).toBe('chainlink');expect(b.coinId).toBe(a.coinId);expect(Object.keys(a.sections)).toHaveLength(10);expect(cgCalls).toBe(10);expect(a.budget.breakdownToday).toBe(22);await loadBreakdown('LINK',undefined,now);expect(cgCalls).toBe(10);expect(a.sections.derivatives.value?.metrics.find(m=>m.label==='Open interest (USD)')?.value).toBe(30000000);
});
it('QNT searches exactly once, preserves duplicate count, and uses exact identity',async()=>{const a=await loadBreakdown('QNT',undefined,now);expect(a.coinId).toBe('quant-network');expect(a.identityMatches).toBe(2);expect(cgCalls).toBe(11);});
it('CRVUSD is not stripped by the legacy resolver',async()=>{expect((await loadBreakdown('CRVUSD',undefined,now)).coinId).toBe('crvusd');});
it('no OKX perpetual is a fact and other sources remain',async()=>{noSwap=true;const a=await loadBreakdown('LINK',undefined,now);expect(a.sections.derivatives.value?.notes.join()).toContain('No OKX perpetual');expect(a.sections.price.value?.metrics[0].value).toBe(100);});
it('one source failure is isolated',async()=>{failed='/tickers';const a=await loadBreakdown('LINK',undefined,now);expect(a.sections.liquidity.value?.notes.join()).toContain('Venue list unavailable');expect(a.sections.price.value?.metrics[0].value).toBe(100);});
it.each([['crypto-breakdown:cg:day:2026-10-04',1500],['admin:cg-credits:v1:day:2026-10-04',4500]])('caps %s with zero CoinGecko calls',async(k,n)=>{memory.set(k,n);const a=await loadBreakdown('LINK',undefined,now);expect(cgCalls).toBe(0);expect(a.budget.capped).toBe(true);});
it('auth rejects anonymous and unpaid before providers',async()=>{vi.mocked(getSessionFromCookie).mockResolvedValue(null);expect((await GET(new NextRequest('https://msp.test/api/crypto/breakdown?symbol=LINK'))).status).toBe(401);vi.mocked(getSessionFromCookie).mockResolvedValue({workspaceId:'a'} as any);vi.mocked(hasPaidSessionAccess).mockReturnValue(false);expect((await GET(new NextRequest('https://msp.test/api/crypto/breakdown?symbol=LINK'))).status).toBe(403);expect(cgCalls).toBe(0);});
