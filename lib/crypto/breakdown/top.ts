import type {baseBreakoutV1} from './baseBreakoutV1';
import type {levels} from './levels';
import type {Breakdown,DailyBar,Metric,Section} from './types';
export type TopRule=ReturnType<typeof baseBreakoutV1>;
export type TopLevels=ReturnType<typeof levels>;
export interface TopFacts {
 name:string|null; symbol:string; stage:TopRule['stage']; rule:TopRule;
 spot:Metric|null; change24h:Metric|null; funding:Metric|null; fundingInterval:Metric|null;
 openInterest:Metric|null; oiChange24h:Metric|null; perpetualListed:Metric|null; rank:Metric|null;
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
  daily:{source,asOf,basis,status,reason},chart:{bars:bars.slice(-90).map(({t,close,high,low})=>({t,close,high,low})),baseHigh:rule.baseHigh,baseLow:rule.baseLow,ruleStop:l.ruleStop}};
}
export const STAGE_TONE:Record<TopRule['stage'],string>={
 'NOT ENOUGH DATA':'var(--msp-text-muted)', 'NO BASE':'var(--msp-flat)', WATCH:'var(--msp-info)',
 'BROKE OUT, RULE NOT MET':'var(--msp-warn)', 'MEETS v1 RULES':'var(--msp-warn)', EXTENDED:'var(--msp-warn)', 'FELL BACK':'var(--msp-warn)',
};
