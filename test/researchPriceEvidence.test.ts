import {describe,expect,it} from 'vitest';
import {buildPriceEvidence,partialBarDate,PRICE_EVIDENCE,type EvidenceBar} from '@/lib/research/priceEvidence';
import {dmiSeries,rsiSeries,atrSeries,smaSeries,lastFinite} from '@/lib/ta/core';
import {buildPayload} from '@/lib/goldenEgg/engine';

const D=86400000;
/** Weekday session dates ending on `last` (YYYY-MM-DD), oldest first. */
function sessions(n:number,last:string){const out:string[]=[];let t=Date.parse(last+'T00:00:00Z');while(out.length<n){const w=new Date(t).getUTCDay();if(w!==0&&w!==6)out.unshift(new Date(t).toISOString().slice(0,10));t-=D;}return out;}
function bars(n:number,last='2026-10-06',vol:(i:number)=>number|null=()=>1000):EvidenceBar[]{
 return sessions(n,last).map((date,i)=>{const c=200+i*0.4+Math.sin(i/5)*3;return {date,high:c*1.01,low:c*0.99,close:c,volume:vol(i)};});
}
// 7 Oct 2026 21:35 AEDT = 10:35 UTC = 06:35 New York (before the session); 8 Oct 21:00 UTC = 17:00 New York (after the close).
const preOpen=Date.parse('2026-10-07T10:35:00Z'),inSession=Date.parse('2026-10-07T17:00:00Z'),afterClose=Date.parse('2026-10-07T21:00:00Z');

describe('completed bars only',()=>{
 it('an equity bar dated today (New York) is unfinished until 16:15 ET; crypto bars dated today (UTC) are unfinished',()=>{
  expect(partialBarDate('2026-10-07','equity',inSession)).toBe('2026-10-07');
  expect(partialBarDate('2026-10-07','equity',afterClose)).toBeNull();
  expect(partialBarDate('2026-10-06','equity',inSession)).toBeNull();
  expect(partialBarDate('2026-10-07T00:00:00.000Z','crypto',inSession)).toBe('2026-10-07');
  expect(partialBarDate('2026-10-06T00:00:00.000Z','crypto',inSession)).toBeNull();
 });
 it('excludes the unfinished bar and dates every measure to the last completed bar; the quote is reported separately',()=>{
  const b=bars(300,'2026-10-07');
  const e=buildPriceEvidence({symbol:'AAPL',assetClass:'equity',bars:b,nowMs:inSession,quote:{price:335.1,at:'2026-10-07T10:35:00Z'}});
  expect(e.basis).toMatchObject({lastCompletedBar:'2026-10-06',excludedPartialBar:'2026-10-07',barsUsed:299});
  expect(e.close).toBe(b[298].close);expect(e.quote).toMatchObject({price:335.1});
  const after=buildPriceEvidence({symbol:'AAPL',assetClass:'equity',bars:b,nowMs:afterClose});
  expect(after.basis).toMatchObject({lastCompletedBar:'2026-10-07',excludedPartialBar:null,barsUsed:300});
 });
 it('appending a later (unfinished) bar never changes the completed-bar measures',()=>{
  const b=bars(300,'2026-10-06'),withToday=[...b,{date:'2026-10-07',high:999,low:1,close:500,volume:9e9}];
  const a=buildPriceEvidence({symbol:'X',assetClass:'equity',bars:b,nowMs:inSession}),z=buildPriceEvidence({symbol:'X',assetClass:'equity',bars:withToday,nowMs:inSession});
  expect({...z,basis:{...z.basis,excludedPartialBar:null}}).toEqual(a);
 });
});

describe('one definition per measure, matching lib/ta/core',()=>{
 const b=bars(300),e=buildPriceEvidence({symbol:'X',assetClass:'equity',bars:b,nowMs:preOpen});
 const c=b.map(x=>x.close),h=b.map(x=>x.high),l=b.map(x=>x.low);
 it('ADX, RSI, ATR and SMA200 equal the canonical functions',()=>{
  expect(e.adx.adx).toBeCloseTo(lastFinite(dmiSeries(h,l,c,14,14).adx),1);
  expect(e.rsi14).toBeCloseTo(lastFinite(rsiSeries(c,14)),1);
  expect(e.atr14).toBeCloseTo(lastFinite(atrSeries(h,l,c,14)),3);
  expect(e.averages.find(a=>a.kind==='SMA'&&a.length===200)!.value).toBeCloseTo(lastFinite(smaSeries(c,200)),3);
 });
 it('volume ratio = last completed bar ÷ mean of the 20 completed bars before it',()=>{
  const v=bars(300,'2026-10-06',i=>i===299?730:1000);
  expect(buildPriceEvidence({symbol:'X',assetClass:'equity',bars:v,nowMs:preOpen}).volumeRatio).toBe(0.73);
 });
 it('states use the stated thresholds; the summary is factual and cites its numbers',()=>{
  expect(e.states.longerAverages).toBe('above');
  expect(e.summary[0]).toBe(`X closed above its 50-day and 200-day simple averages on ${e.basis.lastCompletedBar}.`);
  expect(e.summary.join(' ')).not.toMatch(/buy|sell|bullish|bearish|breakout|probab|will /i);
 });
});

describe('missing data stays missing',()=>{
 it('short history: no SMA200, EMA200 or BBWP (BBWP is never a placeholder 50); reasons listed',()=>{
  const e=buildPriceEvidence({symbol:'X',assetClass:'equity',bars:bars(120),nowMs:preOpen});
  expect(e.averages.find(a=>a.kind==='SMA'&&a.length===200)!.value).toBeNull();
  expect(e.bbwp).toBeNull();expect(e.states.volatility).toBeNull();expect(e.states.longerAverages).toBeNull();
  expect(e.missing.join(' ')).toMatch(/SMA200/);expect(e.missing.join(' ')).toMatch(new RegExp(`BBWP: fewer than ${PRICE_EVIDENCE.bbwpMinCloses}`));
 });
 it('a gap in the prior 20 volumes, or no volume on the last bar, gives no ratio',()=>{
  expect(buildPriceEvidence({symbol:'X',assetClass:'equity',bars:bars(300,'2026-10-06',i=>i===290?null:1000),nowMs:preOpen}).volumeRatio).toBeNull();
  expect(buildPriceEvidence({symbol:'X',assetClass:'crypto',bars:bars(300,'2026-10-06',()=>null),nowMs:preOpen}).volumeRatio).toBeNull();
 });
 it('no bars: everything null, nothing invented',()=>{
  const e=buildPriceEvidence({symbol:'X',assetClass:'equity',bars:[],nowMs:preOpen});
  expect(e.close).toBeNull();expect(e.adx.adx).toBeNull();expect(e.summary).toEqual([]);expect(e.basis.lastCompletedBar).toBeNull();
 });
});

describe('Symbol payload',()=>{
 it('carries the evidence on the daily timeframe and not on intraday',()=>{
  const b=bars(300);
  const price={price:335.1,change:1,changePct:.3,high:336,low:333,volume:500,avgVolume:1000,priceTs:'2026-10-07T10:35:00Z',
   historicalCloses:b.map(x=>x.close),historicalHighs:b.map(x=>x.high),historicalLows:b.map(x=>x.low),historicalDates:b.map(x=>x.date),historicalVolumes:b.map(x=>x.volume)} as any;
  const daily=buildPayload('AAPL','equity',price,null,null,null,'1D',null,null,null,{timeframeKey:'daily',nowMs:preOpen});
  expect(daily.priceEvidence?.basis.lastCompletedBar).toBe('2026-10-06');
  expect(daily.priceEvidence?.quote?.price).toBe(335.1);
  expect(buildPayload('AAPL','equity',price,null,null,null,'1H',null,null,null,{timeframeKey:'1h',nowMs:preOpen}).priceEvidence).toBeNull();
 });
});
