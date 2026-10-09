import {randomUUID} from 'crypto';
import {sendCryptoSetupEmails} from './cryptoSetupEmail';
import {NextResponse} from 'next/server';
import {getRedis} from '@/lib/redis';
import {isAdminCryptoEnabled} from '@/lib/admin/adminCrypto';
import {cryptoMarketsPaused,pausedCryptoMarketsResponse} from '@/lib/admin/cryptoMarketsPause';
import {createMomentumScan,fetchVolumeMomentum,type MomentumScan} from '@/lib/admin/cryptoVolumeMomentum';
import {persistForwardScores} from '@/lib/admin/cryptoForwardScore';
import {stampMomentumVolume,unavailableFlowStamp} from '@/lib/admin/cryptoFlow';
import {attachJevShadow} from '@/lib/admin/cryptoJev';
import {attachCatalystShadow} from '@/lib/admin/cryptoJevCatalyst';
import {attachChartConfirmer} from '@/lib/admin/cryptoJevChart';
import {attachShadowScoreWithContext} from '@/lib/admin/cryptoShadowScore';
import type {DiscoveryRow,VenueEvidence} from '@/lib/admin/cryptoDiscovery';
const KEY='admin:crypto-markets:momentum-volume:v1',F=4*3600000;
// Compare ownership and save in one Redis operation. A read-then-SET can race after lease expiry.
const SAVE_OWNED_SCAN="if redis.call('get', KEYS[1]) ~= ARGV[1] then return 0 end redis.call('set', KEYS[2], ARGV[2], 'EX', ARGV[3]) return 1";
class MomentumLeaseLost extends Error {}
export async function runMomentumBatch(limit=5){
 if(cryptoMarketsPaused())return pausedCryptoMarketsResponse();
 if(!isAdminCryptoEnabled())return NextResponse.json({error:'Admin crypto paused'},{status:409});
 try{
  const redis=getRedis();if(!redis)throw Error();
  const lockToken=randomUUID();
  if(!await redis.set(`${KEY}:batch-lock`,lockToken,{nx:true,ex:limit>5?240:60}))return NextResponse.json({error:'Shared momentum batch active or cooling down; showing saved progress',scan:await redis.get<MomentumScan>(KEY)},{status:429});
  const save=async(value:MomentumScan)=>{
   const saved=await redis.eval(SAVE_OWNED_SCAN,[`${KEY}:batch-lock`,KEY],[lockToken,JSON.stringify(value),86400]);
   if(saved!==1)throw new MomentumLeaseLost();
  };
  const now=Date.now();let scan=await redis.get<MomentumScan>(KEY);
  if(!scan||!scan.rows.length||Math.floor(Date.parse(scan.startedAt)/F)!==Math.floor(now/F)){
   const snapshot=await redis.get<{startedAt:string;rows:(DiscoveryRow&{venues:VenueEvidence[]})[]}>('admin:crypto-discovery:v1');
   const age=now-Date.parse(snapshot?.startedAt??'');
   if(!snapshot||!snapshot.rows?.length||!Number.isFinite(age)||age<0||age>900000)return NextResponse.json({error:'Refresh discovery before starting a new 4h momentum scan'},{status:409});
   scan=createMomentumScan(snapshot.rows,snapshot.startedAt,now);await save(scan);
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
   scan.updatedAt=new Date().toISOString();await save(scan);
  }
  try{await stampMomentumVolume(scan.rows,now);}catch{for(const row of scan.rows)if(row.stage==='MOMENTUM_VOLUME'&&!row.flowStamp)row.flowStamp=unavailableFlowStamp(now);}
  await attachJevShadow(scan.rows,now);
  await attachChartConfirmer(scan.rows,now);
  await attachCatalystShadow(redis,scan.rows,now).catch(()=>undefined);
  await attachShadowScoreWithContext(redis,scan.rows,now);
  scan.updatedAt=new Date().toISOString();await save(scan);
  const emailAlerts=await sendCryptoSetupEmails(scan);
  await persistForwardScores(redis,now);
  return NextResponse.json({scan,requestAttempts:requests,emailAlerts});
 }catch(error){
  if(error instanceof MomentumLeaseLost)return NextResponse.json({error:'Momentum batch ownership expired or changed; reload saved progress before retrying'},{status:409});
  return NextResponse.json({error:'Momentum scan storage unavailable; progress may be incomplete'},{status:503});
 }
}
