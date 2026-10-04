export type TrustStatus = 'Live' | 'Last close' | 'Stale' | 'Degraded' | 'Unknown';
export type FreshnessKind = 'spot' | 'daily' | 'okx' | 'slow' | 'venue';
export interface Stamped<T> { value:T|null; source:string; asOf:string|null; basis:string; status:TrustStatus; reason?:string }
export interface DailyBar { t:string; open?:number|null; high:number|null; low:number|null; close:number; volume:number|null }
export interface Point { t:string; value:number }
export interface Metric extends Stamped<number|string|boolean> { label:string; unit?:'price'|'percent'|'ratio'|'usd'|'count'; }
export interface SectionValue { metrics:Metric[]; notes:string[]; stage?:string }
export type Section = Stamped<SectionValue>;
export const SECTION_KEYS=['price','ruleCheck','earlyContext','marketContext','derivatives','liquidity','supply','levels','risks','sourcesCheck'] as const;
export type SectionKey=typeof SECTION_KEYS[number];
export interface BudgetState { breakdownToday:number|null; appToday:number|null; capped:boolean; reason?:string; accounting:'reserved HTTP-attempt ceiling' }
export interface Breakdown { symbol:string;coinId:string|null;name:string|null;rank:number|null;identityMatches:number|null;generatedAt:string;sections:Record<SectionKey,Section>;budget:BudgetState }
export const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
export const mean=(v:number[])=>v.length?v.reduce((s,n)=>s+n,0)/v.length:null;
export const median=(v:number[])=>{const a=[...v].sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
