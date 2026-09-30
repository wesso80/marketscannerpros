import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {persistForwardScores} from '@/lib/admin/cryptoForwardScore';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{const redis=getRedis();if(!redis)throw Error();return NextResponse.json(await persistForwardScores(redis));}
 catch{return NextResponse.json({error:'Saved forward score unavailable'},{status:503});}
}
