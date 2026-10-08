import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const h=vi.hoisted(()=>({session:{workspaceId:'free-a'} as any,access:{bypass:false,plan:'free'} as any,compute:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>h.session}));
vi.mock('@/lib/publicQuotaAccess',()=>({resolvePublicQuotaAccess:async()=>h.access}));
vi.mock('@/lib/intelligence/data/globalM2Pipeline',()=>({buildWave3Bundle:h.compute}));
const bundle=()=>({calculatedAt:'2026-10-01',result:{quality:{parityStatus:'PENDING',missingBlocCount:10,estimatedWeightedCoveragePercent:19,coveragePercent:9},totalUsd:1e12,validBlocCount:1,oneMonthPct:0,threeMonthPct:12,threeMonthAnnualizedPct:48,yoyPct:null,accelerationState:'PRIVATE',liquidityCycle:'PRIVATE',turnState:'PRIVATE',blocs:[{id:'US',name:'United States',classification:'EXACT',provider:'Fixture bank',usdM2:1e12,shareOfGlobal:100,r1:0,r3:12,r12:null,observationMonth:'2026-08',stale:true,history:['PRIVATE']}]},providerStatus:[{id:'US',ok:true,health:'STALE'},{id:'JP',ok:false,error:'https://provider.test?key=SECRET'}],excludedBlocs:[],eligibility:{weightedCoverageThreshold:95,interpretationEligible:false,calculationStatus:'PARTIAL'}});
beforeEach(()=>{vi.resetModules();vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','true');vi.stubEnv('INTELLIGENCE_LIVE_DATA','true');h.session={workspaceId:'free-a'};h.access={bypass:false,plan:'free'};h.compute.mockReset().mockResolvedValue(bundle());});
afterEach(()=>vi.unstubAllEnvs());
const req=(query='?view=summary')=>new NextRequest('https://fixture.test/api/intelligence/global-m2'+query);
it('Free receives current measurements and trust fields without model labels or history',async()=>{
 const {GET}=await import('@/app/api/intelligence/global-m2/route');const r=await GET(req());const b=await r.json();
 expect(r.status).toBe(200);expect(b.data.contract).toBe('public-m2-summary-v1');expect(b.data.oneMonthPct).toBe(0);expect(b.data.yoyPct).toBeNull();
 expect(b.data.blocs[0]).toMatchObject({provider:'Fixture bank',observationMonth:'2026-08',stale:true});
 expect(JSON.stringify(b)).not.toMatch(/PRIVATE|SECRET|history|accelerationState|liquidityCycle|turnState|threeMonth|"r3"/);
 expect(b.data.missing[0].reason).toBe('Observation unavailable from this source.');expect(r.headers.get('cache-control')).toContain('private, no-store');
});
it('projects the shared cached Pro reading again for Free and another account',async()=>{
 const {GET}=await import('@/app/api/intelligence/global-m2/route');h.access={bypass:false,plan:'pro'};
 const pro=await (await GET(req(''))).json();expect(pro.data.accelerationState).toBe('PRIVATE');
 h.access={bypass:false,plan:'free'};h.session={workspaceId:'free-b'};const free=await (await GET(req())).json();
 expect(h.compute).toHaveBeenCalledTimes(1);expect(free.source).toBe('live-cached');expect(JSON.stringify(free)).not.toMatch(/PRIVATE|free-b/);
 expect((await GET(req(''))).status).toBe(403);
});
it.each(['','?view=history','?view=summary&history=true'])('does not grant history with a query parameter %s',async query=>{
 const {GET}=await import('@/app/api/intelligence/global-m2/route');const r=await GET(req(query));
 if(query.includes('view=summary')){expect(r.status).toBe(200);expect(JSON.stringify(await r.json())).not.toMatch(/PRIVATE|history/);}
 else {expect(r.status).toBe(403);expect(h.compute).not.toHaveBeenCalled();}
});
it('signed out is refused before provider work even on summary',async()=>{
 h.session=null;const {GET}=await import('@/app/api/intelligence/global-m2/route');const r=await GET(req());expect(r.status).toBe(401);expect(h.compute).not.toHaveBeenCalled();expect(r.headers.get('cache-control')).toContain('no-store');
});
it('preserves admin detailed access and disabled missing-data behavior',async()=>{
 h.access={bypass:true};vi.stubEnv('INTELLIGENCE_LIVE_DATA','false');const {GET}=await import('@/app/api/intelligence/global-m2/route');
 expect((await GET(req(''))).status).toBe(200);const b=await (await GET(req())).json();expect(b.data.enabled).toBe(false);expect(b.data.blocs).toEqual([]);expect(h.compute).not.toHaveBeenCalled();
});
it('does not echo raw provider failure text',async()=>{
 h.compute.mockRejectedValue(Error('https://provider.test?key=SECRET'));const {GET}=await import('@/app/api/intelligence/global-m2/route');const r=await GET(req());expect(JSON.stringify(await r.json())).not.toContain('SECRET');
});
it('keeps flag-off legacy behavior and does not expose the new summary',async()=>{
 vi.stubEnv('NEXT_PUBLIC_PUBLIC_REDESIGN_ENABLED','false');vi.stubEnv('INTELLIGENCE_LIVE_DATA','false');const {GET}=await import('@/app/api/intelligence/global-m2/route');
 expect((await GET()).status).toBe(200);expect((await GET(req())).status).toBe(404);
});
