import {cryptoAutomationState,setCryptoAutomation} from '@/lib/admin/cryptoAutomation';
import {cryptoMarketsPaused,pausedCryptoMarketsBody} from '@/lib/admin/cryptoMarketsPause';
import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {cryptoPaperState,setCryptoPaperActive,runCryptoPaperCycle,cryptoPaperTradeLog} from '@/lib/admin/cryptoPaper';
import {cryptoBaseSleeveState,ensureBaseSleeve,runCryptoBaseSleeveCycle} from '@/lib/admin/cryptoPaperBase';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function fullState(workspaceId:string){
 const [state,base]=await Promise.all([cryptoPaperState(workspaceId),cryptoBaseSleeveState(workspaceId)]);
 return {...state,base};
}
export async function GET(req:Request){
 const auth=await requireAdmin(req);if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403});
 if(new URL(req.url).searchParams.get('format')==='csv'){
  try{const csv=await cryptoPaperTradeLog(auth.workspaceId);if(csv==null)return NextResponse.json({error:'Crypto paper account not enabled'},{status:404});
   return new NextResponse(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="crypto-paper-trades-${new Date().toISOString().slice(0,10)}.csv"`,'Cache-Control':'no-store'}});}
  catch{return NextResponse.json({error:'Trade log unavailable'},{status:503});}
 }
 try{return NextResponse.json({simulated:true,automation:await cryptoAutomationState(),...await fullState(auth.workspaceId)});}catch{return NextResponse.json({error:'Crypto paper ledger unavailable'},{status:503});}
}
export async function POST(req:Request){
 const auth=await requireAdmin(req);if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403});
 const body=await req.json().catch(()=>null);if(!['enable','pause','cycle','auto_enable','auto_pause'].includes(body?.action))return NextResponse.json({error:'Valid paper action required'},{status:400});
 try{
  if(body.action.startsWith('auto_')){
   await setCryptoAutomation(body.action==='auto_enable');
   return NextResponse.json({simulated:true,automation:await cryptoAutomationState(),...await fullState(auth.workspaceId),...(cryptoMarketsPaused()?pausedCryptoMarketsBody():{})});
  }
  if(cryptoMarketsPaused()&&(body.action==='cycle'||body.action==='enable')){
   if(body.action==='enable'){await setCryptoPaperActive(auth.workspaceId,true);try{await ensureBaseSleeve(auth.workspaceId,true);}catch{}}
   return NextResponse.json({simulated:true,...pausedCryptoMarketsBody(),cycle:{paused:true,skipped:true},baseCycle:{paused:true,skipped:true},automation:await cryptoAutomationState(),...await fullState(auth.workspaceId)});
  }
  if(body.action!=='cycle'){await setCryptoPaperActive(auth.workspaceId,body.action==='enable');try{await ensureBaseSleeve(auth.workspaceId,body.action==='enable');}catch{}}
  const cycle=body.action==='pause'?null:await runCryptoPaperCycle(auth.workspaceId);
  let baseCycle:unknown=null;
  if(body.action!=='pause'){try{baseCycle=await runCryptoBaseSleeveCycle(auth.workspaceId);}catch{baseCycle={skipped:true,reason:'Base-breakout cycle failed'};}}
  return NextResponse.json({simulated:true,cycle,baseCycle,automation:await cryptoAutomationState(),...await fullState(auth.workspaceId)});
 }catch{return NextResponse.json({error:'Paper action failed; reload saved account state before retrying'},{status:503});}
}
