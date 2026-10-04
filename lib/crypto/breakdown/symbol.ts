import type {DailyBar,Point} from './types';
export const DAY=86400000;
export function normalizeCryptoSymbol(input:string):string{
 const s=input.trim().toUpperCase();
 // USD without a separator is ambiguous (CRVUSD is a coin); USDT is the scanner's explicit concatenated pair form.
 return s.replace(/[-/](?:USDT|USDC|USD)$/,'').replace(/USDT$/,'');
}
export function completedBars(bars:DailyBar[],now=Date.now()):DailyBar[]{
 return [...new Map(bars.filter(b=>Number.isFinite(Date.parse(b.t))&&Date.parse(b.t)%DAY===0&&Date.parse(b.t)+DAY<=now&&b.close>0).map(b=>[b.t,b])).values()].sort((a,b)=>Date.parse(a.t)-Date.parse(b.t));
}
/** Provider daily chart points at midnight describe the previous UTC day. Ignore intraday/live points. */
export function chartPoints(points:[number,number][]|undefined,now=Date.now()):Point[]{
 return [...new Map((points??[]).filter(([t,v])=>t%DAY===0&&t<=now&&Number.isFinite(v)&&v>0).map(([t,value])=>{const p={t:new Date(t-DAY).toISOString(),value};return [p.t,p] as const;})).values()].sort((a,b)=>a.t.localeCompare(b.t));
}
export function contiguous<T extends {t:string}>(rows:T[]):boolean{return rows.every((r,i)=>i===0||Date.parse(r.t)-Date.parse(rows[i-1].t)===DAY);}
