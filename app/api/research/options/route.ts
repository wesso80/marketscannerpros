import { NextRequest, NextResponse } from 'next/server';
import { checkOptionsAccess } from '@/lib/options/access';
import { apiLimiter, getClientIP } from '@/lib/rateLimit';
import { optionsAnalyzer } from '@/lib/options-confluence-analyzer';
import { toPublicOptionsEvidence } from '@/lib/research/publicOptionsScan';
import { sectionEvidenceToken } from '@/lib/ai/sectionEvidenceAccess';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Cookie'}});
/** Measurement-only path: no adaptive profile, state machine, actions or scoring-route orchestration. */
export async function GET(request:NextRequest){
 try{
  const access=await checkOptionsAccess(request);if(!access.ok)return reply({success:false,error:'Paid access required'},access.status);
  if(!apiLimiter.check(getClientIP(request)).allowed)return reply({success:false,error:'Please slow down'},429);
  const symbol=(request.nextUrl.searchParams.get('symbol')??'').trim().toUpperCase();
  const expiry=request.nextUrl.searchParams.get('expiry');
  if(!/^[A-Z][A-Z0-9.-]{0,11}$/.test(symbol) || expiry&&!/^\d{4}-\d{2}-\d{2}$/.test(expiry))return reply({success:false,error:'Invalid symbol or expiry'},400);
  const analysis=await optionsAnalyzer.analyzeForOptions(symbol,'swing_1d',expiry??undefined);
  const data=toPublicOptionsEvidence(analysis,{chainQuality:null,providerWarnings:['Supplementary quoted-contract quality counts are not collected by this read-only endpoint.']});
  const token=await sectionEvidenceToken('options',symbol,analysis.assetType==='crypto'?'crypto':'equity',data,data.chain.expiry);
  return reply({success:true,data,...(token?{copilotEvidenceToken:token}:{})});
 }catch{return reply({success:false,error:'Options evidence unavailable'},503);}
}
