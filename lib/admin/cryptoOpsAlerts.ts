import {createHash,randomUUID} from 'crypto';
import {getRedis} from '@/lib/redis';
const KEY='admin:crypto-markets:ops-alerts:v1';
type Stage={ok?:boolean;error?:unknown;results?:Array<{monitorHealthy?:boolean;skipped?:boolean;error?:unknown}>};
export type CryptoCycleHealth={monitoring:Stage;scanning:Stage&{reports?:{earlyWatch?:{error?:unknown;ok?:boolean}}};paper:Stage};
type Incident={id:string;startedAt:string;notified:boolean;sentGroups:string[]};
export type OpsState={checkedAt:string;healthy:boolean;issues:string[];incident:Incident|null};
export function cryptoHealthIssues(h:CryptoCycleHealth):string[]{
 const issues:string[]=[];
 if(h.monitoring.ok===false||h.monitoring.results?.some(r=>r.monitorHealthy===false))issues.push('Exit monitoring failed');
 if(h.scanning.ok===false)issues.push('Main crypto scan failed');
 if(h.paper.ok===false||h.paper.results?.some(r=>r.monitorHealthy===false))issues.push('Paper cycle incomplete or monitoring unhealthy');
 if(h.scanning.reports?.earlyWatch?.error||h.scanning.reports?.earlyWatch?.ok===false)issues.push('Hourly research watchlist degraded');
 return issues;
}
export async function cryptoOpsAlertState(){
 const redis=getRedis();
 return {configured:!!process.env.CRYPTO_SETUP_ALERT_EMAIL?.trim()&&!!process.env.RESEND_API_KEY,state:redis?await redis.get<OpsState>(KEY):null,last:redis?await redis.get(`${KEY}:last`):null};
}
async function send(identity:string,subject:string,text:string){
 const to=process.env.CRYPTO_SETUP_ALERT_EMAIL?.trim();if(!to||!process.env.RESEND_API_KEY)throw Error('Operational email recipient or provider not configured');
 const redis=getRedis();if(!redis)throw Error('Operational alert storage unavailable');
 const hash=createHash('sha256').update(to+'|'+identity).digest('hex'),key=`${KEY}:mail:${hash}`;
 if(await redis.get(`${key}:sent`))return;
 // Persist a frozen request before delivery. Uncertain retries reuse the provider idempotency key.
 await redis.set(`${key}:payload`,{from:process.env.RESEND_FROM_EMAIL||'MarketScanner Pros <alerts@marketscannerpros.app>',to:[to],subject,text},{nx:true,ex:604800});
 const payload=await redis.get(`${key}:payload`);if(!payload)throw Error('Operational email payload unavailable');
 const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`crypto-ops-${hash}`},body:JSON.stringify(payload),signal:AbortSignal.timeout(10000)});
 const b=await r.json();if(!r.ok||!b.id)throw Error(`Operational email provider HTTP ${r.status}`);
 await redis.set(`${key}:sent`,b.id,{ex:604800});
 await redis.set(`${KEY}:last`,{status:'ACCEPTED',at:new Date().toISOString(),subject,providerId:b.id});
}
/** Awaited by the crypto-only cron after monitoring. Notification failures never hide job failures. */
export async function reportCryptoCycleHealth(health:CryptoCycleHealth){
 const redis=getRedis();if(!redis)return {ok:false,error:'Operational alert storage unavailable'};
 try{
  if(!await redis.set(`${KEY}:lock`,'reserved',{nx:true,ex:45}))return {ok:true,suppressed:true};
  const prior=await redis.get<OpsState>(KEY),issues=cryptoHealthIssues(health),at=new Date().toISOString();
  const incident=issues.length?(prior?.incident??{id:randomUUID(),startedAt:at,notified:false,sentGroups:[]}):prior?.incident??null;
  const state:OpsState={checkedAt:at,healthy:issues.length===0,issues,incident};
  await redis.set(KEY,state);
  if(issues.length&&incident){
   const group=issues.join('|');
   if(!incident.sentGroups.includes(group)){
    await send(`${incident.id}|failure|${group}`,'MarketScanner Pros · Crypto operations need attention',[
     `Detected at: ${at}`,`Incident began: ${incident.startedAt}`,...issues,
     'These are operational failures, not ordinary setup rejections or position limits. Check the Crypto Markets account and Render cron logs. Exit protection may be delayed when monitoring is unhealthy. No risk rules were changed.',
     'This is a simulated paper system. Review: https://marketscannerpros.app/admin/crypto-markets'
    ].join('\n\n'));
    incident.notified=true;incident.sentGroups.push(group);await redis.set(KEY,state);
   }
  }else if(incident){
   if(incident.notified)await send(`${incident.id}|recovery`,'MarketScanner Pros · Crypto operations recovered',`The monitored crypto cycle checks recovered at ${at}. This confirms that cycle's monitoring and scan checks, not profitability or email inbox delivery.\n\nReview: https://marketscannerpros.app/admin/crypto-markets`);
   await redis.set(KEY,{...state,incident:null});
  }
  return {ok:true,healthy:state.healthy,issues};
 }catch(e){const error=e instanceof Error?e.message:'Operational alert failed';await redis.set(`${KEY}:last`,{status:'FAILED',at:new Date().toISOString(),error}).catch(()=>{});return {ok:false,error};}
}
export async function testCryptoOpsEmail(){
 const redis=getRedis();if(!redis)throw Error('Operational alert storage unavailable');
 const identity=`test|${Math.floor(Date.now()/3600000)}`;
 if(!await redis.set(`${KEY}:${identity}:lock`,'reserved',{nx:true,ex:60}))throw Error('Test is already reserved; retry later');
 await send(identity,'MarketScanner Pros · Operational alerts TEST','TEST ONLY — no failure was detected or simulated. Crypto cycle failures and recovery notifications are connected. Repeated unchanged failures are suppressed. A complete service/cron outage needs an independent watchdog; this email does not prove that coverage.');
}
