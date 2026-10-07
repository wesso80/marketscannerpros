import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {replayView,startReplay,replayBatch,simulateReplay,replayCsv} from '@/lib/admin/cryptoReplayJob';
import {cryptoMarketsPaused,pausedCryptoMarketsResponse} from '@/lib/admin/cryptoMarketsPause';
import {toCsv} from '@/lib/admin/cryptoTradeLog';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
/** Admin-only history replay (research dataset). No live rules change and no orders are placed. */
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{
  if(new URL(req.url).searchParams.get('format')==='csv'){
   const r=await replayCsv();if(!r)return NextResponse.json({error:'No replay dataset'},{status:404});
   return new NextResponse(toCsv(r.headers,r.body),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="crypto-replay-signals-${r.state.runId.slice(0,10)}.csv"`,'Cache-Control':'no-store'}});
  }
  return NextResponse.json(await replayView(),{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Replay unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 const body=await req.json().catch(()=>null),a=body?.action;
 if(cryptoMarketsPaused()&&a!=='simulate')return pausedCryptoMarketsResponse();
 try{
  if(a==='start')await startReplay(typeof body?.from==='string'?body.from:undefined);
  else if(a==='batch'){const r=await replayBatch();if(r.busy)return NextResponse.json({error:'Batch already running',...await replayView()},{status:429});}
  else if(a==='simulate')await simulateReplay();
  else return NextResponse.json({error:'Valid action required'},{status:400});
  return NextResponse.json(await replayView());
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Replay failed',...await replayView().catch(()=>({}))},{status:409});}
}
