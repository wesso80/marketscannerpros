import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {historyView,estimateHistory,approveHistory,historyStep,setHistoryPaused,retryHistoryErrors} from '@/lib/admin/cgHistoryJob';
import {cryptoMarketsPaused,pausedCryptoMarketsResponse} from '@/lib/admin/cryptoMarketsPause';
import {CG_HISTORY} from '@/lib/admin/cgHistory';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
/** Admin-only. Nothing downloads history until an estimate has been shown and explicitly approved. */
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json(await historyView(),{headers:{'Cache-Control':'no-store'}});}catch{return NextResponse.json({error:'History status unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 const body=await req.json().catch(()=>null),a=body?.action;
 if(cryptoMarketsPaused()&&a!=='pause'&&a!=='resume')return pausedCryptoMarketsResponse();
 try{
  if(a==='estimate')await estimateHistory();
  else if(a==='approve'){if(body?.confirm!==true)return NextResponse.json({error:'Approval must be explicit'},{status:400});await approveHistory();}
  else if(a==='batch'){const r=await historyStep(CG_HISTORY.callsPerManualBatch);return NextResponse.json({run:r,...await historyView()});}
  else if(a==='pause'||a==='resume')await setHistoryPaused(a==='pause');
  else if(a==='retry_errors')await retryHistoryErrors();
  else return NextResponse.json({error:'Valid action required'},{status:400});
  return NextResponse.json(await historyView());
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'History job failed',...await historyView().catch(()=>({}))},{status:409});}
}
