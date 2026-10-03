import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {savedBacktest,startBacktest,runBacktestBatch,stampSavedBacktest,summarizeBacktest,regimeTags,type BacktestState} from '@/lib/admin/cryptoBacktest';
import {backtestJevCoverage} from '@/lib/admin/cryptoBacktestJev';
import {backtestTradeLog} from '@/lib/admin/cryptoTradeLog';
import {cryptoMarketsPaused,pausedCryptoMarketsResponse} from '@/lib/admin/cryptoMarketsPause';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=180;
const view=(state:BacktestState|null)=>state?{state:{...state,btcDaily:undefined,coinDaily:undefined,trades:state.trades.slice(-200)},summary:summarizeBacktest(state),jev:backtestJevCoverage(state.trades)}:{state:null,summary:null,jev:null};
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 if(new URL(req.url).searchParams.get('format')==='csv'){
  try{const state=await savedBacktest();if(!state)return NextResponse.json({error:'No saved backtest'},{status:404});
   return new NextResponse(backtestTradeLog(state.trades,regimeTags(state)),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="crypto-backtest-trades-${state.startedAt.slice(0,10)}.csv"`,'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({error:'Backtest trade log unavailable'},{status:503});}
 }
 try{return NextResponse.json({simulated:true,...view(await savedBacktest())});}catch{return NextResponse.json({error:'Saved backtest unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 const body=await req.json().catch(()=>null);if(!['start','next','stamp'].includes(body?.action))return NextResponse.json({error:'Valid backtest action required'},{status:400});
 if(cryptoMarketsPaused())return pausedCryptoMarketsResponse();
 try{
  if(body.action==='start')return NextResponse.json({simulated:true,...view(await startBacktest(Date.now(),Number(body.endDaysAgo??0)))});
  if(body.action==='stamp'){const r=await stampSavedBacktest();return NextResponse.json({simulated:true,...view(r.state),stamp:{stamped:r.stamped,fromCache:r.fromCache,remaining:r.remaining,skipped:r.skipped}});}
  const r=await runBacktestBatch();
  return NextResponse.json({simulated:true,...view(r.state),...(r.busy?{error:'Backtest batch already running; showing saved progress'}:{})},{status:r.busy?429:200});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Backtest failed'},{status:503});}
}
