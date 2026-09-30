import {giveBack} from '@/lib/admin/cryptoExcursion';
import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {harnessView,startHarness,harnessBatch,computeHarness,savedHarnessResult} from '@/lib/admin/strategyHarnessJob';
import {toCsv} from '@/lib/admin/cryptoTradeLog';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
/** Admin-only research harness. No live rules change and no orders are placed. */
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{
  if(new URL(req.url).searchParams.get('format')==='csv'){
   const r=await savedHarnessResult();if(!r)return NextResponse.json({error:'No harness result'},{status:404});
   return new NextResponse(toCsv(['simulated','version','variant','coin','setup','signal_candle','entry_time','exit_time','fill','stop','exit_price','r_after_costs','exit_reason','marked_not_realised','mfe_r','mae_r','give_back'],r.trades.map(t=>[true,r.version,t.variant,t.coin,t.kind,t.signalAt,t.entryAt,t.exitAt,t.fill,t.stop,t.exit,Math.round(t.r*1000)/1000,t.reason,t.marked,t.mfeR,t.maeR,giveBack(t.mfeR,Math.round(t.r*1000)/1000)])),
    {headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="crypto-harness-trades-${r.computedAt.slice(0,10)}.csv"`,'Cache-Control':'no-store'}});
  }
  return NextResponse.json(await harnessView());
 }catch{return NextResponse.json({error:'Harness unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 const a=(await req.json().catch(()=>null))?.action;
 try{
  if(a==='start')await startHarness();
  else if(a==='batch'){const r=await harnessBatch();if(r.busy)return NextResponse.json({error:'Batch already running',...await harnessView()},{status:429});}
  else if(a==='compute')await computeHarness();
  else return NextResponse.json({error:'Valid action required'},{status:400});
  return NextResponse.json(await harnessView());
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Harness failed',...await harnessView().catch(()=>({}))},{status:409});}
}
