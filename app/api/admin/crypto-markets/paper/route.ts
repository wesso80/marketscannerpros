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
 const headers={'Cache-Control':'private, no-store'};
 const auth=await requireAdmin(req);if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403,headers});
 const body=await req.json().catch(()=>null);if(!['enable','pause','cycle','auto_enable','auto_pause'].includes(body?.action))return NextResponse.json({error:'Valid paper action required'},{status:400,headers});
 const steps:{name:string;status:'completed'|'skipped'|'unconfirmed'}[]=[];
 async function perform<T>(name:string,run:()=>Promise<T>):Promise<T>{
  const step:{name:string;status:'completed'|'skipped'|'unconfirmed'}={name,status:'unconfirmed'};steps.push(step);
  const value=await run();
  const report=value as {skipped?:boolean;ok?:boolean;monitorHealthy?:boolean}|null|undefined;
  step.status=report?.ok===false||report?.monitorHealthy===false?'unconfirmed':value===null||report?.skipped?'skipped':'completed';
  return value;
 }
 // Snapshot failure must never reclassify a confirmed setting change as a failed action.
 async function respond(extra:Record<string,unknown>={}){
  const status=steps.some(s=>s.status==='unconfirmed')?'partial':steps.length&&steps.every(s=>s.status==='skipped')?'skipped':'completed';
  const result={simulated:true,...extra,actionResult:{action:body.action,status,steps}};
  try{
   const [automation,state]=await Promise.all([cryptoAutomationState(),fullState(auth.workspaceId!)]);
   return NextResponse.json({...result,automation,...state,snapshot:{status:'available'}},{headers});
  }catch{
   return NextResponse.json({...result,snapshot:{status:'unavailable'},notice:'The action result is recorded below, but the account snapshot could not be refreshed. Refresh saved state before another action.'},{headers});
  }
 }
 try{
  if(body.action.startsWith('auto_')){
   await perform('background_scans',()=>setCryptoAutomation(body.action==='auto_enable'));
   return respond(cryptoMarketsPaused()?pausedCryptoMarketsBody():{});
  }
  if(body.action!=='cycle'){
   await perform('paper_entries',()=>setCryptoPaperActive(auth.workspaceId!,body.action==='enable'));
   try{await perform('base_entries',()=>ensureBaseSleeve(auth.workspaceId!,body.action==='enable'));}catch{/* Report the unconfirmed step; do not pretend the other account change failed. */}
  }
  if(cryptoMarketsPaused()&&(body.action==='cycle'||body.action==='enable')){
   steps.push({name:'paper_cycle',status:'skipped'},{name:'base_cycle',status:'skipped'});
   return respond({...pausedCryptoMarketsBody(),cycle:{paused:true,skipped:true},baseCycle:{paused:true,skipped:true}});
  }
  const cycle=body.action==='pause'?null:await perform('paper_cycle',()=>runCryptoPaperCycle(auth.workspaceId!));
  let baseCycle:unknown=null;
  if(body.action!=='pause'){
   try{baseCycle=await perform('base_cycle',()=>runCryptoBaseSleeveCycle(auth.workspaceId!));}
   catch{baseCycle={skipped:true,reason:'Base-breakout cycle outcome unconfirmed; refresh saved state'};}
  }
  return respond({cycle,baseCycle});
 }catch{
  // An exception may follow a committed write. Never invite blind retry or claim rollback.
  return NextResponse.json({simulated:true,error:'Paper action outcome is unconfirmed. Refresh saved state before deciding whether to retry.',actionResult:{action:body.action,status:'unknown',steps},snapshot:{status:'unavailable'}},{status:503,headers});
 }
}
