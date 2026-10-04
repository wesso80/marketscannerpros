import {median,mean,finite} from './types';
import type {DailyBar} from './types';
import {realAtr} from './levels';
import {contiguous} from './symbol';
export const LOCKED_RULE_SHA_PREFIX='181d9024';
export const V1=Object.freeze({baseDays:60,maxRangePct:35,volMultiple:3,closeMultiple:1.02,atrCap:3,atrPeriod:14,universeMinAdvUsd:5_000_000});
export type Stage='NOT ENOUGH DATA'|'NO BASE'|'WATCH'|'BROKE OUT, RULE NOT MET'|'MEETS v1 RULES'|'EXTENDED'|'FELL BACK';
export function evaluateRules(range:number|null,volume:number|null,closeRatio:number|null,extension:number|null){
 const e=1e-10;return [range!=null&&range<=V1.maxRangePct+e,volume!=null&&volume+e>=V1.volMultiple,closeRatio!=null&&closeRatio+e>=V1.closeMultiple,extension!=null&&extension<=V1.atrCap+e];
}
function assess(bars:DailyBar[]){
 const base=bars.slice(-61,-1),last=bars.at(-1),enough=base.length===60&&contiguous(bars.slice(-61));
 const baseHigh=enough?Math.max(...base.map(b=>b.close)):null;
 const baseLow=enough&&base.every(b=>finite(b.low)&&b.low>0)?Math.min(...base.map(b=>b.low!)):null;
 const closeLow=enough?Math.min(...base.map(b=>b.close)):null;
 const rangePct=baseHigh!=null&&baseLow?(baseHigh/baseLow-1)*100:null;
 const medianVolume=enough&&base.every(b=>finite(b.volume)&&b.volume>0)?median(base.map(b=>b.volume!)):null;
 const volumeRatio=medianVolume&&finite(last?.volume)?last!.volume!/medianVolume:null;
 const baseAtr=realAtr(base),extension=baseHigh!=null&&last&&baseAtr?(last.close-baseHigh)/baseAtr:null;
 const closeRatio=baseHigh&&last?last.close/baseHigh:null;
 const advBars=bars.slice(-30);const adv30=advBars.length===30&&advBars.every(b=>finite(b.volume)&&b.volume>0)?mean(advBars.map(b=>b.volume!)):null;
 const passes=evaluateRules(rangePct,volumeRatio,closeRatio,extension);
 let stage:Stage=!enough?'NOT ENOUGH DATA':rangePct==null?'NOT ENOUGH DATA':!passes[0]?'NO BASE':last!.close<=baseHigh!?'WATCH':extension!=null&&extension>3?'EXTENDED':passes.every(Boolean)?'MEETS v1 RULES':'BROKE OUT, RULE NOT MET';
 return {stage:stage as Stage,bars:bars.length,asOf:last?.t??null,baseHigh,baseLow,rangePct,closeOnlyRangePct:baseHigh&&closeLow?(baseHigh/closeLow-1)*100:null,medianVolume,volumeRatio,baseAtr,extension,closeRatio,distancePct:closeRatio!=null?(closeRatio-1)*100:null,requiredClose:baseHigh?baseHigh*1.02:null,requiredVolume:medianVolume?medianVolume*3:null,adv30,passes};
}
export function baseBreakoutV1(bars:DailyBar[]){
 const r=assess(bars);
 if(r.bars>=62)for(let ago=1;ago<=5;ago++){
  const old=assess(bars.slice(0,-ago));
  if(old.stage==='MEETS v1 RULES'&&old.baseHigh!=null&&bars.at(-1)!.close<old.baseHigh){r.stage='FELL BACK';break;}
 }
 const f=(v:number|null)=>v==null?'unavailable':v.toFixed(2);
 const why=[`Base range ${f(r.rangePct)}% (rule: 35% or less). ${r.passes[0]?'Meets':'Does not meet'}.`,`Volume ratio ${f(r.volumeRatio)}x (rule: 3x or more). ${r.passes[1]?'Meets':'Does not meet'}.`,`Close / base high ${f(r.closeRatio)} (rule: 1.02 or more); extension ${f(r.extension)} ATR (rule: 3 or less).`];
 if(r.bars<61)why.unshift(`Has ${r.bars} bars, needs 61 (60 base + the last bar).`);
 if(r.medianVolume==null)why.push('Volume baseline unavailable.');
 if(!contiguous(bars.slice(-61)))why.push('Daily history has gaps; the rule is not evaluated across missing days.');
 return {...r,why};
}
