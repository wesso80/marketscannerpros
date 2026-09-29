import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {newListingsView,runNewListings} from '@/lib/admin/cryptoNewListingsJob';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=120;
/** Admin-only. GET reads saved listings. POST runs the hourly job now, at most every 10 minutes. */
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json(await newListingsView(),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'New listings unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 const body=await req.json().catch(()=>null);if(body?.action!=='run')return NextResponse.json({error:'Valid action required'},{status:400});
 const redis=getRedis();
 if(redis&&!await redis.set('admin:crypto-markets:new-listings:v1:manual','1',{nx:true,ex:600}))return NextResponse.json({error:'Manual new-listings run within the last 10 minutes',...await newListingsView()},{status:429});
 try{const run=await runNewListings(Date.now(),true);return NextResponse.json({run,...await newListingsView()});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'New listings job failed'},{status:503});}
}
