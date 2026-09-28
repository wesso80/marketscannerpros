import {sendCryptoSetupEmails} from './cryptoSetupEmail';
import {NextResponse} from 'next/server';
import {getRedis} from '@/lib/redis';
import {isAdminCryptoEnabled} from '@/lib/admin/adminCrypto';
import {createMomentumScan,fetchVolumeMomentum,type MomentumScan} from '@/lib/admin/cryptoVolumeMomentum';
import type {DiscoveryRow,VenueEvidence} from '@/lib/admin/cryptoDiscovery';
const KEY='admin:crypto-markets:momentum-volume:v1',F=4*3600000;
export async function runMomentumBatch(limit=5){
 if(!isAdminCryptoEnabled())return NextResponse.json({error:'Admin crypto paused'},{status:409});
 try{
  const redis=getRedis();if(!redis)throw Error();
  if(!await redis.set(`${KEY}:batch-lock`,'reserved',{nx:true,ex:limit>5?240:60}))return NextResponse.json({error:'Shared momentum batch active or cooling down; showing saved progress',scan:await redis.get<MomentumScan>(KEY)},{status:429});
  const now=Date.now();let scan=await redis.get<MomentumScan>(KEY);
  if(!scan||!scan.rows.length||Math.floor(Date.parse(scan.startedAt)/F)!==Math.floor(now/F)){
   const snapshot=await redis.get<{startedAt:string;rows:(DiscoveryRow&{venues:VenueEvidence[]})[]}>('admin:crypto-discovery:v1');
   const age=now-Date.parse(snapshot?.startedAt??'');
   if(!snapshot||!snapshot.rows?.length||!Number.isFinite(age)||age<0||age>900000)return NextResponse.json({error:'Refresh discovery before starting a new 4h momentum scan'},{status:409});
   scan=createMomentumScan(snapshot.rows,snapshot.startedAt,now);await redis.set(KEY,scan,{ex:86400});
  }
  let requests=0;
  const pending=scan.rows.filter(r=>r.stage==='PENDING').slice(0,Math.min(100,Math.max(1,limit)));
  for(let i=0;i<pending.length;i+=5){
   const batchStarted=Date.now();
   await Promise.all(pending.slice(i,i+5).map(async row=>{
    requests++;try{if(!row.pair)throw Error();Object.assign(row,await fetchVolumeMomentum(row.pair,now));}
    catch{row.stage='UNAVAILABLE';row.reason='Provider or candle validation failed; no substitute data';}
   }));
   if(i+5<pending.length)await new Promise(resolve=>setTimeout(resolve,Math.max(0,1000-(Date.now()-batchStarted))));
   scan.updatedAt=new Date().toISOString();await redis.set(KEY,scan,{ex:86400});
  }
  const emailAlerts=await sendCryptoSetupEmails(scan);
  return NextResponse.json({scan,requestAttempts:requests,emailAlerts});
 }catch{return NextResponse.json({error:'Momentum scan storage unavailable; progress may be incomplete'},{status:503});}
}
