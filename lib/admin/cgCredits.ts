import {getRedis} from '@/lib/redis';
/**
 * CoinGecko credit accounting. CoinGecko's own /key endpoint is the source of truth; the local counter (every HTTP
 * attempt made through lib/coingecko cgFetch, including retries) is shown alongside it and used only as a labelled
 * estimate when /key is unavailable. Allowance and pause threshold are env-configurable.
 */
export const CG_BUDGET={
 monthlyCredits:Number(process.env.CG_MONTHLY_CREDITS)>0?Number(process.env.CG_MONTHLY_CREDITS):500000,
 pauseBelowPct:Number(process.env.CG_PAUSE_BELOW_PCT)>0?Number(process.env.CG_PAUSE_BELOW_PCT):15,
 /** REST: 1 credit per call (docs.coingecko.com/docs/data-delivery-methods; webhooks are 10 per event, WebSocket 0.1 per response). */
 creditsPerCall:1,
 keyCacheSeconds:600,
};
const P='admin:cg-credits:v1',KEY_CACHE=`${P}:key`;
const monthOf=(t:number)=>new Date(t).toISOString().slice(0,7),dayOf=(t:number)=>new Date(t).toISOString().slice(0,10);
/** Fire-and-forget; never throws and never delays the request it counts. */
export function recordCgCall(family:string,now=Date.now()){
 try{
  const r=getRedis();if(!r)return;
  const m=`${P}:month:${monthOf(now)}`,d=`${P}:day:${dayOf(now)}`,f=`${P}:family:${dayOf(now)}`;
  void Promise.all([r.incrby(m,CG_BUDGET.creditsPerCall),r.expire(m,40*86400),r.incrby(d,CG_BUDGET.creditsPerCall),r.expire(d,8*86400),r.hincrby(f,family,CG_BUDGET.creditsPerCall),r.expire(f,8*86400)]).catch(()=>undefined);
 }catch{/* counting must never break a provider call */}
}
export type CgKeyInfo={plan?:string;rate_limit_request_per_minute?:number;monthly_call_credit?:number;current_total_monthly_calls?:number;current_remaining_monthly_calls?:number};
export type CgBudget={checkedAt:string;source:'coingecko /key'|'local estimate (/key unavailable)';plan:string|null;allowance:number;used:number;remaining:number;remainingPct:number;pauseBelowPct:number;pauseNonEssential:boolean;local:{month:number;today:number;todayByFamily:Record<string,number>};keyCheckedAt:string|null};
/** Pure: combines /key (preferred) with the local counter. Missing /key fields fall back to the local estimate, labelled. */
export function assessBudget(key:CgKeyInfo|null,local:CgBudget['local'],keyCheckedAt:string|null,now=Date.now(),cfg=CG_BUDGET):CgBudget{
 const ok=!!key&&Number.isFinite(key.monthly_call_credit)&&Number(key.monthly_call_credit)>0&&Number.isFinite(key.current_remaining_monthly_calls);
 const allowance=ok?Number(key!.monthly_call_credit):cfg.monthlyCredits;
 const remaining=ok?Math.max(0,Number(key!.current_remaining_monthly_calls)):Math.max(0,allowance-local.month);
 const used=ok&&Number.isFinite(key!.current_total_monthly_calls)?Number(key!.current_total_monthly_calls):allowance-remaining;
 const remainingPct=allowance>0?remaining/allowance*100:0;
 return {checkedAt:new Date(now).toISOString(),source:ok?'coingecko /key':'local estimate (/key unavailable)',plan:key?.plan??null,allowance,used,remaining,remainingPct,pauseBelowPct:cfg.pauseBelowPct,pauseNonEssential:remainingPct<cfg.pauseBelowPct,local,keyCheckedAt:ok?keyCheckedAt:null};
}
/** /key is cached for 10 minutes so checking the budget costs at most 144 calls a day. */
export async function cgBudgetStatus(fetchKey:()=>Promise<unknown>,now=Date.now()):Promise<CgBudget>{
 const r=getRedis();
 let cached=await r?.get<{at:string;key:CgKeyInfo}>(KEY_CACHE).catch(()=>null)??null;
 if(!cached||now-Date.parse(cached.at)>CG_BUDGET.keyCacheSeconds*1000){
  const key=await fetchKey().catch(()=>null) as CgKeyInfo|null;
  if(key&&typeof key==='object'&&'monthly_call_credit' in key){cached={at:new Date(now).toISOString(),key};await r?.set(KEY_CACHE,cached,{ex:CG_BUDGET.keyCacheSeconds}).catch(()=>undefined);}
 }
 const [month,today,fam]=await Promise.all([r?.get<number>(`${P}:month:${monthOf(now)}`),r?.get<number>(`${P}:day:${dayOf(now)}`),r?.hgetall<Record<string,number>>(`${P}:family:${dayOf(now)}`)].map(p=>Promise.resolve(p).catch(()=>null)));
 return assessBudget(cached?.key??null,{month:Number(month)||0,today:Number(today)||0,todayByFamily:(fam as Record<string,number>|null)??{}},cached?.at??null,now);
}
