import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {BREAKOUT_VERDICT_KEY,parseVerdictSnapshot,snapshotIsStale} from '@/lib/admin/cryptoBreakoutVerdict';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Read-only advisory stamp. Admin session only. Does not rescore and does not call a provider. */
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{
  const redis=getRedis();
  if(!redis)throw Error();
  const snapshot=parseVerdictSnapshot(await redis.get(BREAKOUT_VERDICT_KEY));
  if(!snapshot)return NextResponse.json({advisory:true,simulated:true,snapshot:null,stale:true});
  const stale=snapshotIsStale(snapshot.asOf,Date.now(),snapshot.momentumAsOf,snapshot.baseAsOf);
  return NextResponse.json({advisory:true,simulated:true,snapshot:{...snapshot,stale},stale});
 }catch{
  return NextResponse.json({error:'Saved breakout verdicts unavailable'},{status:503});
 }
}
