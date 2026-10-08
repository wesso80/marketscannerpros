import {beforeEach,it,expect,vi} from 'vitest';
import {NextRequest,NextResponse} from 'next/server';
const h=vi.hoisted(()=>({enabled:true,session:{workspaceId:'w'},access:{bypass:false,subject:'account:w',plan:'free'},reserve:vi.fn(),settle:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>h.session}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>h.enabled,resolvePublicQuotaAccess:async()=>h.access,publicRequestFingerprint:(s:string)=>s,publicQuota:{reserve:h.reserve,settle:h.settle}}));
vi.mock('@/lib/rateLimit',()=>({aiLimiter:{check:()=>({allowed:true})},getClientIP:()=> 'fixture'}));
import {withPublicAiQuota,publicAiScope,markPublicAiProviderStarted} from '@/lib/publicAiQuota';
const req=(body:unknown={message:'hello'},id='fixture-id')=>new NextRequest('http://localhost/api/ai/copilot',{method:'POST',headers:{'Idempotency-Key':id},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();h.enabled=true;h.access={bypass:false,subject:'account:w',plan:'free'};h.reserve.mockResolvedValue({status:'reserved',reservation:{token:'a'},limit:5,used:1});h.settle.mockResolvedValue(true);});
it('reserves before execution, scopes verified plan and stores the replay before returning',async()=>{
 const run=vi.fn(async()=>{expect(h.reserve).toHaveBeenCalled();expect(publicAiScope()?.plan).toBe('free');return NextResponse.json({content:'fixture answer'});});
 const r=await withPublicAiQuota(run,'copilot')(req());expect(r.status).toBe(200);expect(h.settle).toHaveBeenCalledWith({token:'a'},'completed',{content:'fixture answer'});expect(r.headers.get('cache-control')).toBe('private, no-store');expect(publicAiScope()).toBeUndefined();
});
it('replays without executing and rejects pending, conflicting and over-limit requests',async()=>{
 const run=vi.fn();const call=withPublicAiQuota(run,'copilot');h.reserve.mockResolvedValueOnce({status:'completed',replay:{content:'saved'}});
 expect((await (await call(req())).json()).content).toBe('saved');
 for(const [status,code] of [['pending',409],['conflict',409],['limited',429]] as const){h.reserve.mockResolvedValueOnce({status});expect((await call(req())).status).toBe(code);}
 expect(run).not.toHaveBeenCalled();
});
it('releases definite validation failure but holds uncertain exceptions and 5xx',async()=>{
 await withPublicAiQuota(async()=>NextResponse.json({error:'bad input'},{status:400}),'copilot')(req());expect(h.settle).toHaveBeenCalledWith({token:'a'},'released');h.settle.mockClear();
 expect((await withPublicAiQuota(async()=>{markPublicAiProviderStarted();throw Error('timeout');},'copilot')(req())).status).toBe(503);expect(h.settle).not.toHaveBeenCalled();
 await withPublicAiQuota(async()=>{markPublicAiProviderStarted();return NextResponse.json({error:'unknown'},{status:500});},'copilot')(req());expect(h.settle).not.toHaveBeenCalled();
});
it('is unchanged for disabled rollout/admin and rejects invalid IDs before admission',async()=>{
 const run=vi.fn(async()=>NextResponse.json({ok:true}));h.enabled=false;await withPublicAiQuota(run,'copilot')(req());expect(h.reserve).not.toHaveBeenCalled();
 h.enabled=true;expect((await withPublicAiQuota(run,'copilot')(req({},'x'))).status).toBe(400);expect(h.reserve).not.toHaveBeenCalled();
});
it('canonicalizes JSON key order but binds changed context to a different fingerprint',async()=>{
 const call=withPublicAiQuota(async()=>NextResponse.json({ok:true}),'copilot');await call(req({a:1,b:2}));await call(req({b:2,a:1}));await call(req({a:2,b:2}));
 expect(h.reserve.mock.calls[0][0].fingerprint).toBe(h.reserve.mock.calls[1][0].fingerprint);expect(h.reserve.mock.calls[0][0].fingerprint).not.toBe(h.reserve.mock.calls[2][0].fingerprint);
});

it('does not spend allowance when service configuration fails before a provider call',async()=>{
 const r=await withPublicAiQuota(async()=>NextResponse.json({error:'No API key'},{status:500}),'copilot')(req());
 expect(r.status).toBe(500);expect(h.settle).toHaveBeenCalledWith({token:'a'},'released');
});
