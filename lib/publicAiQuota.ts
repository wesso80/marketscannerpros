import type { QuotaReservation } from './publicDailyQuota';
import { AsyncLocalStorage } from 'node:async_hooks';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookie } from '@/lib/auth';
import { publicQuotaEnabled, resolvePublicQuotaAccess, publicQuota, publicRequestFingerprint } from './publicQuotaAccess';
import { aiLimiter, getClientIP } from '@/lib/rateLimit';
const scope = new AsyncLocalStorage<{plan:'free'|'pro';subject:string;fingerprint:string;providerStarted:boolean}>();
export const publicAiScope = () => scope.getStore();
export function markPublicAiProviderStarted(){const active=scope.getStore();if(active)active.providerStarted=true;}
function canonical(value: unknown): string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}';
  return JSON.stringify(value);
}
const reply = (body: unknown,status=200) => NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
/** Only user-visible answer text qualifies; metadata and tool proposals alone do not. */
function hasUsableAnswer(feature: string, value: unknown): value is Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
 const body = value as Record<string, unknown>;
 if (body.error || body.success === false || body.ok === false) return false;
 const text = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
 switch (feature) {
  case 'ai/copilot': return text(body.content);
  case 'msp-analyst': return text(body.text);
  case 'ai/explain':
   return text(body.explanation) && text(body.whyItMatters)
    && (body.actionableInsight == null || typeof body.actionableInsight === 'string');
  case 'ai/analyst-context': {
   const sections = ['explain', 'plan', 'act', 'learn'].map(key => body[key]);
   return sections.every(v => v == null || typeof v === 'string') && sections.some(text);
  }
  default: return false;
 }
}
/** Legacy/admin behaviour is unchanged while disabled or bypassed. All public question callers share one ledger. */
export function withPublicAiQuota(handler:(req:NextRequest)=>Promise<Response>, feature:string) {
 return async (req:NextRequest):Promise<Response> => {
  if(!publicQuotaEnabled())return handler(req);
  let reservation:QuotaReservation|undefined;
  let execution:NonNullable<ReturnType<typeof publicAiScope>>|undefined;
  try {
   const session=await getSessionFromCookie();if(!session?.workspaceId)return reply({error:'Please log in'},401);
   const access=await resolvePublicQuotaAccess(session);if(access.bypass)return handler(req);
   if(access.plan !== 'pro')return reply({code:'COPILOT_PRO_REQUIRED',error:'MSP Copilot requires Pro. Pro includes 20 questions per day.'},403);
   const rate=aiLimiter.check(getClientIP(req));if(!rate.allowed)return reply({error:'Please slow down'},429);
   const raw=await req.clone().text();if(Buffer.byteLength(raw)>180000)return reply({error:'Question context is too large'},413);
   let input: unknown;try{input=JSON.parse(raw);}catch{return reply({error:'Invalid JSON'},400);}
   if(!input||typeof input!=='object'||Array.isArray(input))return reply({error:'Question object required'},400);
   const fingerprint=publicRequestFingerprint(feature+':'+canonical(input));
   const id=req.headers.get('Idempotency-Key');if(id&&!/^[A-Za-z0-9._-]{8,128}$/.test(id))return reply({error:'Invalid request ID'},400);
   const resource=feature+':'+(id || fingerprint);
   const admission=await publicQuota.reserve({subject:access.subject,plan:access.plan,kind:'ai',resource,fingerprint});
   const quota={limit:admission.limit,used:admission.used,resetsAt:admission.resetsAt};
   if(admission.status==='completed')return hasUsableAnswer(feature, admission.replay) ? reply({...admission.replay,quota,replayed:true}) : reply({error:'Saved answer unavailable; this question will not be run again'},503);
   if(admission.status!=='reserved')return reply({error:admission.status==='limited'?'Daily AI question limit reached':'This question is pending or its request ID was reused',quota},admission.status==='limited'?429:409);
   // An exception/5xx can mean an interrupted model call. Hold the reservation rather than spend again.
   reservation=admission.reservation;
   execution={plan:access.plan,subject:access.subject,fingerprint,providerStarted:false};
   const response=await scope.run(execution,()=>handler(req));
   if(!response.ok){if(response.status<500 || !execution.providerStarted)await publicQuota.settle(admission.reservation,'released');response.headers.set('Cache-Control','private, no-store');return response;}
   // Read failures can be interrupted outcomes. Fully received invalid JSON is a known unusable answer.
   const responseText = await response.text();
   let body: unknown;
   try { body = JSON.parse(responseText); } catch { body = null; }
   if (!hasUsableAnswer(feature, body)) {
    const released = await publicQuota.settle(admission.reservation, 'released');
    return reply({error: released
     ? 'AI answer unavailable. No question credit was used.'
     : 'Question credit release could not be confirmed. Retry with the same request ID.'}, 503);
   }
   if(!await publicQuota.settle(admission.reservation,'completed',body))return reply({error:'Answer completion could not be confirmed'},503);
   return reply({...body,quota},response.status);
  }catch{if(reservation && !execution?.providerStarted){try{await publicQuota.settle(reservation,'released');}catch{/* fail closed */}}return reply({error:'AI request outcome could not be confirmed. Retry with the same request ID.'},503);}
 };
}
