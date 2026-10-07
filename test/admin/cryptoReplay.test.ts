import {describe,expect,it} from 'vitest';
import {hourlySeries,resample,quarterHours,H,F,D,M15} from './replayFixtures';
import {findSignals,fifteenMinuteWindows,replaySegment,simulateBooks,barsAt,REPLAY,type SegmentInput,type SimRow,type Fetcher} from '@/lib/admin/cryptoReplay';
import {replayExits} from '@/lib/admin/cryptoBacktest';
import {signalFeatures} from '@/lib/admin/cryptoSignalFeatures';
import {dayKey} from '@/lib/admin/strategyHarness';
import {NO_TRADE_MAX_BARS} from '@/lib/admin/cryptoCandleGaps';
import type {ExchangeBar} from '@/lib/admin/cryptoExchangeVolume';

const start=Date.parse('2024-01-01T00:00:00Z'),spike=Date.parse('2024-03-10T08:00:00Z'),stretch=Date.parse('2024-03-20T16:00:00Z');
const hourly=hourlySeries(start,24*100,[spike],100,[stretch]);
const daily=resample(hourlySeries(start-300*D,24*400),D);
const days=new Set<string>();for(let d=start;d<start+100*D;d+=D)days.add(dayKey(d));
const seg:SegmentInput={coin:'x',product:'X-USD',from:start+30*D,to:start+90*D,dataEnd:start+100*D,universeDays:days,ranks:{'2024-03-10':42},firstHistoryDay:'2023-01-01',btcDaily:daily};
/** Changes every candle that closes after `t` (the future); anything computed at t must not move. */
const scrambleAfter=(bars:ExchangeBar[],t:number)=>bars.map(b=>b.t>t?{...b,o:b.o*1.7,h:b.h*1.9,l:b.l*0.5,c:b.c*1.3,v:b.v*9}:b);

describe('Pass A: signals, entries and features', ()=>{
 const rows=findSignals(seg,hourly,daily);
 it('keeps confirmed and chase-limited signals; only chase-limited entries are hypothetical', ()=>{
  const confirmed=rows.find(r=>r.signalAt===new Date(spike).toISOString())!,ext=rows.find(r=>r.stage==='EXTENDED');
  expect(confirmed.stage).toBe('MOMENTUM_VOLUME');expect(confirmed.entry?.hypothetical).toBe(false);
  expect(ext).toBeTruthy();expect(ext!.entry?.hypothetical??true).toBe(true);
  expect(confirmed.features.values.mcapRank).toBe(42);
  expect(confirmed.signalId).toBe(`x|X-USD|${new Date(spike).toISOString()}`);
 });
 it('entry is the first hourly open at or after the signal close, priced with the replay half-spread and costs', ()=>{
  const r=rows.find(r=>r.signalAt===new Date(spike).toISOString())!;const open=Date.parse(r.entry!.at);
  expect(open).toBeGreaterThanOrEqual(spike);expect(open).toBeLessThan(spike+F);
  const hb=hourly.find(b=>b.t-H===open)!;expect(r.entry!.ask).toBeCloseTo(hb.o*(1+REPLAY.halfSpread),10);
  expect(r.entry!.fill).toBeCloseTo(r.entry!.ask*(1+REPLAY.cost),10);
 });
 it('only signals on universe days are replayed', ()=>{
  const none=findSignals({...seg,universeDays:new Set([...days].filter(d=>d!=='2024-03-10'))},hourly,daily);
  expect(none.some(r=>r.signalAt===new Date(spike).toISOString())).toBe(false);
 });
 it('no look-ahead: scrambling every candle after a signal never changes that signal or its features', ()=>{
  for(const r of rows){const t=Date.parse(r.signalAt);
   const again=findSignals(seg,scrambleAfter(hourly,t),scrambleAfter(daily,t)).find(x=>x.signalId===r.signalId);
   expect(again).toBeTruthy();expect(again!.signal).toEqual(r.signal);expect(again!.features).toEqual(r.features);}
 });
 it('no look-ahead: truncating the data at the signal close gives the same signal and features', ()=>{
  for(const r of rows){const t=Date.parse(r.signalAt);
   const cut=findSignals({...seg,dataEnd:t},hourly.filter(b=>b.t<=t),daily.filter(b=>b.t<=t)).find(x=>x.signalId===r.signalId);
   expect(cut!.signal).toEqual(r.signal);expect(cut!.features).toEqual(r.features);}
 });
});

describe('features', ()=>{
 const four=resample(hourly,F),i=four.findIndex(b=>b.t===spike);
 const base={signal:findSignals(seg,hourly,daily).find(r=>r.signalAt===new Date(spike).toISOString())!.sig,signalAt:spike,daily,btcDaily:daily,mcapRank:7,firstHistoryDay:'2023-06-01'};
 it('records unavailable inputs as missing, never estimated', ()=>{
  const f=signalFeatures({...base,four:four.slice(i-30,i+1),daily:daily.filter(b=>b.t<=spike).slice(-40)});
  expect(f.values.rsi14_4h).toBeUndefined();expect(f.unavailable.rsi14_4h).toMatch(/Fewer than 60/);
  expect(f.values.distEma200dPct).toBeUndefined();expect(f.unavailable.distEma200dPct).toMatch(/200/);
  for(const k of ['fundingRate','openInterest','trending','sector','tokenUnlocks'])expect(f.unavailable[k]).toBeTruthy();
 });
 it('computes the full set with enough history', ()=>{
  const f=signalFeatures({...base,four:four.slice(0,i+1)});
  for(const k of ['rsi14_4h','adx14_4h','distEma20dPct','distEma50dPct','distEma200dPct','return30dPct','rsVsBtc30dPct','btcTrend','btcAbove200d','atrPct4h'])expect(f.values[k],k).not.toBeUndefined();
  expect(f.values.mcapRank).toBe(7);expect(f.values.daysSinceFirstHistory).toBe(Math.floor((spike-Date.parse('2023-06-01'))/D));
  expect(f.values.rsVsBtc30dPct).toBe(0); // the coin is its own benchmark here
 });
 it('fixed windows: extra older history or future candles leave every value unchanged', ()=>{
  const a=signalFeatures({...base,four:four.slice(0,i+1)}),b=signalFeatures({...base,four});
  expect(b).toEqual(a);
  // Daily history longer than the fixed window (the replay fetches 420 days): adding even older candles changes nothing.
  const long=resample(hourlySeries(start-600*D,24*700),D),withLong={...base,four:four.slice(0,i+1),daily:long};
  expect(long.filter(b=>b.t<=spike).length).toBeGreaterThan(400);
  expect(signalFeatures({...withLong,daily:[...resample(hourlySeries(start-900*D,24*300,[],50),D).filter(x=>x.t<long[0].t),...long]})).toEqual(signalFeatures(withLong));
 });
 it('a listing date after the signal is not used', ()=>{
  expect(signalFeatures({...base,four:four.slice(0,i+1),firstHistoryDay:'2025-01-01'}).values.daysSinceFirstHistory).toBeUndefined();
 });
});

describe('outcomes use the shared exit code', ()=>{
 const m15=quarterHours(hourlySeries(start,24*100,[spike],100,[stretch]));
 const fetcher:Fetcher=async(_p,a,b,step)=>({bars:(step===H?hourly:step===D?daily:m15).filter(x=>x.t-step>=a&&x.t<=b),requests:1,dropped:0});
 it('fixed plan, MFE/MAE and shadows equal a direct replayExits call; 4h closes cover the correlation lookback', async()=>{
  const r=await replaySegment(seg,fetcher),row=r.rows.find(x=>x.signalAt===new Date(spike).toISOString())!;
  const sig=findSignals(seg,hourly,daily).find(x=>x.signalId===row.signalId)!.sig,at=Date.parse(row.entry!.at),pathEnd=Math.min(seg.dataEnd,at+REPLAY.horizonDays*D);
  expect(row.outcomes).toEqual({...replayExits({id:'x',product:'X-USD'},sig,{at,plan:row.entry!},m15.filter(b=>b.t-M15>=Math.floor(at/M15)*M15-NO_TRADE_MAX_BARS*M15&&b.t<=pathEnd),pathEnd),pathEnd:new Date(pathEnd).toISOString()});
  expect(row.outcomes!.fixed.status).toBe('CLOSED');
  expect(Object.keys(row.outcomes!.shadows).length).toBeGreaterThan(3);
  expect(r.closes[0][0]).toBeLessThanOrEqual(seg.from-30*F);expect(r.closes.at(-1)![0]).toBeLessThan(seg.to);
 });
 it('merges overlapping 15m windows and starts each at the gap-fill anchor', ()=>{
  const a=Date.parse('2024-03-01T01:00:00Z');
  expect(fifteenMinuteWindows([a,a+D,a+30*D],a+60*D)).toEqual([[a-NO_TRADE_MAX_BARS*M15,a+D+REPLAY.horizonDays*D],[a+30*D-NO_TRADE_MAX_BARS*M15,a+30*D+REPLAY.horizonDays*D]]);
  expect(fifteenMinuteWindows([a],a+2*D)[0][1]).toBe(a+2*D);
 });
});

describe('Pass B: chronological book simulation', ()=>{
 const t0=Date.parse('2024-05-01T04:00:00Z');
 const closesFor=(seed:number)=>{const out:[number,number][]=[];let p=100;for(let k=0;k<200;k++){p*=1+Math.sin(k*seed)*0.01;out.push([t0-150*F+k*F,p]);}return out;};
 const closes=new Map<string,[number,number][]>([['a',closesFor(1.1)],['b',closesFor(1.1)],['c',closesFor(2.7)],['d',closesFor(0.37)],['e',closesFor(5.3)]]);
 const row=(id:string,coin:string,at:number,x:Partial<SimRow>={}):SimRow=>({signalId:id,coin,stage:'MOMENTUM_VOLUME',signalAt:at-H,entryAt:at,relativeVolume:2,btcTrend:'UP',product:`${coin.toUpperCase()}-USD`,
  signal:{stage:'MOMENTUM_VOLUME',kind:'BREAKOUT',asOf:new Date(at-H).toISOString(),stop:95,target:110,maxEntry:102,entryFloor:99,atr:2,relativeVolume:2,changePct:2,close:100,trigger:99,sma20:98,reason:''},
  quote:{bid:99.95,ask:100},liquidityCapUsd:1e9,noEntryReason:null,exit:{at:at+10*H,r:1.5},fill:100.05,stop:95,...x});
 const cfg={btcDownFilter:true};
 it('takes a clean signal on the live sleeve and books its P&L', ()=>{
  const {decisions,summary}=simulateBooks([row('1','a',t0)],closes,cfg);
  expect(decisions[0]).toMatchObject({decision:'TAKEN',book:'live',reasons:[]});
  expect((summary.live as {realisedPnl:number}).realisedPnl).toBeGreaterThan(0);
 });
 it('BTC daily trend DOWN routes to the research book (filter on) and stays live when the filter is off', ()=>{
  expect(simulateBooks([row('1','a',t0,{btcTrend:'DOWN'})],closes,cfg).decisions[0]).toMatchObject({decision:'TAKEN',book:'research'});
  expect(simulateBooks([row('1','a',t0,{btcTrend:'DOWN'})],closes,{btcDownFilter:false}).decisions[0]).toMatchObject({book:'live'});
 });
 it('a correlated open position sends the next add to research; an open coin blocks a second entry', ()=>{
  const d=simulateBooks([row('1','a',t0),row('2','b',t0+H)],closes,cfg).decisions;
  expect(d.find(x=>x.signalId==='2')).toMatchObject({decision:'TAKEN',book:'research'});
  expect(d.find(x=>x.signalId==='2')!.reasons[0]).toMatch(/Live sleeve refuses the next correlated add \(a\)/);
  // Same book: the second signal on an open coin is blocked (as live).
  const e=simulateBooks([row('1','a',t0,{btcTrend:'DOWN'}),row('3','a',t0+2*H,{btcTrend:'DOWN'})],closes,cfg).decisions;
  const third=e.find(x=>x.signalId==='3')!;expect(third).toMatchObject({decision:'SKIPPED',book:'research'});expect(third.reasons.at(-1)).toBe('Position already open');
 });
 it('closed positions free their slot (exit at or before the entry time is booked first)', ()=>{
  const d=simulateBooks([row('1','a',t0,{exit:{at:t0+H,r:-1}}),row('2','a',t0+H)],closes,cfg).decisions;
  expect(d.find(x=>x.signalId==='2')).toMatchObject({decision:'TAKEN',book:'live'});
 });
 it('cycle limit, missing liquidity, missing history, chase-limited and no-entry signals are skipped with reasons', ()=>{
  const same=['a','c','d','e','b'].map((c,k)=>row(`s${k}`,c,t0,{relativeVolume:10-k}));
  const d=simulateBooks([...same,row('liq','c',t0+5*H,{liquidityCapUsd:null}),row('hist','zzz',t0+6*H),row('ext','d',t0+7*H,{stage:'EXTENDED'}),row('none','e',t0+8*H,{entryAt:null,noEntryReason:'No hourly open inside the entry zone within 4h'})],closes,cfg).decisions;
  const by=(id:string)=>d.find(x=>x.signalId===id)!;
  expect(by('s4').reasons[0]).toMatch(/4-entry cycle limit/);
  expect(by('liq').reasons[0]).toMatch(/liquidity cap cannot be verified/);
  expect(by('hist').reasons[0]).toMatch(/4h history unavailable/);
  expect(by('ext').reasons[0]).toMatch(/^EXTENDED/);
  expect(by('none').reasons[0]).toMatch(/entry zone/);
  expect(d).toHaveLength(9);
 });
 it('no look-ahead: decisions up to T are identical when every later signal is removed', ()=>{
  const coins=['a','b','c','d','e'],rows:SimRow[]=[];
  for(let k=0;k<60;k++)rows.push(row(`r${k}`,coins[k%5],t0+k*3*H,{exit:{at:t0+k*3*H+((k*7)%13+1)*H,r:((k*5)%9-3)/2},btcTrend:k%4===0?'DOWN':'UP'}));
  const all=simulateBooks(rows,closes,cfg).decisions;
  for(const cut of [10,25,40]){const T=t0+cut*3*H;
   const part=simulateBooks(rows.filter(r=>r.entryAt!<=T),closes,cfg).decisions;
   for(const p of part)expect(p).toEqual(all.find(a=>a.signalId===p.signalId));}
 });
 it('correlation bars are the closes completed at the entry time only', ()=>{
  const c=closes.get('a')!,at=c[100][0]+H;const b=barsAt(c,at)!;
  expect(b.at(-1)!.t).toBe(c[100][0]);expect(b).toHaveLength(31);
  expect(barsAt(c,c[0][0]-1)).toBeNull();expect(barsAt(undefined,at)).toBeNull();
 });
});
