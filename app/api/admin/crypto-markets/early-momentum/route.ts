import {runEarlyMomentumBatch} from '@/lib/admin/cryptoEarlyMomentumBatch';
import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import type {MomentumScan} from '@/lib/admin/cryptoVolumeMomentum';
export const runtime='nodejs';export const dynamic='force-dynamic';
const KEY='admin:crypto-markets:early-momentum:v1';
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{const redis=getRedis();if(!redis)throw Error();const [scan,last]=await Promise.all([redis.get<MomentumScan>(KEY),redis.get<{reports?:{earlyWatch?:{error?:string}}}>('admin:crypto-markets:automation:v1:last')]);return NextResponse.json({scan,warning:last?.reports?.earlyWatch?.error??null});}catch{return NextResponse.json({error:'Saved hourly watchlist unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 return runEarlyMomentumBatch();
}
