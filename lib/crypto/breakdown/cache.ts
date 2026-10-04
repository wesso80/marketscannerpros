import {getCached,setCached} from '@/lib/redis';
import {reserveBudget} from './budget';
const flights=new Map<string,Promise<unknown>>();
export function resetFlights(){flights.clear();}
export function dayTtl(now=Date.now()){
 const todayBoundary=Math.floor(now/86400000)*86400000+15*60000;
 const next=now<todayBoundary?todayBoundary:todayBoundary+86400000;
 return Math.max(1,Math.floor((next-now)/1000));
}
export async function timebox<T>(p:Promise<T>,ms=8000):Promise<T>{let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([p,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('Source timeout after 8 seconds')),ms);})]);}finally{clearTimeout(timer);}}
interface CacheValue<T>{value:T;expiresAt:number}
/** Cache retains original provider times, plus a separate expiry. Stale fallback survives for seven days. */
export async function cachedPart<T>(key:string,ttl:number,attemptCeiling:number,fetcher:()=>Promise<T>,now=Date.now()):Promise<T>{
 const full=`crypto-breakdown:v1:${key}`;
 const cached=await getCached<CacheValue<T>>(full);
 if(cached&&cached.expiresAt>now)return cached.value;
 let pending=flights.get(full) as Promise<T>|undefined;
 if(!pending){
  pending=(async()=>{if(attemptCeiling)await reserveBudget(attemptCeiling);const value=await fetcher();if(value==null)throw Error('Provider returned no data');await setCached(full,{value,expiresAt:Date.now()+ttl*1000},Math.max(ttl,7*86400));return value;})();
  flights.set(full,pending);void pending.finally(()=>flights.delete(full)).catch(()=>undefined);
 }
 try{return await timebox(pending);}catch(error){if(cached)return cached.value;throw error;}
}
