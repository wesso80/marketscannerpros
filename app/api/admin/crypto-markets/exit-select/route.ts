import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {exitSelectView,trainExitSelector} from '@/lib/admin/cryptoExitSelectJob';
import {cryptoMarketsPaused,pausedCryptoMarketsResponse} from '@/lib/admin/cryptoMarketsPause';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
/** Admin-only exit selection in shadow (research). Choices are logged only; no paper position's exits change. */
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json(await exitSelectView(),{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'Exit selection unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 if(cryptoMarketsPaused())return pausedCryptoMarketsResponse();
 if((await req.json().catch(()=>null))?.action!=='train')return NextResponse.json({error:'Valid action required'},{status:400});
 try{await trainExitSelector();return NextResponse.json(await exitSelectView());}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Training failed',...await exitSelectView().catch(()=>({}))},{status:409});}
}
