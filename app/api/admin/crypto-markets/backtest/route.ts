import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {savedBacktest,startBacktest,runBacktestBatch,summarizeBacktest,type BacktestState} from '@/lib/admin/cryptoBacktest';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
const view=(state:BacktestState|null)=>state?{state:{...state,btcDaily:undefined,trades:state.trades.slice(-200)},summary:summarizeBacktest(state)}:{state:null,summary:null};
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json({simulated:true,...view(await savedBacktest())});}catch{return NextResponse.json({error:'Saved backtest unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 const body=await req.json().catch(()=>null);if(!['start','next'].includes(body?.action))return NextResponse.json({error:'Valid backtest action required'},{status:400});
 try{
  if(body.action==='start')return NextResponse.json({simulated:true,...view(await startBacktest())});
  const r=await runBacktestBatch();
  return NextResponse.json({simulated:true,...view(r.state),...(r.busy?{error:'Backtest batch already running; showing saved progress'}:{})},{status:r.busy?429:200});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Backtest failed'},{status:503});}
}
