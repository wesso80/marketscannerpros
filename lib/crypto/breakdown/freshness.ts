import type {FreshnessKind,TrustStatus} from './types';
export const THRESHOLDS={spot:[5,15],okx:[10,30],venue:[15,45],slow:[1440,4320]} as const;
export function freshness(kind:FreshnessKind,asOf:string|null|undefined,now=Date.now()):{status:TrustStatus;reason:string}{
 const t=asOf?Date.parse(asOf):NaN;
 if(!Number.isFinite(t))return {status:'Unknown',reason:'time unknown'};
 if(t>now)return {status:'Unknown',reason:'observation time is in the future'};
 if(kind==='daily'){
  const day=Math.floor(t/86400000), expected=Math.floor((now-15*60000)/86400000)-1;
  const lag=expected-day;
  if(day>=Math.floor(now/86400000))return {status:'Unknown',reason:'daily bar is not completed'};
  return {status:lag<=0?'Last close':lag===1?'Degraded':'Stale',reason:`completed UTC day ${asOf!.slice(0,10)}; ${Math.max(0,lag)} days behind expected`};
 }
 const minutes=(now-t)/60000,[good,late]=THRESHOLDS[kind];
 return {status:minutes<=good?(kind==='slow'?'Last close':'Live'):minutes<=late?'Degraded':'Stale',reason:`${Math.floor(minutes)} min old${kind==='slow'?' · daily-updated field':''}`};
}
