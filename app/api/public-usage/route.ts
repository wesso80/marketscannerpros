import { VISITOR_COOKIE, issueVisitor, verifyVisitor } from '@/lib/publicVisitor';
import { apiLimiter,getClientIP } from '@/lib/rateLimit';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { publicQuotaEnabled, publicQuota, resolvePublicActor } from '@/lib/publicQuotaAccess';
export const dynamic = 'force-dynamic';
const reply = (data: unknown, status = 200) => NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(request:NextRequest) {
  if (!publicQuotaEnabled()) return reply({enabled:false});
  try {
    const session = await getSessionFromCookie();
    const access = await resolvePublicActor(request,session);
    if(!access)return reply({enabled:true,needsVisitor:true});
    if (access.bypass) return reply({enabled:true,bypass:true});
    return reply({enabled:true,...await publicQuota.status(access.subject,access.plan)});
  } catch { return reply({error:'Usage temporarily unavailable'},503); }
}

export async function POST(request:NextRequest) {
 if(!publicQuotaEnabled())return reply({enabled:false},404);
 // Browser opt-in only; refuse cross-origin cookie issuance.
 if(request.headers.get('origin')!==request.nextUrl.origin)return reply({error:'Same-origin request required'},403);
 const rate=apiLimiter.check(getClientIP(request));if(!rate.allowed)return reply({error:'Please slow down'},429);
 try{
  const current=request.cookies.get(VISITOR_COOKIE)?.value;
  const token=verifyVisitor(current)?current!:issueVisitor();
  const response=reply({enabled:true,ready:true});
  response.cookies.set(VISITOR_COOKIE,token,{httpOnly:true,secure:request.nextUrl.protocol==='https:',sameSite:'lax',path:'/',maxAge:30*86400});
  return response;
 }catch{return reply({error:'Visitor access temporarily unavailable'},503);}
}
