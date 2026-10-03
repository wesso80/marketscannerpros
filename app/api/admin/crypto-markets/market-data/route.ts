import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {getRedis} from '@/lib/redis';
import {cryptoMarketDataView,runCryptoMarketData} from '@/lib/admin/cryptoMarketDataJob';
import {cryptoMarketsPaused,pausedCryptoMarketsResponse} from '@/lib/admin/cryptoMarketsPause';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
/** Admin-only. GET reads saved data (plus the /key budget check, cached 10 min). POST runs the job at most every 5 minutes. */
export async function GET(req:Request){
 const auth=await requireAdmin(req);if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json(await cryptoMarketDataView(Date.now(),auth.workspaceId),{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'Market data unavailable'},{status:503});}
}
export async function POST(req:Request){
 const auth=await requireAdmin(req);if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403});
 const body=await req.json().catch(()=>null);if(body?.action!=='run')return NextResponse.json({error:'Valid action required'},{status:400});
 if(cryptoMarketsPaused())return pausedCryptoMarketsResponse();
 const redis=getRedis();
 if(redis&&!await redis.set('admin:crypto-markets:cg-market:v1:manual','1',{nx:true,ex:300}))return NextResponse.json({error:'Manual market-data refresh ran within the last 5 minutes',...await cryptoMarketDataView(Date.now(),auth.workspaceId)},{status:429});
 try{const run=await runCryptoMarketData();return NextResponse.json({run,...await cryptoMarketDataView(Date.now(),auth.workspaceId)});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Market data job failed'},{status:503});}
}
