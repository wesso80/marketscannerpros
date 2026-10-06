/**
 * Token and call roll-up for AI Gateway (Jev) requests. Measurement only.
 * Prices are never assumed. A missing or non-numeric unit price stays null and the display says so.
 */
export const JEV_USAGE_INDEX='admin:crypto-markets:jev-usage:v1:index';
export const JEV_USAGE_TTL_SEC=90*86400;
/** Newest index members only. Six modules across the 90-day TTL fit; a runaway index cannot fan out without a bound. */
export const JEV_USAGE_READ_CAP=600;
const USAGE_MODULES=['jev-shadow','jev-chart','jev-catalyst','jev-backtest','equity-news','transcript-audit'] as const;
export type JevUsageModule=typeof USAGE_MODULES[number]|string;
export type JevUsageEvent={module:string;at:string;inputTokens:number|null;outputTokens:number|null};
export type JevUsageBucket={scope:string;module:string;day:string;calls:number;inputTokens:number;outputTokens:number};
export type JevUnitPrice={inputUsdPerMillion:number|null;outputUsdPerMillion:number|null;label:string};
export type UsageRedis={
 incr?:(key:string)=>Promise<unknown>;
 incrby?:(key:string,by:number)=>Promise<unknown>;
 sadd?:(key:string,member:string)=>Promise<unknown>;
 expire?:(key:string,seconds:number)=>Promise<unknown>;
 smembers?:(key:string)=>Promise<string[]>;
 get?:(key:string)=>Promise<unknown>;
};
const usageKey=(day:string,module:string,part:'calls'|'input'|'output')=>`admin:crypto-markets:jev-usage:v1:${day}:${module}:${part}`;
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:typeof v==='string'&&v.trim()&&Number.isFinite(Number(v))?Number(v):null;
/** Empty, blank, or not a finite number at or above 0 → null. Zero is an explicit configured price, not a guess. */
export function parseUsdPerMillion(raw:string|undefined|null):number|null{
 if(raw==null)return null;
 const text=raw.trim();
 if(!text)return null;
 const n=Number(text);
 return Number.isFinite(n)&&n>=0?n:null;
}
export function jevUnitPrice(env:NodeJS.ProcessEnv=process.env):JevUnitPrice{
 const inputUsdPerMillion=parseUsdPerMillion(env.JEV_USD_PER_MILLION_INPUT_TOKENS);
 const outputUsdPerMillion=parseUsdPerMillion(env.JEV_USD_PER_MILLION_OUTPUT_TOKENS);
 const label=inputUsdPerMillion==null&&outputUsdPerMillion==null
  ?'Unit price not configured. Tokens and calls are shown without a cost. Set JEV_USD_PER_MILLION_INPUT_TOKENS, and optionally JEV_USD_PER_MILLION_OUTPUT_TOKENS, to a USD amount per million tokens. No price is assumed.'
  :'Cost uses the configured USD per million tokens only. It is not an invoice from the gateway.';
 return {inputUsdPerMillion,outputUsdPerMillion,label};
}
export function usageCost(inputTokens:number,outputTokens:number,price:JevUnitPrice):{usd:number|null;inputUsd:number|null;outputUsd:number|null;partial:boolean}{
 const inputUsd=price.inputUsdPerMillion==null?null:inputTokens/1e6*price.inputUsdPerMillion;
 const outputUsd=price.outputUsdPerMillion==null?null:outputTokens/1e6*price.outputUsdPerMillion;
 if(inputUsd==null&&outputUsd==null)return {usd:null,inputUsd:null,outputUsd:null,partial:false};
 return {usd:(inputUsd??0)+(outputUsd??0),inputUsd,outputUsd,partial:inputUsd==null||outputUsd==null};
}
/** Groups call events by day and module. Days are the UTC date on `at`. */
export function rollupJevUsage(events:JevUsageEvent[],scope='recorded'):JevUsageBucket[]{
 const map=new Map<string,JevUsageBucket>();
 for(const event of events){
  const day=(event.at||'').slice(0,10)||'unknown';
  const key=`${day}|${event.module}`;
  const row=map.get(key)??{scope,module:event.module,day,calls:0,inputTokens:0,outputTokens:0};
  row.calls++;
  if(event.inputTokens!=null&&Number.isFinite(event.inputTokens))row.inputTokens+=event.inputTokens;
  if(event.outputTokens!=null&&Number.isFinite(event.outputTokens))row.outputTokens+=event.outputTokens;
  map.set(key,row);
 }
 return [...map.values()].sort((a,b)=>b.day.localeCompare(a.day)||a.module.localeCompare(b.module));
}
export type StoredStamp={scope:string;module:string;checkedAt?:string|null;inputTokens?:number|null;status?:string|null};
/** Tokens already sitting on saved stamps, kept separate per scope so a scan row copied into the forward book is not added twice. One scored stamp is one call. A scored stamp with no usage figure counts as a call and adds 0 tokens. */
export function rollupStoredStamps(stamps:StoredStamp[]):JevUsageBucket[]{
 const scopes=new Map<string,StoredStamp[]>();
 for(const stamp of stamps){const list=scopes.get(stamp.scope)??[];list.push(stamp);scopes.set(stamp.scope,list);}
 return [...scopes.entries()].flatMap(([scope,list])=>rollupJevUsage(list.filter(s=>s.status==='scored'||typeof s.inputTokens==='number').map(s=>({module:s.module,at:s.checkedAt||'',inputTokens:typeof s.inputTokens==='number'?s.inputTokens:null,outputTokens:null})),scope));
}
async function redisIfConfigured():Promise<UsageRedis|null>{
 if(!process.env.UPSTASH_REDIS_REST_URL||!process.env.UPSTASH_REDIS_REST_TOKEN)return null;
 try{const {getRedis}=await import('@/lib/redis');return getRedis();}catch{return null;}
}
/** Best-effort per-call counter. Never throws. No-ops when Redis is not configured. Does not log token values or keys. */
export async function recordJevUsage(event:JevUsageEvent,redis?:UsageRedis|null):Promise<void>{
 try{
  const client=redis===undefined?await redisIfConfigured():redis;
  if(!client||typeof client.incr!=='function')return;
  const day=(event.at||new Date().toISOString()).slice(0,10)||'unknown';
  const module=event.module||'unknown';
  await client.incr(usageKey(day,module,'calls'));
  if(event.inputTokens!=null&&Number.isFinite(event.inputTokens)&&typeof client.incrby==='function')await client.incrby(usageKey(day,module,'input'),Math.max(0,Math.round(event.inputTokens)));
  if(event.outputTokens!=null&&Number.isFinite(event.outputTokens)&&typeof client.incrby==='function')await client.incrby(usageKey(day,module,'output'),Math.max(0,Math.round(event.outputTokens)));
  if(typeof client.sadd==='function')await client.sadd(JEV_USAGE_INDEX,`${day}|${module}`);
  if(typeof client.expire==='function'){
   await client.expire(usageKey(day,module,'calls'),JEV_USAGE_TTL_SEC);
   await client.expire(usageKey(day,module,'input'),JEV_USAGE_TTL_SEC);
   await client.expire(usageKey(day,module,'output'),JEV_USAGE_TTL_SEC);
   await client.expire(JEV_USAGE_INDEX,JEV_USAGE_TTL_SEC);
  }
 }catch{/* measurement only */}
}
/** Today's call count for one module, or null when Redis is not configured. A missing key is 0. */
export async function readJevModuleCalls(day:string,module:string,redis?:UsageRedis|null):Promise<number|null>{
 try{
  const client=redis===undefined?await redisIfConfigured():redis;
  if(!client||typeof client.get!=='function')return null;
  return num(await client.get(usageKey(day,module,'calls')))??0;
 }catch{return null;}
}
export async function readRecordedJevUsage(redis:UsageRedis|null):Promise<JevUsageBucket[]>{
 if(!redis||typeof redis.smembers!=='function'||typeof redis.get!=='function')return [];
 try{
  const members=[...(await redis.smembers(JEV_USAGE_INDEX)??[])].filter((member):member is string=>typeof member==='string').sort((a,b)=>b.localeCompare(a)).slice(0,JEV_USAGE_READ_CAP);
  const out:JevUsageBucket[]=[];
  for(const member of members){
   const bar=member.indexOf('|');
   if(bar<=0)continue;
   const day=member.slice(0,bar),module=member.slice(bar+1);
   if(!day||!module)continue;
   out.push({scope:'recorded',module,day,calls:num(await redis.get(usageKey(day,module,'calls')))??0,inputTokens:num(await redis.get(usageKey(day,module,'input')))??0,outputTokens:num(await redis.get(usageKey(day,module,'output')))??0});
  }
  return out.sort((a,b)=>b.day.localeCompare(a.day)||a.module.localeCompare(b.module));
 }catch{return [];}
}
export const KNOWN_JEV_MODULES=USAGE_MODULES;
