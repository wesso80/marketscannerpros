import {afterEach,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {BACKTEST_JEV_CACHE,backtestJevCoverage,backtestJevInput,stampBacktestJev} from '@/lib/admin/cryptoBacktestJev';
import {CHART_QUESTIONS} from '@/lib/admin/cryptoJevChart';
import {JEV_QUESTIONS} from '@/lib/admin/cryptoJev';
import {backtestObservations,buildCalibration} from '@/lib/admin/cryptoCalibration';
import {backtestTradeLog,BACKTEST_LOG_HEADERS} from '@/lib/admin/cryptoTradeLog';
import type {BacktestTrade} from '@/lib/admin/cryptoBacktest';
import type {VolumeMomentum} from '@/lib/admin/cryptoVolumeMomentum';
const now=Date.UTC(2026,9,1,9),savedKey=process.env.AI_GATEWAY_API_KEY,H4=4*3600000,t0=Date.UTC(2026,8,20);
function sig(withBars=true):VolumeMomentum{
 const bars=[];for(let i=0;i<24;i++){const c=10+Math.sin(i)*.05;bars.push({t:t0+i*H4,o:c-.02,h:c+.08,l:c-.08,c,v:100});}
 bars.push({t:t0+24*H4,o:10.05,h:10.9,l:10,c:10.85,v:330});
 return {stage:'MOMENTUM_VOLUME',reason:'',asOf:new Date(t0+24*H4).toISOString(),relativeVolume:3.3,changePct:8,trigger:10.1,close:10.85,atr:.2,sma20:10,kind:'BREAKOUT',stop:9.7,target:13.15,maxEntry:10.95,entryFloor:10.1,...(withBars?{bars}:{})} as VolumeMomentum;
}
const trade=(id:string,r:number|null,extra:Partial<BacktestTrade>={}):BacktestTrade=>({id,coin:id.split('|')[0],product:'X-USD',kind:'BREAKOUT',signalAt:id.split('|')[1],entryAt:id.split('|')[1],fill:10.9,stop:9.7,target:13.3,btcRegime:'UP',btc200:'BULL',half:'FIRST',fixed:{status:'CLOSED',r,exit:r!=null&&r>0?'TAKE_PROFIT':'STOP_LOSS',at:'2026-09-25T00:00:00.000Z'},shadow:{status:'CLOSED',r,legs:[]},jevInput:backtestJevInput(sig(),'UP'),...extra});
const redisMock=()=>{const store=new Map<string,unknown>();return {store,get:vi.fn(async(k:string)=>store.get(k)??null),set:vi.fn(async(k:string,v:unknown)=>{store.set(k,v);return 'OK';})};};
const okFetch=()=>vi.fn(async(_u:string,init:{body:string})=>{const q=JSON.parse(init.body).questions;const chart='cleanBase' in q;return {ok:true,json:async()=>({model:'typesafe-ai/jev',answers:chart?{cleanBase:{noul:.8},strongClose:{noul:.9},volumeExpansion:{noul:.85},overheadSupply:{noul:.1}}:{chase:{noul:.2},flowAgrees:{noul:.05},btcHeadwind:{noul:.1}}})};});
afterEach(()=>{vi.unstubAllGlobals();if(savedKey===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=savedKey;});
it('captures compact Jev inputs at signal time: a chart state from the 25 bars and a shadow state with flow unavailable; no candles are stored',()=>{
 const input=backtestJevInput(sig(),'DOWN');
 expect(input.chart).toMatchObject({bars:25,priorHighsAboveClose:0});
 expect(input.jev).toMatchObject({stage:'MOMENTUM_VOLUME',kind:'BREAKOUT',btcTrend:'DOWN',flowStamp:'unavailable'});
 expect(JSON.stringify(input)).not.toMatch(/"[ohlc]":|"t":/);
 expect(backtestJevInput(sig(false),'UP').chart).toBeNull();
});
it('stamps two questions per trade, caches the pair per (coin, signal), and serves the cache on the next pass without a request',async()=>{
 process.env.AI_GATEWAY_API_KEY='test-key';
 const fetch=okFetch();vi.stubGlobal('fetch',fetch);
 const redis=redisMock();
 const trades=[trade('aave|2026-09-24T00:00:00.000Z',1.9),trade('sui|2026-09-24T04:00:00.000Z',-1.02)];
 const r=await stampBacktestJev(redis,trades,now);
 expect(r).toEqual({stamped:2,fromCache:0,remaining:0,skipped:null});
 expect(fetch).toHaveBeenCalledTimes(4);
 const bodies=fetch.mock.calls.map(c=>JSON.parse(c[1].body));
 expect(bodies.some(b=>JSON.stringify(b.questions)===JSON.stringify(CHART_QUESTIONS))).toBe(true);
 expect(bodies.some(b=>JSON.stringify(b.questions)===JSON.stringify(JEV_QUESTIONS))).toBe(true);
 expect(trades[0].chart).toMatchObject({rule:'jev-chart-v1',status:'scored',cleanBase:.8,bars:25});
 expect(trades[0].jev).toMatchObject({rule:'jev-shadow-v2',status:'scored',chase:.2,flowStamp:'unavailable',btcTrend:'UP'});
 expect(redis.set).toHaveBeenCalledWith(`${BACKTEST_JEV_CACHE}:aave|2026-09-24T00:00:00.000Z`,expect.anything(),{ex:30*86400});
 const again=[trade('aave|2026-09-24T00:00:00.000Z',1.9)];
 const r2=await stampBacktestJev(redis,again,now);
 expect(r2).toEqual({stamped:1,fromCache:1,remaining:0,skipped:null});
 expect(fetch).toHaveBeenCalledTimes(4);
 expect(backtestJevCoverage(trades)).toEqual({trades:2,withInput:2,jevScored:2,chartScored:2,chartNoBars:0,unavailable:0,unstamped:0});
});
it('respects the per-call limit, reports the remainder, does not cache transport failures, and records no-key without a request',async()=>{
 process.env.AI_GATEWAY_API_KEY='test-key';
 vi.stubGlobal('fetch',vi.fn(async()=>({ok:false,status:503,json:async()=>({})})));
 const redis=redisMock();
 const trades=Array.from({length:3},(_,i)=>trade(`c${i}|2026-09-2${i}T00:00:00.000Z`,1));
 const r=await stampBacktestJev(redis,trades,now,2);
 expect(r).toMatchObject({stamped:2,remaining:1});
 expect(trades[0].jev).toMatchObject({status:'unavailable',reason:'http-503'});
 expect(redis.set).not.toHaveBeenCalled();
 delete process.env.AI_GATEWAY_API_KEY;
 const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const fresh=[trade('d|2026-09-20T00:00:00.000Z',1)];
 const r3=await stampBacktestJev(redisMock(),fresh,now);
 expect(r3.skipped).toMatch(/AI_GATEWAY_API_KEY/);
 expect(fresh[0].chart).toMatchObject({status:'unavailable',reason:'no-key'});
 expect(fetch).not.toHaveBeenCalled();
 // A trade with no saved inputs (older run) is never due.
 expect(await stampBacktestJev(redisMock(),[trade('e|2026-09-20T00:00:00.000Z',1,{jevInput:undefined})],now)).toEqual({stamped:0,fromCache:0,remaining:0,skipped:null});
});
it('the ledger grades backtest trades with real exits only, as its own outcome, and the CSV carries the stamps',()=>{
 const stamped=(id:string,r:number,marked?:true)=>({...trade(id,r),fixed:{status:'CLOSED' as const,r,exit:'TAKE_PROFIT',at:'x',...(marked?{marked:true as const}:{})},jev:{rule:'jev-shadow-v2' as const,status:'scored' as const,chase:.2,flowAgrees:.05,btcHeadwind:.1,btcTrend:'UP',flowStamp:'unavailable',model:'m',checkedAt:'x'},chart:{rule:'jev-chart-v1' as const,status:'scored' as const,cleanBase:.8,strongClose:.9,volumeExpansion:.85,overheadSupply:.1,bars:25,model:'m',checkedAt:'x'}});
 const trades=[stamped('a|2026-09-20T00:00:00.000Z',1.9),stamped('b|2026-09-21T00:00:00.000Z',-1,true),{...stamped('c|2026-09-22T00:00:00.000Z',0),fixed:{status:'OPEN_AT_HORIZON' as const,r:null,exit:null,at:null}}];
 const obs=backtestObservations(trades);
 expect(obs).toHaveLength(1);
 expect(obs[0]).toMatchObject({r:1.9,kind:'BREAKOUT',btcRegime:'UP',btc200:'BULL'});
 const ledger=buildCalibration([],[],{closedTrades:0,forwardRows:0,backtestTrades:3,backtestWindow:'2026-07-01 → 2026-09-29'},now,[],obs);
 const bt=ledger.fields.filter(f=>f.outcome==='backtestR');
 expect(bt.map(f=>f.id)).toEqual(['signal.kind','btcRegime.state','btcRegime.longTrend','jev.chase','jev.btcHeadwind','chart.cleanBase','chart.strongClose','chart.volumeExpansion','chart.overheadSupply']);
 expect(ledger.source).toMatchObject({backtestTrades:3,backtestGraded:1,backtestWindow:'2026-07-01 → 2026-09-29'});
 expect(ledger.note).toMatch(/hypothesis/);
 const csv=backtestTradeLog(trades);
 expect(BACKTEST_LOG_HEADERS.slice(-8)).toEqual(['jev_status','jev_chase','jev_btc_headwind','chart_status','chart_clean_base','chart_strong_close','chart_volume_expansion','chart_overhead_supply']);
 expect(csv.split(/\r?\n/)[1]).toMatch(/,scored,0\.2,0\.1,scored,0\.8,0\.9,0\.85,0\.1$/);
});
it('backtest stamping is evidence only: it never alters a replayed result, never routes an order, and the ledger never imports the engine',()=>{
 const src=readFileSync('lib/admin/cryptoBacktestJev.ts','utf8');
 expect(src).not.toMatch(/fixed\.|\.r\s*=|createSimulatedOrder|createRecommendation|coingecko|avFetch/);
 expect(src).toMatch(/Evidence only/);
 const cal=readFileSync('lib/admin/cryptoCalibration.ts','utf8');
 expect(cal.split('\n').filter(l=>l.trim().startsWith('import ')).some(l=>/cryptoBacktest/.test(l))).toBe(false);
});
