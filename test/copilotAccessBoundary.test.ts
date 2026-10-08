import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest,NextResponse} from 'next/server';
const h=vi.hoisted(()=>({enabled:true,session:{workspaceId:'w',cid:'reader',tier:'pro'} as any,access:{bypass:false,subject:'account:w',plan:'pro'} as any,operator:false,authFails:false,reserve:vi.fn(),settle:vi.fn(),publicRun:vi.fn(),legacyRun:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>{if(h.authFails)throw Error('PRIVATE_SECRET');return h.session;}}));
vi.mock('@/lib/quant/operatorAuth',()=>({isOperator:()=>h.operator}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>h.enabled,resolvePublicQuotaAccess:async()=>h.access,publicRequestFingerprint:(s:string)=>s,publicQuota:{reserve:h.reserve,settle:h.settle}}));
vi.mock('@/lib/rateLimit',()=>({aiLimiter:{check:()=>({allowed:true})},getClientIP:()=> 'fixture'}));
vi.mock('@/lib/ai/publicCopilot',()=>({publicCopilot:(req:NextRequest)=>h.publicRun(req)}));
import {withPublicAiQuota,publicAiScope} from '@/lib/publicAiQuota';
import {routeCopilotRequest} from '@/lib/ai/copilotAccess';
const call=withPublicAiQuota(req=>routeCopilotRequest(req,h.legacyRun),'ai/copilot');
const request=()=>new NextRequest('http://fixture.test/api/ai/copilot',{method:'POST',headers:{'Idempotency-Key':'fixture-request','x-admin-secret':'untrusted-client'},body:JSON.stringify({message:'Explain this page',is_admin:true,tier:'admin',tool:'generate_trade_plan'})});
beforeEach(()=>{
 vi.clearAllMocks();h.enabled=true;h.session={workspaceId:'w',cid:'reader',tier:'pro'};h.access={bypass:false,subject:'account:w',plan:'pro'};h.operator=false;h.authFails=false;
 h.reserve.mockResolvedValue({status:'reserved',reservation:{token:'a'},limit:20,used:1});h.settle.mockResolvedValue(true);
 h.publicRun.mockImplementation(async()=>{expect(publicAiScope()?.plan).toBe('pro');return NextResponse.json({content:'Educational answer'});});
 h.legacyRun.mockImplementation(async()=>NextResponse.json({content:'Private legacy answer'}));
});
it.each(['pro','pro_trader'])('routes verified %s access through public evidence only',async tier=>{
 h.session.tier=tier;expect((await call(request())).status).toBe(200);expect(h.publicRun).toHaveBeenCalledOnce();expect(h.legacyRun).not.toHaveBeenCalled();
});
it('denies Free before either handler or quota reservation',async()=>{
 h.access.plan='free';expect((await call(request())).status).toBe(403);expect(h.reserve).not.toHaveBeenCalled();expect(h.publicRun).not.toHaveBeenCalled();expect(h.legacyRun).not.toHaveBeenCalled();
});
it.each(['free','pro','pro_trader'])('never falls back for %s with rollout off, ignoring body/header claims',async tier=>{
 h.enabled=false;h.session.tier=tier;const response=await call(request());expect(response.status).toBe(503);expect(response.headers.get('cache-control')).toBe('private, no-store');expect((await response.json()).code).toBe('PUBLIC_COPILOT_UNAVAILABLE');
 expect(h.reserve).not.toHaveBeenCalled();expect(h.publicRun).not.toHaveBeenCalled();expect(h.legacyRun).not.toHaveBeenCalled();
});
it.each([true,false])('requires sign-in with rollout %s',async enabled=>{
 h.enabled=enabled;h.session=null;expect((await call(request())).status).toBe(401);expect(h.legacyRun).not.toHaveBeenCalled();
});
it.each([true,false])('preserves signed admin and operator handling with rollout %s',async enabled=>{
 h.enabled=enabled;h.access={bypass:true};h.session.is_admin=true;
 expect((await (await call(request())).json()).content).toBe('Private legacy answer');
 h.session.is_admin=false;h.operator=true;expect((await call(request())).status).toBe(200);
 expect(h.legacyRun).toHaveBeenCalledTimes(2);expect(h.publicRun).not.toHaveBeenCalled();expect(h.reserve).not.toHaveBeenCalled();
});
it('fails closed on authentication error with no secret or legacy fallback',async()=>{
 h.enabled=false;h.authFails=true;const response=await call(request());expect(response.status).toBe(503);expect(await response.text()).not.toContain('PRIVATE_SECRET');expect(h.legacyRun).not.toHaveBeenCalled();
});
it('never falls back after an educational handler failure',async()=>{
 h.publicRun.mockResolvedValue(NextResponse.json({error:'Evidence expired'},{status:409}));expect((await call(request())).status).toBe(409);expect(h.legacyRun).not.toHaveBeenCalled();
});
