import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {isAdminCryptoEnabled} from '@/lib/admin/adminCrypto';
import {createBaseScan,fetchDailyBase,type BaseScan} from '@/lib/admin/cryptoBaseScan';
import type {DiscoveryRow,VenueEvidence} from '@/lib/admin/cryptoDiscovery';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const KEY='admin:crypto-markets:bases:v1';
export async function GET(req:Request){
  if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
  try{const redis=getRedis();if(!redis)throw Error();return NextResponse.json({scan:await redis.get<BaseScan>(KEY)});}catch{return NextResponse.json({error:'Saved base scan unavailable'},{status:503});}
}
export async function POST(req:Request){
  if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
  if(!isAdminCryptoEnabled())return NextResponse.json({error:'Admin crypto paused'},{status:409});
  try{
    const redis=getRedis();if(!redis)throw Error();
    // Five requests at most, sequentially, with an eight-second timeout each.
    // Reservation outlives the bounded batch; it is never deleted by another caller.
    if(!await redis.set(`${KEY}:batch-lock`,'reserved',{nx:true,ex:60}))return NextResponse.json({error:'Batch cooling down; resume after one minute'},{status:429});
    const now=Date.now();let scan=await redis.get<BaseScan>(KEY);
    const day=Math.floor(now/86400000);
    if(!scan||scan.version!==2||Math.floor(Date.parse(scan.startedAt)/86400000)!==day){
      const snapshot=await redis.get<{startedAt:string;rows:(DiscoveryRow&{venues:VenueEvidence[]})[]}>('admin:crypto-discovery:v1');
      const age=now-Date.parse(snapshot?.startedAt??'');
      if(!snapshot||!Number.isFinite(age)||age<0||age>15*60000)return NextResponse.json({error:'Refresh major-exchange discovery before starting today’s base scan'},{status:409});
      const previous=scan;
      scan=createBaseScan(snapshot.rows,snapshot.startedAt,now);
      // Preserve valid Coinbase work from today's v1 run; other venues start with fresh evidence.
      if(previous&&Math.floor(Date.parse(previous.startedAt)/86400000)===day){
        for(const row of scan.rows){
          const old=previous.rows.find(r=>r.id===row.id&&r.product===row.product);
          if(row.stage==='PENDING'&&row.exchange==='gdax'&&old&&(old.stage==='BASE'||old.stage==='NOT_BASE')&&old.asOf){
            Object.assign(row,{stage:old.stage,reason:old.reason,asOf:old.asOf,high:old.high,low:old.low,widthPct:old.widthPct,gapPct:old.gapPct,slopePct:old.slopePct,contraction:old.contraction});
          }
        }
      }
      await redis.set(KEY,scan,{ex:7*86400});
    }
    let requests=0;
    for(const row of scan.rows.filter(r=>r.stage==='PENDING').slice(0,5)){
      requests++;
      try{Object.assign(row,await fetchDailyBase(row,now));}catch{row.stage='UNAVAILABLE';row.reason='Provider request or candle validation failed; no substitute volume';}
      scan.updatedAt=new Date().toISOString();await redis.set(KEY,scan,{ex:7*86400});
    }
    return NextResponse.json({scan,requestAttempts:requests});
  }catch{return NextResponse.json({error:'Base scan storage unavailable; progress may be incomplete'},{status:503});}
}
