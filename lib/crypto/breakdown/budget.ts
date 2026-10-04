import {getRedis} from '@/lib/redis';
import type {BudgetState} from './types';
export const LIMITS={own:1500,app:4500};
const keys=(now:number)=>{const day=new Date(now).toISOString().slice(0,10);return [`crypto-breakdown:cg:day:${day}`,`admin:cg-credits:v1:day:${day}`,`crypto-breakdown:cg:reserved-app:${day}`];};
/** Atomic, pessimistic reservation covers ALL hidden retries in existing helpers (at most four HTTP attempts).
 * The existing cgFetch records actual attempts independently. No shared helper or global fetch is patched.
 * Unused retry slots are intentionally not refunded: the public page cannot overspend its own ceiling.
 * Other app jobs are outside this guard; this is not a site-wide enforcement mechanism.
 */
export const RESERVE_LUA=`
local own=tonumber(redis.call('GET',KEYS[1]) or '0')
local app=tonumber(redis.call('GET',KEYS[2]) or '0')
local shadow=math.max(app,tonumber(redis.call('GET',KEYS[3]) or '0'))
local n=tonumber(ARGV[1])
if own+n>1500 or shadow+n>4500 then return {0,own,app} end
redis.call('SET',KEYS[1],own+n,'EX',172800)
redis.call('SET',KEYS[3],shadow+n,'EX',172800)
return {1,own+n,app}`;
export async function reserveBudget(attemptCeiling:number,now=Date.now()){
 const r=getRedis();if(!r)throw new Error('CoinGecko accounting unavailable; cached data only');
 if(!Number.isInteger(attemptCeiling)||attemptCeiling<1)throw new Error('Invalid call reservation');
 const result=await r.eval<number[]>(RESERVE_LUA,keys(now),[attemptCeiling]);
 if(!Array.isArray(result)||result[0]!==1)throw new Error('CoinGecko daily limit reached; cached data only');
}
export async function budgetStatus(now=Date.now()):Promise<BudgetState>{
 const accounting='reserved HTTP-attempt ceiling' as const;
 try{const r=getRedis();if(!r)throw Error('accounting unavailable');const [a,b,c]=await Promise.all(keys(now).map(k=>r.get<number>(k)));const own=Number(a??0),app=Number(b??0),shadow=Number(c??0);if(![own,app,shadow].every(Number.isFinite))throw Error('invalid accounting');return {breakdownToday:own,appToday:app,capped:own>=1500||Math.max(app,shadow)>=4500,accounting};}
 catch{return {breakdownToday:null,appToday:null,capped:true,reason:'CoinGecko accounting unavailable; cached data only',accounting};}
}
