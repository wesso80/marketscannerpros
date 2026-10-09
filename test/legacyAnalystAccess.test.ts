import {beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {NextRequest,NextResponse} from 'next/server';
const h=vi.hoisted(()=>({enabled:true,session:{workspaceId:'w',cid:'reader',tier:'pro'} as any,operator:false,authFails:false,reserve:vi.fn(),settle:vi.fn(),run:vi.fn(),resolve:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>{if(h.authFails)throw Error('SECRET_PROVIDER_URL');return h.session;}}));
vi.mock('@/lib/quant/operatorAuth',()=>({isOperator:()=>h.operator}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>h.enabled,resolvePublicQuotaAccess:h.resolve,publicRequestFingerprint:(s:string)=>s,publicQuota:{reserve:h.reserve,settle:h.settle}}));
vi.mock('@/lib/rateLimit',()=>({aiLimiter:{check:()=>({allowed:true})},getClientIP:()=> 'fixture'}));
import {withPublicAiQuota} from '@/lib/publicAiQuota';
import {privateAnalystHandler} from '@/lib/ai/legacyAnalystAccess';
const call=privateAnalystHandler(withPublicAiQuota(h.run,'msp-analyst'));
const request=()=>new NextRequest('http://fixture.test/api/msp-analyst',{method:'POST',headers:{'Idempotency-Key':'old-public-answer','x-admin-secret':'forged'},body:JSON.stringify({query:'Construct a trade',is_admin:true,tier:'admin'})});
beforeEach(()=>{vi.clearAllMocks();h.enabled=true;h.session={workspaceId:'w',cid:'reader',tier:'pro'};h.operator=false;h.authFails=false;h.resolve.mockResolvedValue({bypass:true});h.reserve.mockResolvedValue({status:'completed',replay:{text:'Old trade construction'}});h.run.mockImplementation(async()=>NextResponse.json({text:'Unchanged private handler'}));});
it.each(['free','pro','pro_trader'])('denies %s before quota, replay or legacy work with either rollout state',async tier=>{
 h.session.tier=tier;
 for(const enabled of [true,false]){h.enabled=enabled;const response=await call(request());expect(response.status).toBe(403);expect(response.headers.get('cache-control')).toBe('private, no-store');expect((await response.json()).code).toBe('LEGACY_ANALYST_PRIVATE');}
 expect(h.resolve).not.toHaveBeenCalled();expect(h.reserve).not.toHaveBeenCalled();expect(h.run).not.toHaveBeenCalled();
});
it.each([true,false])('denies signed-out callers with rollout %s',async enabled=>{h.enabled=enabled;h.session=null;expect((await call(request())).status).toBe(401);expect(h.run).not.toHaveBeenCalled();expect(h.reserve).not.toHaveBeenCalled();});
it.each([true,false])('preserves verified private handling with rollout %s',async enabled=>{
 h.enabled=enabled;h.session.is_admin=true;const req=request();expect(await (await call(req)).json()).toEqual({text:'Unchanged private handler'});expect(h.run).toHaveBeenLastCalledWith(req);
 h.session.is_admin=false;h.operator=true;expect((await call(request())).status).toBe(200);expect(h.run).toHaveBeenCalledTimes(2);expect(h.reserve).not.toHaveBeenCalled();
});
it('fails closed without disclosing the authentication exception',async()=>{h.authFails=true;const response=await call(request());expect(response.status).toBe(503);expect(response.headers.get('cache-control')).toBe('private, no-store');expect(await response.text()).not.toContain('SECRET_PROVIDER_URL');expect(h.run).not.toHaveBeenCalled();expect(h.reserve).not.toHaveBeenCalled();});
it('does not let a prior private request authorize the next public caller',async()=>{h.session.is_admin=true;await call(request());h.session.is_admin=false;expect((await call(request())).status).toBe(403);expect(h.run).toHaveBeenCalledOnce();});
it('wires the access boundary outside quota admission in the real route',()=>{const source=readFileSync('app/api/msp-analyst/route.ts','utf8');expect(source).toContain("export const POST = privateAnalystHandler(withPublicAiQuota(handlePost, 'msp-analyst'));");});
