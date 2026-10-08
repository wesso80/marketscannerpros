import type {TopFacts} from './top';
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
/**
 * How the coin was identified and which ticker-matched sources were bound to it (W2 / C02). CoinGecko data is fetched
 * by coin id; OKX and Yahoo are matched by ticker. They are combined only when the id is verified and the venue is
 * shown to list that same coin; otherwise they are left out and the reason is given.
 */
export interface IdentityCheck {
 coinId:string;source:'explicit id'|'symbol map'|'symbol search';matches:number|null;
 /** CoinGecko coin detail confirms the id denotes the requested ticker. */
 verified:boolean;
 /** More than one coin shares the ticker and the id came from a symbol search. */
 ambiguous:boolean;reason:string;
 okx:{instrument:string;bound:boolean;reason:string};
 /** Yahoo has no coin id: bound only when the static ticker map names this exact id (W2-R1). */
 yahoo:{bound:boolean;reason:string};
}
export interface Breakdown {
 top?:TopFacts; symbol:string;coinId:string|null;name:string|null;rank:number|null;identityMatches:number|null;identity?:IdentityCheck;generatedAt:string;sections:Record<SectionKey,Section>;budget:BudgetState }
export const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
export const mean=(v:number[])=>v.length?v.reduce((s,n)=>s+n,0)/v.length:null;
export const median=(v:number[])=>{const a=[...v].sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
