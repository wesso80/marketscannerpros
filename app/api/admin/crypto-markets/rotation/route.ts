import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {savedRotation,savedRotationResult,startRotation,runRotationBatch,computeRotation,type RotationState,type RotationResult} from '@/lib/admin/cryptoRotationData';
import {cryptoMarketsPaused,pausedCryptoMarketsResponse} from '@/lib/admin/cryptoMarketsPause';
import {toCsv} from '@/lib/admin/cryptoTradeLog';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
/** Admin-only research view; trades are sent only as CSV to keep the page payload small. */
const view=(state:RotationState|null,result:RotationResult|null)=>({simulated:true,
 state:state?{...state,products:undefined,counts:{products:state.products.length,done:state.products.filter(p=>p.fetch==='DONE').length,failed:state.products.filter(p=>p.fetch==='FAILED').length,withHistory:state.products.filter(p=>(p.days??0)>0).length},failures:state.products.filter(p=>p.fetch==='FAILED').slice(0,20).map(p=>({product:p.product,error:p.error}))}:null,
 result:result?{...result,trades:undefined,tradeCount:result.trades.length}:null});
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{
  if(new URL(req.url).searchParams.get('format')==='csv'){
   const r=await savedRotationResult();if(!r)return NextResponse.json({error:'No rotation result'},{status:404});
   const csv=toCsv(['simulated','rules','product','entry_decision_close','entry_open','entry_price','weight','rank_at_entry','score_at_entry','exit_decision_close','exit_time','exit_price','exit_reason','return_pct_after_costs','hold_days','marked_not_realised'],
    r.trades.map(t=>[true,r.rules.version,t.product,t.entryDecision,t.entryAt,t.entryPrice,t.weight,t.rankAtEntry,t.scoreAtEntry,t.exitDecision,t.exitAt,t.exitPrice,t.reason,t.returnPct,t.holdDays,!!t.marked]));
   return new NextResponse(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="crypto-rotation-trades-${r.computedAt.slice(0,10)}.csv"`,'Cache-Control':'no-store'}});
  }
  return NextResponse.json(view(await savedRotation(),await savedRotationResult()));
 }catch{return NextResponse.json({error:'Rotation lab unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 const body=await req.json().catch(()=>null);if(!['start','next','compute'].includes(body?.action))return NextResponse.json({error:'Valid rotation action required'},{status:400});
 if(cryptoMarketsPaused()&&body.action!=='compute')return pausedCryptoMarketsResponse();
 try{
  if(body.action==='start')return NextResponse.json(view(await startRotation(),null));
  if(body.action==='compute'){const r=await computeRotation();return NextResponse.json(view(await savedRotation(),r));}
  const r=await runRotationBatch();
  return NextResponse.json({...view(r.state,null),...(r.busy?{error:'Rotation batch already running; showing saved progress'}:{})},{status:r.busy?429:200});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Rotation lab failed'},{status:503});}
}
