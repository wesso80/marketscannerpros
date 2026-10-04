import {atrSeries} from '@/lib/ta/core';
import {finite} from './types';
import type {DailyBar} from './types';
import {contiguous} from './symbol';
export function realAtr(bars:DailyBar[],period=14):number|null{
 if(bars.length<period+1||!contiguous(bars)||bars.some(b=>!finite(b.high)||!finite(b.low)||b.high<b.close||b.low>b.close||b.low<=0))return null;
 const a=atrSeries(bars.map(b=>b.high!),bars.map(b=>b.low!),bars.map(b=>b.close),period).at(-1);
 return finite(a)?a:null;
}
export function highestClose(bars:DailyBar[],days:number){const a=bars.slice(-days);return a.length===days&&contiguous(a)?Math.max(...a.map(b=>b.close)):null;}
export function levels(bars:DailyBar[]){
 const base=bars.slice(-61,-1),last=bars.at(-1)?.close??null;
 const high=base.length===60?Math.max(...base.map(b=>b.close)):null;
 const low=base.length===60&&base.every(b=>finite(b.low)&&b.low>0)?Math.min(...base.map(b=>b.low!)):null;
 const midpoint=high!=null&&low!=null?(high+low)/2:null,atr=realAtr(bars);
 const stop=last!=null&&midpoint!=null?Math.max(midpoint,.85*last):null;
 const named={baseHigh:high,baseMidpoint:midpoint,baseLow:low,high90:highestClose(bars,90),high365:highestClose(bars,365),ruleStop:stop};
 const label:Record<string,string>={baseHigh:'Base high',baseMidpoint:'Base midpoint',baseLow:'Base low',high90:'90-day high',high365:'365-day high',ruleStop:'Rule stop'};
 return {atr,atrPct:atr!=null&&last?atr/last*100:null,baseAtr:realAtr(base),...named,distances:Object.entries(named).map(([name,value])=>({name:label[name]??name,value,dollars:value!=null&&last!=null?last-value:null,pct:value&&last!=null?(last/value-1)*100:null,atr:value!=null&&last!=null&&atr? (last-value)/atr:null}))};
}
