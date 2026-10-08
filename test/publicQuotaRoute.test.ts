import { beforeEach, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
const h=vi.hoisted(()=>({enabled:true,session:{workspaceId:'fixture'} as any,paid:false,reserve:vi.fn(),settle:vi.fn(),resolve:vi.fn(),compute:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSessionFromCookie:async()=>h.session}));
vi.mock('@/lib/proTraderAccess',()=>({hasPaidSessionAccess:()=>h.paid}));
vi.mock('@/lib/publicQuotaAccess',()=>({publicQuotaEnabled:()=>h.enabled,resolvePublicActor:h.resolve,publicInstrumentKey:(s:string)=>'equity:'+s,publicQuota:{reserve:h.reserve,settle:h.settle}}));
vi.mock('@/lib/goldenEggFetchers',()=>({detectAssetClass:()=> 'equity'}));
vi.mock('@/lib/goldenEgg/engine',()=>({computeGoldenEgg:h.compute,tfLabelFor:()=> '1D',isLocalGoldenEggDemoAllowed:()=>false}));
vi.mock('@/lib/research/publicSymbolPacket',()=>({toPublicSymbolPacket:(p:unknown)=>p}));
vi.mock('@/lib/scanner/providerStatus',()=>({buildMarketDataProviderStatus:()=>({})}));
import { GET } from '@/app/api/golden-egg/route';
const call=(params='symbol=AAPL')=>GET(new NextRequest('http://localhost/api/golden-egg?'+params));
beforeEach(()=>{vi.clearAllMocks();h.enabled=true;h.session={workspaceId:'fixture'};h.paid=false;h.resolve.mockResolvedValue({bypass:false,subject:'account:fixture',plan:'free'});h.reserve.mockResolvedValue({status:'reserved',reservation:{token:'fixture'},day:'2026-10-08',resetsAt:'2026-10-09T04:00:00Z',limit:3,used:1});h.settle.mockResolvedValue(true);h.compute.mockResolvedValue({payload:{canonical:{symbol:'AAPL'}},warnings:[],dataQuality:{}});});
it('allows a Free core report, completing only after successful public projection',async()=>{
 const r=await call();expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('private, no-store');
 expect(h.reserve.mock.calls[0][0]).toMatchObject({plan:'free',kind:'symbol',resource:'equity:AAPL'});
 expect(h.settle).toHaveBeenCalledWith({token:'fixture'},'completed');const body=await r.json();expect(body.quota.used).toBe(1);expect(body.reportUnlocked).toBe(true);
});
it('denies at the limit before expensive work and leaves completed revisits uncharged',async()=>{
 h.reserve.mockResolvedValue({status:'limited',limit:3,used:3});expect((await call()).status).toBe(429);expect(h.compute).not.toHaveBeenCalled();
 h.reserve.mockResolvedValue({status:'completed',limit:3,used:3});expect((await call()).status).toBe(200);expect(h.settle).not.toHaveBeenCalled();
});
it('releases failed computation but holds unknown completion outcomes',async()=>{
 h.compute.mockRejectedValueOnce(Error('Unable to fetch price data'));expect((await call()).status).toBe(404);expect(h.settle).toHaveBeenCalledWith({token:'fixture'},'released');
 h.settle.mockClear().mockRejectedValueOnce(Error('offline'));expect((await call()).status).toBe(503);expect(h.settle).toHaveBeenCalledTimes(1);expect(h.settle).toHaveBeenCalledWith({token:'fixture'},'completed');
});
it('keeps admin bypass and disabled rollout unchanged, and fails closed on tier errors',async()=>{
 h.enabled=false;expect((await call()).status).toBe(403);expect(h.resolve).not.toHaveBeenCalled();
 h.enabled=true;h.resolve.mockResolvedValueOnce({bypass:true});expect((await call()).status).toBe(200);expect(h.reserve).not.toHaveBeenCalled();
 h.resolve.mockRejectedValueOnce(Error('database unavailable'));expect((await call()).status).toBe(503);
});
it('checks authentication and input before admission and does not count demos',async()=>{
 h.session=null;h.resolve.mockResolvedValueOnce(null);expect((await call()).status).toBe(401);h.session={workspaceId:'fixture'};
 expect((await call('')).status).toBe(400);expect(h.reserve).not.toHaveBeenCalled();
 h.compute.mockResolvedValueOnce({payload:{canonical:{}},localDemo:true,warnings:[]});await call();expect(h.settle).toHaveBeenCalledWith({token:'fixture'},'released');
});

it('does not grant the new core-report display entitlement for demos, missing evidence or legacy access',async()=>{
 for(const result of [{payload:{canonical:{}},localDemo:true,warnings:[]},{payload:{},warnings:[]}]){
  h.compute.mockResolvedValueOnce(result);expect((await (await call()).json()).reportUnlocked).toBe(false);
 }
 h.enabled=false;h.paid=true;expect((await (await call()).json()).reportUnlocked).toBe(false);
});
it('confirms a completed report revisit and signed visitor without a second charge',async()=>{
 h.session=null;h.resolve.mockResolvedValue({bypass:false,subject:'visitor:fixture',plan:'visitor'});
 h.reserve.mockResolvedValue({status:'completed',limit:1,used:1});
 expect((await (await call()).json()).reportUnlocked).toBe(true);expect(h.settle).not.toHaveBeenCalled();
});

it.each([['limited',429,'SYMBOL_DAILY_LIMIT'],['pending',409,'SYMBOL_REPORT_PENDING']] as const)('returns explicit %s access metadata without provider work',async(status,http,code)=>{
 h.reserve.mockResolvedValue({status,limit:3,used:3,resetsAt:'2026-11-02T05:00:00Z'});
 const response=await call();expect(response.status).toBe(http);expect(await response.json()).toMatchObject({code,plan:'free',quota:{resetsAt:'2026-11-02T05:00:00Z'}});expect(h.compute).not.toHaveBeenCalled();
});
