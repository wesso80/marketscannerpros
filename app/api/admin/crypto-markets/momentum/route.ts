import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {isAdminCryptoEnabled} from '@/lib/admin/adminCrypto';
import {createMomentumScan,fetchVolumeMomentum,type MomentumScan} from '@/lib/admin/cryptoVolumeMomentum';
import type {DiscoveryRow,VenueEvidence} from '@/lib/admin/cryptoDiscovery';
export const runtime='nodejs';export const dynamic='force-dynamic';
const KEY='admin:crypto-markets:momentum-volume:v1',F=4*3600000;
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{const redis=getRedis();if(!redis)throw Error();return NextResponse.json({scan:await redis.get<MomentumScan>(KEY)});}catch{return NextResponse.json({error:'Saved momentum scan unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 if(!isAdminCryptoEnabled())return NextResponse.json({error:'Admin crypto paused'},{status:409});
 try{
  const redis=getRedis();if(!redis)throw Error();
  if(!await redis.set(`${KEY}:batch-lock`,'reserved',{nx:true,ex:60}))return NextResponse.json({error:'Shared momentum batch active or cooling down; showing saved progress',scan:await redis.get<MomentumScan>(KEY)},{status:429});
  const now=Date.now();let scan=await redis.get<MomentumScan>(KEY);
  if(!scan||Math.floor(Date.parse(scan.startedAt)/F)!==Math.floor(now/F)){
   const snapshot=await redis.get<{startedAt:string;rows:(DiscoveryRow&{venues:VenueEvidence[]})[]}>('admin:crypto-discovery:v1');
   const age=now-Date.parse(snapshot?.startedAt??'');
   if(!snapshot||!Number.isFinite(age)||age<0||age>900000)return NextResponse.json({error:'Refresh discovery before starting a new 4h momentum scan'},{status:409});
   scan=createMomentumScan(snapshot.rows,snapshot.startedAt,now);await redis.set(KEY,scan,{ex:86400});
  }
  let requests=0;
  for(const row of scan.rows.filter(r=>r.stage==='PENDING').slice(0,5)){
   requests++;try{if(!row.pair)throw Error();Object.assign(row,await fetchVolumeMomentum(row.pair,now));}
   catch{row.stage='UNAVAILABLE';row.reason='Provider or candle validation failed; no substitute data';}
   scan.updatedAt=new Date().toISOString();await redis.set(KEY,scan,{ex:86400});
  }
  return NextResponse.json({scan,requestAttempts:requests});
 }catch{return NextResponse.json({error:'Momentum scan storage unavailable; progress may be incomplete'},{status:503});}
}
