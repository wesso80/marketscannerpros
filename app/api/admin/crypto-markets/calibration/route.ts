import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {CAL,calibrationLedgerKey,listCryptoPaperWorkspaces,runCryptoCalibration,type CalibrationLedger} from '@/lib/admin/cryptoCalibration';
import {SHADOW_WEIGHTS_ACTIVE} from '@/lib/admin/cryptoShadowScore';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** GET reads this workspace's saved ledger only. POST {action:'refresh'} recomputes behind a cooldown. Nothing here applies a rule. */
export async function GET(req:Request){
 const auth=await requireAdmin(req);if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{
  const redis=getRedis();if(!redis)throw Error();
  const ledger=await redis.get<CalibrationLedger>(calibrationLedgerKey(auth.workspaceId));
  const stale=!!ledger&&Date.now()-Date.parse(ledger.checkedAt)>36*3600000;
  return NextResponse.json({ledger,stale,saved:!!ledger});
 }catch{return NextResponse.json({error:'Saved calibration unavailable'},{status:503});}
}
export async function POST(req:Request){
 const auth=await requireAdmin(req);if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403});
 const key=calibrationLedgerKey(auth.workspaceId);
 try{
  const redis=getRedis();if(!redis)throw Error();
  const body=await req.json().catch(()=>null);
  if(!body||typeof body!=='object'||body.action!=='refresh')return NextResponse.json({error:'Only {action:"refresh"} is accepted'},{status:400});
  if('apply' in body)return NextResponse.json({error:'Calibration never applies a change'},{status:400});
  if(!await redis.set(`${key}:refresh-lock`,'reserved',{nx:true,px:CAL.cooldownMs}))return NextResponse.json({error:'Calibration refreshed recently; showing the saved ledger',ledger:await redis.get<CalibrationLedger>(key)},{status:429});
  const out=await runCryptoCalibration(redis,Date.now(),auth.workspaceId);
  try{const ids=await listCryptoPaperWorkspaces();await redis.set(SHADOW_WEIGHTS_ACTIVE,ids.length===1?ids[0]:'none',{ex:7*86400});}catch{/* The ledger is already saved. A pointer miss must not report that write as failed. */}
  return NextResponse.json({ledger:out.ledger,stale:false,saved:true,filedNow:out.filedNow,skippedByCap:out.skippedByCap});
 }catch{return NextResponse.json({error:'Calibration unavailable; saved ledger unchanged'},{status:503});}
}
