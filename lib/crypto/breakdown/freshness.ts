import type {FreshnessKind,TrustStatus} from './types';
export const THRESHOLDS={spot:[5,15],okx:[10,30],venue:[15,45],slow:[1440,4320]} as const;
/** Same skew already used when a venue clock is slightly ahead of ours (ticker last-trade reject). */
export const OBSERVATION_FUTURE_SKEW_MS=60_000;
const dateOnly=(asOf:string)=>/^\d{4}-\d{2}-\d{2}$/.test(asOf);
/**
 * A stamp a few seconds ahead of the evaluation clock is clock skew, not a future observation.
 * Anything further ahead is not a usable observation time: drop it so the UI cannot render that clock.
 * Date-only daily labels are not instants; daily freshness decides those.
 */
export function settleObservationTime(asOf:string|null|undefined,now=Date.now(),kind?:FreshnessKind):{asOf:string|null;future:boolean}{
 if(!asOf)return {asOf:null,future:false};
 if(kind==='daily'||dateOnly(asOf))return {asOf,future:false};
 const t=Date.parse(asOf);
 if(!Number.isFinite(t))return {asOf,future:false};
 if(t>now+OBSERVATION_FUTURE_SKEW_MS)return {asOf:null,future:true};
 if(t>now)return {asOf:new Date(now).toISOString(),future:false};
 return {asOf,future:false};
}
export function freshness(kind:FreshnessKind,asOf:string|null|undefined,now=Date.now(),future=false):{status:TrustStatus;reason:string}{
 if(future)return {status:'Unknown',reason:'observation time is in the future'};
 const t=asOf?Date.parse(asOf):NaN;
 if(!Number.isFinite(t))return {status:'Unknown',reason:'time unknown'};
 if(kind==='daily'){
  const day=Math.floor(t/86400000), expected=Math.floor((now-15*60000)/86400000)-1;
  const lag=expected-day;
  if(day>=Math.floor(now/86400000))return {status:'Unknown',reason:'daily bar is not completed'};
  return {status:lag<=0?'Last close':lag===1?'Degraded':'Stale',reason:`completed UTC day ${asOf!.slice(0,10)}; ${Math.max(0,lag)} days behind expected`};
 }
 if(t>now+OBSERVATION_FUTURE_SKEW_MS)return {status:'Unknown',reason:'observation time is in the future'};
 const minutes=(now-Math.min(t,now))/60000,[good,late]=THRESHOLDS[kind];
 return {status:minutes<=good?(kind==='slow'?'Last close':'Live'):minutes<=late?'Degraded':'Stale',reason:`${Math.floor(minutes)} min old${kind==='slow'?' · daily-updated field':''}`};
}
