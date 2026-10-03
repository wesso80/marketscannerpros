import {randomUUID} from 'crypto';
import {getRedis} from '@/lib/redis';
import {isAdminCryptoEnabled} from './adminCrypto';
import {cryptoMarketsPaused} from './cryptoMarketsPause';
import {runDiscoveryBatch} from './cryptoDiscoveryBatch';
import {runMomentumBatch} from './cryptoMomentumBatch';
import {runEarlyMomentumBatch} from './cryptoEarlyMomentumBatch';
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
 if(cryptoMarketsPaused())return {enabled:false,ok:true,paused:true,skipped:true,reason:'crypto_markets_paused'};
 const redis=getRedis();if(!redis)throw Error('Automation cache unavailable');
 if(!isAdminCryptoEnabled()||await redis.get(KEY)!==true)return {enabled:false,skipped:true};
 const lockToken=randomUUID();
 if(!await redis.set(`${KEY}:lock`,lockToken,{nx:true,ex:600}))return {enabled:true,ok:false,skipped:true,reason:'Background batch already running or recovering from an interrupted run'};
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
  // A manual batch can hold the same reservation when the schedule fires.
  // Wait for its actual TTL, then retry boundedly; never delete another worker's lock.
  const coordinatedBatch=async(name:string,key:string,run:()=>Promise<Response>)=>{
   let response=await run();
   for(let attempt=0;response.status===429&&attempt<2;attempt++){
    const ttl=await redis.ttl(`${key}:batch-lock`);
    if(ttl===-1||ttl>240)break;
    const delay=(Math.max(0,ttl)+1)*1000;
    if(Date.now()-started+delay>300000)break;
    await new Promise(resolve=>setTimeout(resolve,delay));
    if(await redis.get(KEY)!==true)throw Error('Background scans paused while waiting for an active batch');
    response=await run();
   }
   await record(name,response);
  };
  await coordinatedBatch('momentum','admin:crypto-markets:momentum-volume:v1',()=>runMomentumBatch(100));
  // Daily bases are watchlist work; advance a smaller batch without starving four-hour setups.
  await coordinatedBatch('bases','admin:crypto-markets:bases:v1',()=>runBaseBatch(20));
  // Supplementary research failure must not disable independently validated 4h entries.
  try{await record('earlyWatch',await runEarlyMomentumBatch(100));}
  catch(error){reports.earlyWatch={ok:false,error:error instanceof Error?error.message:'Hourly research unavailable'};}
  const last={ok:true,at:new Date().toISOString(),durationMs:Date.now()-started,reports};await redis.set(`${KEY}:last`,last);return {enabled:true,...last};
 }catch(error){
  const last={ok:false,at:new Date().toISOString(),durationMs:Date.now()-started,reports,error:error instanceof Error?error.message:'Background scan failed'};await redis.set(`${KEY}:last`,last);return {enabled:true,...last};
 }finally{
  // Release only our reservation, atomically. If its TTL expired and a new run
  // acquired it, that run must retain its lock. TTL still recovers crashed runs.
  await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",[`${KEY}:lock`],[lockToken]).catch(error=>console.error('[crypto-automation] Lock release failed',error));
 }
}
