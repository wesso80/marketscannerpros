import {describe,it,expect} from 'vitest';
import {V1,LOCKED_RULE_SHA_PREFIX,baseBreakoutV1,evaluateRules} from '@/lib/crypto/breakdown/baseBreakoutV1';
import {freshness} from '@/lib/crypto/breakdown/freshness';
import {normalizeCryptoSymbol,chartPoints,completedBars} from '@/lib/crypto/breakdown/symbol';
import {realAtr,levels} from '@/lib/crypto/breakdown/levels';
import {sourcesAgree} from '@/lib/crypto/breakdown/sourcesAgree';
import {regimeContext} from '@/lib/crypto/breakdown/regimeContext';
import {earlyContext} from '@/lib/crypto/breakdown/earlyContext';
import type {DailyBar} from '@/lib/crypto/breakdown/types';
const now=Date.parse('2026-10-04T01:00Z');
const bars=(n=61):DailyBar[]=>Array.from({length:n},(_,i)=>({t:new Date(now-3600000-(n-i)*86400000).toISOString(),open:100,high:102,low:98,close:100,volume:10000000}));
describe('locked crypto breakdown core',()=>{
 it('locks constants and rule identity',()=>{expect(V1).toEqual({baseDays:60,maxRangePct:35,volMultiple:3,closeMultiple:1.02,atrCap:3,atrPeriod:14,universeMinAdvUsd:5000000});expect(LOCKED_RULE_SHA_PREFIX).toBe('181d9024');});
 it('covers stages and does not include the observation in its base',()=>{
  expect(baseBreakoutV1(bars(60)).stage).toBe('NOT ENOUGH DATA');
  const a=bars();expect(baseBreakoutV1(a).stage).toBe('WATCH');
  a[60].close=103;a[60].high=104;a[60].volume=20000000;expect(baseBreakoutV1(a).stage).toBe('BROKE OUT, RULE NOT MET');
  a[60].volume=35000000;expect(baseBreakoutV1(a).stage).toBe('MEETS v1 RULES');expect(baseBreakoutV1(a).baseHigh).toBe(100);
  a[60].close=113;a[60].high=114;expect(baseBreakoutV1(a).stage).toBe('EXTENDED');
  a[60].close=103;a[60].high=104;a.push({...a[60],t:'2026-10-04T00:00:00Z',close:99,low:98});expect(baseBreakoutV1(a).stage).toBe('FELL BACK');
 });
 it('honors inclusive boundaries',()=>{
  expect(evaluateRules(35,3,1.02,3).every(x=>x)).toBe(true);expect(evaluateRules(35.01,3,1.02,3)[0]).toBe(false);
 });
 it('uses median volume and rejects zero baseline and missing true OHLC',()=>{
  const a=bars();a[0].volume=1e12;a[60].volume=35000000;expect(baseBreakoutV1(a).volumeRatio).toBe(3.5);
  a[0].volume=0;expect(baseBreakoutV1(a).volumeRatio).toBeNull();
  expect(realAtr(a.map(b=>({...b,high:null,low:null})))).toBeNull();
  expect(realAtr(bars(20))).toBe(4);expect(levels(a).atr).toBe(4);
 });
 it('records LINK reference as historical fixture, close-only versus lower lows',()=>{
  const a=bars();a.slice(0,60).forEach(b=>{b.close=15.440;b.low=8.143;b.high=16;});a[60].close=13.793;
  const r=baseBreakoutV1(a);expect(r.rangePct).toBeCloseTo(89.61,1);expect(r.stage).toBe('NO BASE');a[0].low=8;expect(baseBreakoutV1(a).rangePct!).toBeGreaterThan(r.rangePct!);
 });
 it('normalizes explicit pairs without corrupting CRVUSD',()=>{for(const s of ['LINK-USD','LINK/USDT','LINKUSDT'])expect(normalizeCryptoSymbol(s)).toBe('LINK');expect(normalizeCryptoSymbol('CRVUSD')).toBe('CRVUSD');expect(normalizeCryptoSymbol('BTC-USD')).toBe('BTC');});
 it('shifts chart close points once and excludes the open day',()=>{
  const a=bars();const points=a.map(b=>[Date.parse(b.t)+86400000,b.close] as [number,number]);expect(chartPoints(points,now).map(p=>p.t)).toEqual(a.map(b=>b.t));expect(completedBars([...a,{...a[0],t:'2026-10-04T00:00:00Z'}],now)).toHaveLength(61);
 });
 it.each([['spot',5,'Live'],['spot',15,'Degraded'],['spot',16,'Stale'],['okx',10,'Live'],['okx',30,'Degraded'],['okx',31,'Stale'],['venue',15,'Live'],['venue',45,'Degraded'],['venue',46,'Stale'],['slow',1440,'Last close'],['slow',4320,'Degraded'],['slow',4321,'Stale']] as const)('freshness %s %s', (kind,minutes,status)=>{expect(freshness(kind,new Date(now-minutes*60000).toISOString(),now).status).toBe(status);});
 it('daily freshness is based on completed UTC day, not fetch time',()=>{expect(freshness('daily','2026-10-03',now).status).toBe('Last close');expect(freshness('daily','2026-10-02',now).status).toBe('Degraded');expect(freshness('daily','2026-10-01',now).status).toBe('Stale');expect(freshness('spot',null,now)).toEqual({status:'Unknown',reason:'time unknown'});});
 it('compares only fresh sources, with median spread',()=>{
  const p=(price:number,age=1)=>({name:String(price),price,asOf:new Date(now-age*60000).toISOString(),basis:'USD'});
  const r=sourcesAgree([p(14.0877),p(14.094),p(14.128)],now);expect(r.label).toBe('Sources agree');expect(r.spreadPct).toBeCloseTo(.286,2);expect(sourcesAgree([p(14),p(14.2)],now).label).toBe('Sources differ');expect(sourcesAgree([p(14),p(14.2,20)],now).label).toBe('Single source');
 });
 it('aligns market caps by day, computes TOTAL3 and rule7 without gates on the coin',()=>{
  const p=(v:number,i:number)=>({t:new Date(now-(40-i)*86400000).toISOString(),value:v});
  const g=Array.from({length:35},(_,i)=>p(1000,i));const btc=g.map((p,i)=>({...p,value:600-i*5}));const eth=g.map(p=>({...p,value:200}));
  const r=regimeContext(g,btc,eth,btc);expect(r.total3[0].value).toBe(200);expect(r.rule7).toBe(true);
  expect(regimeContext(g,btc.map((p,i)=>({...p,value:400+i*5})),eth,btc).rule7).toBe(false);
 });
 it('early context requires full daily windows and date alignment',()=>{const r=earlyContext(bars(),[],[],[]);expect(r.volume90).toBeNull();expect(r.volume7).toBe(1e7);expect(r.relative.every(x=>x.excessPct===null)).toBe(true);});
});

it('uses research wording without forecast language',()=>{for(const n of [0,60,61])expect(JSON.stringify(baseBreakoutV1(bars(n)))).not.toMatch(/\b(buy|sell|likely|probability)\b|about to|expected to|entry signal/i);});
