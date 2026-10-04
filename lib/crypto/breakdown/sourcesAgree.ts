import {median} from './types';
export interface SourcePrice {name:string;price:number|null;asOf:string|null;basis:string}
export function sourcesAgree(prices:SourcePrice[],now=Date.now()){
 const fresh=prices.filter(p=>p.price!=null&&p.price>0&&p.asOf&&now-Date.parse(p.asOf)>=0&&now-Date.parse(p.asOf)<=15*60000);
 const sorted=[...fresh].sort((a,b)=>a.price!-b.price!),mid=median(fresh.map(p=>p.price!));
 const spreadPct=fresh.length>=2&&mid?(sorted.at(-1)!.price!-sorted[0].price!)/mid*100:null;
 return {label:fresh.length===0?'Not enough sources':fresh.length===1?'Single source':spreadPct!<=1?'Sources agree':'Sources differ',spreadPct,pair:sorted.length>=2?`${sorted[0].name} / ${sorted.at(-1)!.name}`:null,freshCount:fresh.length};
}
