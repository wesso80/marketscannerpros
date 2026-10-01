import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {loadJevBoard} from '@/lib/admin/cryptoJevBoard';
export const runtime='nodejs';export const dynamic='force-dynamic';
/** Saved Jev, chart, and catalyst stamps plus the ledger lines that grade them. No provider or Jev call. */
export async function GET(req:Request){
 const auth=await requireAdmin(req);if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json(await loadJevBoard(getRedis(),auth.workspaceId));}
 catch{return NextResponse.json({error:'Saved Jev board unavailable'},{status:503});}
}
