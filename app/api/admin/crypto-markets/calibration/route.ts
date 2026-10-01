import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {CAL,CALIBRATION_KEY,runCryptoCalibration,type CalibrationLedger} from '@/lib/admin/cryptoCalibration';
export const runtime='nodejs';export const dynamic='force-dynamic';
const COOLDOWN=`${CALIBRATION_KEY}:refresh-lock`;
/** GET reads the saved ledger only. POST {action:'refresh'} recomputes behind a cooldown. Nothing here applies a rule. */
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{
  const redis=getRedis();if(!redis)throw Error();
  const ledger=await redis.get<CalibrationLedger>(CALIBRATION_KEY);
  const stale=!!ledger&&Date.now()-Date.parse(ledger.checkedAt)>36*3600000;
  return NextResponse.json({ledger,stale,saved:!!ledger});
 }catch{return NextResponse.json({error:'Saved calibration unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{
  const redis=getRedis();if(!redis)throw Error();
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=='object'||body.action!=='refresh')return NextResponse.json({error:'Only {action:"refresh"} is accepted'},{status:400});
  if('apply' in body)return NextResponse.json({error:'Calibration never applies a change'},{status:400});
  if(!await redis.set(COOLDOWN,'reserved',{nx:true,px:CAL.cooldownMs}))return NextResponse.json({error:'Calibration refreshed recently; showing the saved ledger',ledger:await redis.get<CalibrationLedger>(CALIBRATION_KEY)},{status:429});
  const out=await runCryptoCalibration(redis);
  return NextResponse.json({ledger:out.ledger,stale:false,saved:true,filedNow:out.filedNow,skippedByCap:out.skippedByCap});
 }catch{return NextResponse.json({error:'Calibration unavailable; saved ledger unchanged'},{status:503});}
}
