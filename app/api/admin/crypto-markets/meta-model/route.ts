import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {metaModelView,trainMetaModel} from '@/lib/admin/cryptoMetaModelJob';
import {cryptoMarketsPaused,pausedCryptoMarketsResponse} from '@/lib/admin/cryptoMarketsPause';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
/** Admin-only shadow model (research). Scores are logged only; nothing here changes entries, sizes or exits. */
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json(await metaModelView(),{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'Shadow model unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 if(cryptoMarketsPaused())return pausedCryptoMarketsResponse();
 const a=(await req.json().catch(()=>null))?.action;
 if(a!=='train')return NextResponse.json({error:'Valid action required'},{status:400});
 try{await trainMetaModel();return NextResponse.json(await metaModelView());}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Training failed',...await metaModelView().catch(()=>({}))},{status:409});}
}
