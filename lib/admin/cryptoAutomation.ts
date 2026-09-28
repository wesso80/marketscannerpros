import {getRedis} from '@/lib/redis';
import {isAdminCryptoEnabled} from './adminCrypto';
import {runDiscoveryBatch} from './cryptoDiscoveryBatch';
import {runMomentumBatch} from './cryptoMomentumBatch';
import {runBaseBatch} from './cryptoBaseBatch';
const KEY='admin:crypto-markets:automation:v1',F=4*3600000;
export async function cryptoAutomationState(){
 const redis=getRedis();if(!redis)throw Error('Automation cache unavailable');
 return {enabled:(await redis.get<boolean>(KEY))===true,last:await redis.get(`${KEY}:last`)};
}
export async function setCryptoAutomation(enabled:boolean){
 const redis=getRedis();if(!redis)throw Error('Automation cache unavailable');
 await redis.set(KEY,enabled);
}
/** Only called by the authenticated cron. No browser required; provider budgets are shared with manual scans. */
export async function runCryptoAutomation(){
 const redis=getRedis();if(!redis)throw Error('Automation cache unavailable');
 if(!isAdminCryptoEnabled()||await redis.get(KEY)!==true)return {enabled:false,skipped:true};
 if(!await redis.set(`${KEY}:lock`,'reserved',{nx:true,ex:600}))return {enabled:true,ok:false,skipped:true,reason:'Background batch already running or cooling down'};
 const started=Date.now(),reports:Record<string,unknown>={};
 const record=async(name:string,response:Response)=>{
  const b=await response.json();reports[name]={status:response.status,requests:b.requestAttempts??b.snapshot?.requests??0,error:b.error??null,pending:b.scan?.rows?.filter((r:{stage:string})=>r.stage==='PENDING').length??null};
  if(!response.ok)throw Error(`${name}: ${b.error??'request failed'}`);
 };
 try{
  const momentum=await redis.get<{startedAt:string;rows:unknown[]}>('admin:crypto-markets:momentum-volume:v1');
  const base=await redis.get<{startedAt:string;version:number;rows:unknown[]}>('admin:crypto-markets:bases:v1');
  const needDiscovery=!momentum||!momentum.rows?.length||Math.floor(Date.parse(momentum.startedAt)/F)!==Math.floor(started/F)||!base||!base.rows?.length||base.version!==2||Math.floor(Date.parse(base.startedAt)/86400000)!==Math.floor(started/86400000);
  if(needDiscovery){
   const saved=await redis.get<{startedAt:string;rows:unknown[]}>('admin:crypto-discovery:v1');
   const age=started-Date.parse(saved?.startedAt??'');
   if(!saved?.rows?.length||!Number.isFinite(age)||age<0||age>900000)await record('discovery',await runDiscoveryBatch());
  }
  await record('momentum',await runMomentumBatch(100));
  // Daily bases are watchlist work; advance a smaller batch without starving four-hour setups.
  await record('bases',await runBaseBatch(20));
  const last={ok:true,at:new Date().toISOString(),durationMs:Date.now()-started,reports};await redis.set(`${KEY}:last`,last);return {enabled:true,...last};
 }catch(error){
  const last={ok:false,at:new Date().toISOString(),durationMs:Date.now()-started,reports,error:error instanceof Error?error.message:'Background scan failed'};await redis.set(`${KEY}:last`,last);return {enabled:true,...last};
 }
}
