import {cryptoOpsAlertState,testCryptoOpsEmail} from '@/lib/admin/cryptoOpsAlerts';
import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/adminAuth';
import {cryptoSetupEmailState,testCryptoSetupEmail} from '@/lib/admin/cryptoSetupEmail';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{return NextResponse.json({...await cryptoSetupEmailState(),operations:await cryptoOpsAlertState()});}catch{return NextResponse.json({error:'Email status unavailable'},{status:503});}
}
export async function POST(req:Request){
 if(!(await requireAdmin(req)).ok)return NextResponse.json({error:'Unauthorized'},{status:403});
 try{const body=await req.json().catch(()=>({}));if(body.action==='test_operations'){await testCryptoOpsEmail();return NextResponse.json({...await cryptoSetupEmailState(),operations:await cryptoOpsAlertState(),notice:'Operational test accepted or previously accepted this hour; check inbox/spam.'});}const accepted=await testCryptoSetupEmail();return NextResponse.json({...await cryptoSetupEmailState(),operations:await cryptoOpsAlertState(),notice:accepted?'Test accepted by email provider; check your inbox and spam folder.':'Test already sent or reserved this hour.'});}
 catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Test failed'},{status:503});}
}
