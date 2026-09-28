import {beforeEach,afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/redis',()=>({getRedis:vi.fn()}));
vi.mock('@/lib/admin/adminCrypto',()=>({isAdminCryptoEnabled:()=>true}));
vi.mock('@/lib/admin/cryptoDiscoveryBatch',()=>({runDiscoveryBatch:vi.fn()}));
vi.mock('@/lib/admin/cryptoMomentumBatch',()=>({runMomentumBatch:vi.fn()}));
vi.mock('@/lib/admin/cryptoBaseBatch',()=>({runBaseBatch:vi.fn()}));
import {getRedis} from '@/lib/redis';
import {runDiscoveryBatch} from '@/lib/admin/cryptoDiscoveryBatch';
import {runMomentumBatch} from '@/lib/admin/cryptoMomentumBatch';
import {runBaseBatch} from '@/lib/admin/cryptoBaseBatch';
import {runCryptoAutomation} from '@/lib/admin/cryptoAutomation';
let saved:Record<string,unknown>,set:ReturnType<typeof vi.fn>;
const now=Date.parse('2026-09-28T08:15:00Z');
beforeEach(()=>{
 vi.clearAllMocks();vi.spyOn(Date,'now').mockReturnValue(now);
 saved={'admin:crypto-markets:automation:v1':true};
 set=vi.fn(async()=> 'OK');vi.mocked(getRedis).mockReturnValue({get:vi.fn(async(k:string)=>saved[k]),set} as never);
 vi.mocked(runDiscoveryBatch).mockImplementation(async()=>Response.json({snapshot:{requests:17}}));
 vi.mocked(runMomentumBatch).mockImplementation(async()=>Response.json({requestAttempts:100,scan:{rows:[]}}));
 vi.mocked(runBaseBatch).mockImplementation(async()=>Response.json({requestAttempts:20,scan:{rows:[]}}));
});
afterEach(()=>vi.restoreAllMocks());
it('defaults off and never calls providers until enabled',async()=>{
 saved={};expect(await runCryptoAutomation()).toMatchObject({enabled:false});expect(runDiscoveryBatch).not.toHaveBeenCalled();expect(runMomentumBatch).not.toHaveBeenCalled();
});
it('refreshes discovery and advances bounded scans',async()=>{
 expect(await runCryptoAutomation()).toMatchObject({ok:true});expect(runDiscoveryBatch).toHaveBeenCalledOnce();expect(runMomentumBatch).toHaveBeenCalledWith(100);expect(runBaseBatch).toHaveBeenCalledWith(20);
});
it('reuses a fresh discovery snapshot',async()=>{
 saved['admin:crypto-discovery:v1']={startedAt:new Date(now-1000).toISOString(),rows:[{}]};await runCryptoAutomation();expect(runDiscoveryBatch).not.toHaveBeenCalled();
});
it('completed current scan windows do not refresh discovery each quarter hour',async()=>{
 saved['admin:crypto-markets:momentum-volume:v1']={startedAt:new Date(now).toISOString(),rows:[{}]};saved['admin:crypto-markets:bases:v1']={startedAt:new Date(now).toISOString(),version:2,rows:[{}]};await runCryptoAutomation();expect(runDiscoveryBatch).not.toHaveBeenCalled();
});
it('blocks overlapping scheduled invocations',async()=>{
 set.mockResolvedValue(null);expect(await runCryptoAutomation()).toMatchObject({skipped:true,ok:false});expect(runMomentumBatch).not.toHaveBeenCalled();
});
it('reports stale discovery rejection honestly rather than success',async()=>{
 vi.mocked(runMomentumBatch).mockImplementation(async()=>Response.json({error:'Refresh discovery'},{status:409}));expect(await runCryptoAutomation()).toMatchObject({ok:false});expect(runBaseBatch).not.toHaveBeenCalled();
});

it('retries discovery when a current-window scan contains no coins',async()=>{
 saved['admin:crypto-markets:momentum-volume:v1']={startedAt:new Date(now).toISOString(),rows:[]};
 saved['admin:crypto-markets:bases:v1']={startedAt:new Date(now).toISOString(),version:2,rows:[{}]};
 await runCryptoAutomation();expect(runDiscoveryBatch).toHaveBeenCalledOnce();
});
it('does not label a provider cooldown as completed scan work',async()=>{
 vi.mocked(runMomentumBatch).mockImplementation(async()=>Response.json({error:'Cooling down'},{status:429}));
 expect(await runCryptoAutomation()).toMatchObject({ok:false});
});
