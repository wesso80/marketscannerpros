import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {learningStatus} from '@/lib/admin/learningStatus';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** Read-only health of every Jev stamp and ledger. No provider or Jev call is made here. */
export async function GET(req:Request){
 const auth=await requireAdmin(req);if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json(await learningStatus(getRedis(),auth.workspaceId));}
 catch{return NextResponse.json({error:'Learning status unavailable'},{status:503});}
}
