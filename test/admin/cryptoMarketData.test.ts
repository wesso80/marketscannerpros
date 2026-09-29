import {it,expect,vi} from 'vitest';
vi.mock('@/lib/redis',()=>({getRedis:()=>null}));
import {aggregatePerpetuals,withOiChange,dayAgoSlot,rankCategories,compactMovers,trendingCrowding,globalPoint,globalRegime,mergeDerivativesEvidence,CG_MARKET,type DerivSnapshot} from '@/lib/admin/cryptoMarketData';
import {assessBudget} from '@/lib/admin/cgCredits';
import {assessDerivatives} from '@/lib/admin/cryptoDerivatives';
import type {DerivativeTicker,CoinCategory,TopMover} from '@/lib/coingecko';
const tk=(o:Partial<DerivativeTicker>):DerivativeTicker=>({market:'Binance',symbol:'XUSDT',index_id:'X',price:'1',price_percentage_change_24h:0,contract_type:'perpetual',index:1,basis:.1,spread:0,funding_rate:.01,open_interest:1e7,volume_24h:1e6,last_traded_at:0,expired_at:null,...o});
it('aggregates perpetuals per coin: CoinGecko percent funding becomes a fraction, OI-weighted, outliers and futures excluded',()=>{
 const a=aggregatePerpetuals([tk({funding_rate:.01,open_interest:3e7}),tk({market:'Bybit',funding_rate:.05,open_interest:1e7}),tk({market:'Odd',funding_rate:9.5}),tk({contract_type:'futures',funding_rate:1})]);
 expect(a.X.venues).toBe(3);expect(a.X.outliersExcluded).toBe(1);
 expect(a.X.fundingRate).toBeCloseTo((.0001*3e7+.0005*1e7)/4e7,10);
 expect(a.X.oiUsd).toBe(5e7);
});
it('flags extreme funding and OI surges only on coins with enough open interest; 24h change needs a real earlier snapshot',()=>{
 const snap=(oi:number,f:number):DerivSnapshot=>({at:'',source:'',exchanges:1,tickers:1,coins:aggregatePerpetuals([tk({funding_rate:f*100,open_interest:oi})])});
 const [r]=withOiChange(snap(2e7,.0006),snap(1.5e7,.0001));
 expect(r.oiChange24hPct).toBeCloseTo(33.33,1);expect(r.flags).toEqual(['EXTREME_FUNDING_LONG','OI_SURGE']);
 expect(withOiChange(snap(1e6,.001),null)[0]).toMatchObject({oiChange24hPct:null,flags:[]});
 const t=Date.UTC(2026,8,30,12);
 expect(dayAgoSlot(t,[t-86400000+30*60000,t-3600000])).toBe(t-86400000+30*60000);
 expect(dayAgoSlot(t,[t-86400000+(CG_MARKET.oiLookbackToleranceMinutes+15)*60000])).toBeNull();
});
it('sector 7d change comes only from stored snapshots; 24h from CoinGecko',()=>{
 const now=Date.UTC(2026,8,30),cats=[{id:'ai',name:'AI',market_cap:110,market_cap_change_24h:2,volume_24h:5,top_3_coins:[],updated_at:''},{id:'meme',name:'Meme',market_cap:50,market_cap_change_24h:null as unknown as number,volume_24h:1,top_3_coins:[],updated_at:''}] as CoinCategory[];
 const wk=new Date(now-7*86400000).toISOString().slice(0,10);
 const r=rankCategories(cats,{[wk]:{ai:100}},now);
 expect(r[0]).toMatchObject({id:'ai',change24hPct:2});expect(r[0].change7dPct).toBeCloseTo(10,6);
 expect(r[1]).toMatchObject({change24hPct:null,change7dPct:null});
 expect(rankCategories(cats,{},now)[0].change7dPct).toBeNull();
});
it('reads the duration-specific change field and matches trending by CoinGecko id, never by symbol',()=>{
 const m={id:'x',symbol:'x',name:'X',image:'',usd:2,usd_24h_vol:9,usd_1h_change:12.5} as unknown as TopMover;
 expect(compactMovers([m],'1h')[0]).toMatchObject({symbol:'X',changePct:12.5});expect(compactMovers([m],'24h')[0].changePct).toBeNull();
 const tr={coins:[{item:{id:'celo',symbol:'CELO',name:'Celo',market_cap_rank:300}},{item:{id:'celo-dollar',symbol:'CELO',name:'Fake',market_cap_rank:null}}]} as never;
 const rows=trendingCrowding(tr,['celo'],['grass']);
 expect(rows.map(r=>r.openPosition)).toEqual([true,false]);
});
it('global regime needs real history for 24h/7d changes and rejects incomplete payloads',()=>{
 expect(globalPoint({total_market_cap:{usd:1},total_volume:{usd:1},market_cap_percentage:{btc:50}},0)).toBeNull();
 const H=3600000,t=Date.UTC(2026,8,30),p=(h:number,b:number,m:number)=>({t:t-h*H,mcapUsd:m,volUsd:1,btcDom:b,ethDom:10});
 const g=globalRegime([p(168,60,100),p(24,59,110),p(0,58,121)])!;
 expect(g.btcDomChange7d).toBeCloseTo(-2,6);expect(g.mcapChange24hPct).toBeCloseTo(10,6);expect(g.altsNote).toContain('falling');
 expect(globalRegime([p(0,58,1)])).toMatchObject({btcDomChange24h:null,btcDomChange7d:null});
});
it('credit budget: /key is the source of truth, pauses non-essential jobs below the threshold, local count is a labelled fallback',()=>{
 const local={month:10000,today:500,todayByFamily:{}};
 expect(assessBudget({plan:'Analyst',monthly_call_credit:500000,current_total_monthly_calls:430000,current_remaining_monthly_calls:70000},local,'t')).toMatchObject({source:'coingecko /key',remainingPct:expect.closeTo(14,6),pauseNonEssential:true});
 expect(assessBudget({monthly_call_credit:500000,current_remaining_monthly_calls:80000},local,'t').pauseNonEssential).toBe(false);
 expect(assessBudget(null,local,null)).toMatchObject({source:'local estimate (/key unavailable)',remaining:490000,pauseNonEssential:false,keyCheckedAt:null});
});
it('paper derivatives evidence: OKX stays primary; CoinGecko fills in only when OKX is unavailable, labelled with its source',()=>{
 const row={...aggregatePerpetuals([tk({funding_rate:.06,open_interest:2e7})]).X,oiChange24hPct:20,flags:['EXTREME_FUNDING_LONG','OI_SURGE']};
 const okxOk=assessDerivatives('X-USDT-SWAP',{code:'0',data:[{instId:'X-USDT-SWAP',fundingRate:'0.0001',ts:String(Date.now())}]},null,1);
 const merged=mergeDerivativesEvidence(okxOk,row,'2026-09-30T00:00:00Z');
 expect(merged).toMatchObject({source:'okx:USDT-SWAP',fundingRate:.0001});expect(merged.flags).toContain('CG_OI_SURGE');expect(merged.crossVenue?.venues).toBe(1);
 const okxNo=assessDerivatives('X-USDT-SWAP',null,null,null);
 expect(mergeDerivativesEvidence(okxNo,row,'2026-09-30T00:00:00Z')).toMatchObject({source:'coingecko:perp-aggregate',status:'OK',fundingState:'CROWDED_LONG',oiChange24hPct:20,flags:['EXTREME_FUNDING_LONG','OI_SURGE']});
 expect(mergeDerivativesEvidence(okxNo,null,null)).toBe(okxNo);
});
