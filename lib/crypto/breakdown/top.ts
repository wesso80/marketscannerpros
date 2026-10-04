import {V1} from './baseBreakoutV1';
import {COPY} from '@/components/crypto/copy';
import type {baseBreakoutV1} from './baseBreakoutV1';
import type {levels} from './levels';
import type {Breakdown,DailyBar,Metric,Section} from './types';
export type TopRule=ReturnType<typeof baseBreakoutV1>;
export type TopLevels=ReturnType<typeof levels>;
export interface TopFacts {
 name:string|null; symbol:string; stage:TopRule['stage']; rule:TopRule;
 spot:Metric|null; change24h:Metric|null; funding:Metric|null; fundingInterval:Metric|null;
 openInterest:Metric|null; oiChange24h:Metric|null; perpetualListed:Metric|null; rank:Metric|null;
 derivatives:Pick<Section,'source'|'asOf'|'basis'|'status'|'reason'>;
 daily:Pick<Section,'source'|'asOf'|'basis'|'status'|'reason'>;
 chart:{bars:Pick<DailyBar,'t'|'close'|'high'|'low'>[];baseHigh:number|null;baseLow:number|null;ruleStop:number|null};
}
export function buildTop(input:{name:string|null;symbol:string;rank:number|null;rule:TopRule;levels:TopLevels;bars:DailyBar[];sections:Breakdown['sections']}):TopFacts {
 const {name,symbol,rule,levels:l,bars,sections:s}=input;
 const find=(section:Section,label:string)=>section.value?.metrics.find(m=>m.label===label)??null;
 const {source,asOf,basis,status,reason}=s.ruleCheck;
 return {name,symbol,stage:rule.stage,rule,spot:find(s.price,'Spot'),change24h:find(s.price,'Change vs 24h ago'),
  funding:find(s.derivatives,'Funding, 8h-equivalent'),fundingInterval:find(s.derivatives,'Funding interval (hours)'),
  openInterest:find(s.derivatives,'Open interest (USD)'),oiChange24h:find(s.derivatives,'Open interest change, 24h'),perpetualListed:find(s.derivatives,'Perpetual listed'),rank:find(s.supply,'Market-cap rank'),
  derivatives:{source:s.derivatives.source,asOf:s.derivatives.asOf,basis:s.derivatives.basis,status:s.derivatives.status,reason:s.derivatives.reason},daily:{source,asOf,basis,status,reason},chart:{bars:bars.slice(-90).map(({t,close,high,low})=>({t,close,high,low})),baseHigh:rule.baseHigh,baseLow:rule.baseLow,ruleStop:l.ruleStop}};
}
export const STAGE_TONE:Record<TopRule['stage'],string>={
 'NOT ENOUGH DATA':'var(--msp-text-muted)', 'NO BASE':'var(--msp-flat)', WATCH:'var(--msp-info)',
 'BROKE OUT, RULE NOT MET':'var(--msp-warn)', 'MEETS v1 RULES':'var(--msp-warn)', EXTENDED:'var(--msp-warn)', 'FELL BACK':'var(--msp-warn)',
};

const c=COPY.top;
export function topNumber(value:number|null,kind:'percent'|'multiple'|'atr'|'ratio'|'price'){
 return value==null||!Number.isFinite(value)?c.unavailable:c[kind](value);
}
export function ruleChips(rule:TopRule){
 const values=[rule.rangePct,rule.volumeRatio,rule.closeRatio,rule.extension];
 const formats=['percent','multiple','ratio','atr'] as const;
 const limits=[c.maxLimit(topNumber(V1.maxRangePct,'percent')),c.minLimit(topNumber(V1.volMultiple,'multiple')),c.minLimit(topNumber(V1.closeMultiple,'ratio')),c.maxLimit(topNumber(V1.atrCap,'atr'))];
 return values.map((v,i)=>({name:c.chipNames[i],value:topNumber(v,formats[i]),limit:limits[i],pass:v==null||!Number.isFinite(v)?null:rule.passes[i]}));
}
export function verdictLine(r:TopRule){
 const date=r.asOf&&Number.isFinite(Date.parse(r.asOf))?new Date(r.asOf).toISOString().slice(0,10):COPY.unknown;
 let line:string;
 switch(r.stage){
  case 'NOT ENOUGH DATA':line=c.insufficientLine(r.bars,V1.baseDays+1);break;
  case 'NO BASE':line=c.noBase(topNumber(r.rangePct,'percent'),V1.maxRangePct,topNumber(r.volumeRatio,'multiple'),V1.volMultiple);break;
  case 'WATCH':line=c.watch(topNumber(r.rangePct,'percent'),V1.maxRangePct,topNumber(r.distancePct==null?null:-r.distancePct,'percent'),topNumber(r.requiredClose,'price'));break;
  case 'BROKE OUT, RULE NOT MET':line=c.brokeOut(ruleChips(r).filter(chip=>chip.pass!==true).map(chip=>c.failedRule(chip.name,chip.value,chip.limit)).join('; '));break;
  case 'MEETS v1 RULES':line=c.meets(c.utcDay(date));break;
  case 'EXTENDED':line=c.extended(topNumber(r.extension,'atr'),V1.atrCap);break;
  case 'FELL BACK':line=c.fellBack;break;
 }
 return `${line} ${c.lastBar(date)}`;
}
