import {it,expect,vi,afterEach} from 'vitest';
vi.mock('@/lib/redis',()=>({getRedis:()=>null}));
import {takerShares,liquidations,classifyFlow,fetchFlow,FLOW} from '@/lib/admin/cryptoFlow';
import {summarizeCryptoPaper} from '@/lib/admin/cryptoPaperStats';
const H=3600000,now=Date.UTC(2026,8,30,12,20);
afterEach(()=>vi.unstubAllGlobals());
const hours=(n:number,buy:number,sell:number)=>({code:'0',data:Array.from({length:n},(_,i)=>[String(Math.floor(now/H)*H-(i+1)*H),String(sell),String(buy)])});
it('taker buy share uses only completed hours and needs the latest completed hour present',()=>{
 const t=takerShares(hours(24,40,60),now);expect(t.share4h).toBeCloseTo(.4,9);expect(t.share24h).toBeCloseTo(.4,9);
 const cur={code:'0',data:[[String(Math.floor(now/H)*H),'0','100'],...hours(24,50,50).data]};
 expect(takerShares(cur,now).share4h).toBeCloseTo(.5,9);
 expect(takerShares({code:'0',data:hours(24,50,50).data.slice(1)},now).share4h).toBeNull();
 expect(takerShares({code:'51000',data:[]},now)).toMatchObject({share4h:null,share24h:null});
});
it('liquidations convert contracts to USD by side within 24h and report coverage; missing contract size is unavailable',()=>{
 const raw={code:'0',data:[{details:[{posSide:'long',side:'sell',sz:'10',bkPx:'2',ts:String(now-H)},{posSide:'short',side:'buy',sz:'5',bkPx:'2',ts:String(now-2*H)},{posSide:'long',side:'sell',sz:'99',bkPx:'2',ts:String(now-30*H)},{posSide:'long',sz:'x',bkPx:'2',ts:String(now)}]}]};
 expect(liquidations(raw,10,now)).toMatchObject({long:200,short:100,orders:2,partial:false});
 expect(liquidations(raw,10,now)!.coverageHours).toBeCloseTo(30,6);
 expect(liquidations(raw,null,now)).toBeNull();
 // A short span is complete unless paging stopped at the cap.
 expect(liquidations(raw,10,now,true)!.partial).toBe(false);
 const recent={code:'0',data:[{details:[{posSide:'long',sz:'1',bkPx:'1',ts:String(now-2*H)}]}]};
 expect(liquidations(recent,10,now,true)!.partial).toBe(true);expect(liquidations(recent,10,now,false)!.partial).toBe(false);
});
it('classifies with liquidations first (share of OI), then taker pressure; never guesses without data',()=>{
 expect(classifyFlow({share4h:.5},{long:6e5,short:0},1e8)).toMatchObject({state:'LONG_LIQ_HEAVY'});
 expect(classifyFlow({share4h:.4},{long:1e4,short:0},1e8)).toMatchObject({state:'TAKER_SELL_HEAVY'});
 expect(classifyFlow({share4h:.6},null,null)).toMatchObject({state:'TAKER_BUY_HEAVY'});
 expect(classifyFlow({share4h:.5},{long:1e9,short:0},null).state).toBe('NEUTRAL');
 expect(classifyFlow({share4h:null},null,null).state).toBe('UNAVAILABLE');
 expect(FLOW.takerSellHeavy).toBe(.45);
});
it('fetchFlow never throws: an OKX outage records UNAVAILABLE evidence',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('down');}));
 expect(await fetchFlow('CELO',1e7,now)).toMatchObject({state:'UNAVAILABLE',takerBuyShare4h:null,liqLongUsd24h:null,rule:'flow-v1'});
});
it('paper stats group trades by the recorded flow state; older trades are NOT_RECORDED',()=>{
 const row=(r:number,flow?:string)=>({r_multiple:String(r),realised_pnl:String(r*500),outcome:'WIN',exit_reason:'TAKE_PROFIT',instrument_type:'coinbase:X-USD',entry_time:'2026-09-28T00:00:00Z',exit_time:'2026-09-28T06:00:00Z',created_reason:'k|'+JSON.stringify({signal:{kind:'CONTINUATION'},...(flow?{flow:{state:flow}}:{})})});
 const s=summarizeCryptoPaper([row(2,'TAKER_SELL_HEAVY'),row(-1,'TAKER_SELL_HEAVY'),row(1)]);
 expect(s.byFlow.find(g=>g.label==='TAKER_SELL_HEAVY')).toMatchObject({trades:2,avgR:.5});expect(s.byFlow.find(g=>g.label==='NOT_RECORDED')?.trades).toBe(1);
});
