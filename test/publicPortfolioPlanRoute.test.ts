import {beforeEach,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({enabled:true,access:{bypass:false,plan:'free'} as any,result:{status:'saved',revision:'r',cashStateSaved:true} as any}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>({workspaceId:'account-a',tier:'pro',cid:'person'})}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>state.enabled,resolvePublicQuotaAccess:vi.fn(async()=>state.access)}));
vi.mock('@/lib/db',()=>({q:async()=>[],tx:async(fn:any)=>fn({})}));
vi.mock('@/lib/portfolio/serverSync',()=>({replacePortfolio:vi.fn(async()=>state.result),sqlErrorCode:()=>undefined}));
vi.mock('@/lib/risk/runtimeSnapshot',()=>({getRuntimeRiskSnapshotInput:async()=>({})}));
vi.mock('@/lib/risk-governor-hard',()=>({buildPermissionSnapshot:()=>({risk_mode:'NORMAL'})}));
import {replacePortfolio} from '@/lib/portfolio/serverSync';
import {resolvePublicQuotaAccess} from '@/lib/publicQuotaAccess';
import {POST} from '@/app/api/portfolio/route';
const request=()=>new NextRequest('http://fixture.test/api/portfolio',{method:'POST',body:JSON.stringify({positions:[],closedPositions:[],performanceHistory:[],cashState:{startingCapital:100,cashLedger:[]},baseRevision:'r'})});
beforeEach(()=>{vi.clearAllMocks();state.enabled=true;state.access={bypass:false,plan:'free'};state.result={status:'saved',revision:'r',cashStateSaved:true};});
it.each([{bypass:false,plan:'free',limit:3},{bypass:false,plan:'pro',limit:undefined},{bypass:true,limit:undefined}])('uses verified access for %j',async ({limit,...access})=>{
 state.access=access;expect((await POST(request())).status).toBe(200);
 expect(vi.mocked(replacePortfolio).mock.calls[0][3].positionLimit).toBe(limit);
});
it('leaves legacy mode unchanged',async()=>{
 state.enabled=false;await POST(request());expect(resolvePublicQuotaAccess).not.toHaveBeenCalled();
 expect(vi.mocked(replacePortfolio).mock.calls[0][3].positionLimit).toBeUndefined();
});
it('returns a private refusal for over-limit saves',async()=>{
 state.result={status:'limited',limit:3};const response=await POST(request());
 expect(response.status).toBe(403);expect(response.headers.get('cache-control')).toBe('private, no-store');
 expect(await response.json()).toMatchObject({limitReached:true,limit:3});
});
