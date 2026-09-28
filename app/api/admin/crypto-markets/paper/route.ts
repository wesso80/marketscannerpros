import {cryptoAutomationState,setCryptoAutomation} from '@/lib/admin/cryptoAutomation';
import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {cryptoPaperState,setCryptoPaperActive,runCryptoPaperCycle} from '@/lib/admin/cryptoPaper';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
 const auth=await requireAdmin(req);if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json({simulated:true,automation:await cryptoAutomationState(),...await cryptoPaperState(auth.workspaceId)});}catch{return NextResponse.json({error:'Crypto paper ledger unavailable'},{status:503});}
}
export async function POST(req:Request){
 const auth=await requireAdmin(req);if(!auth.ok||!auth.workspaceId)return NextResponse.json({error:'Unauthorized'},{status:403});
 const body=await req.json().catch(()=>null);if(!['enable','pause','cycle','auto_enable','auto_pause'].includes(body?.action))return NextResponse.json({error:'Valid paper action required'},{status:400});
 try{
  if(body.action.startsWith('auto_')){
   await setCryptoAutomation(body.action==='auto_enable');
   return NextResponse.json({simulated:true,automation:await cryptoAutomationState(),...await cryptoPaperState(auth.workspaceId)});
  }
  if(body.action!=='cycle')await setCryptoPaperActive(auth.workspaceId,body.action==='enable');
  const cycle=body.action==='pause'?null:await runCryptoPaperCycle(auth.workspaceId);
  return NextResponse.json({simulated:true,cycle,automation:await cryptoAutomationState(),...await cryptoPaperState(auth.workspaceId)});
 }catch{return NextResponse.json({error:'Paper action failed; reload saved account state before retrying'},{status:503});}
}
