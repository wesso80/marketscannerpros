import {beforeEach,afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/redis',()=>({getRedis:vi.fn()}));
vi.mock('@/lib/admin/adminCrypto',()=>({isAdminCryptoEnabled:()=>true}));
vi.mock('@/lib/admin/cryptoDiscoveryBatch',()=>({runDiscoveryBatch:vi.fn()}));
vi.mock('@/lib/admin/cryptoMomentumBatch',()=>({runMomentumBatch:vi.fn()}));
vi.mock('@/lib/admin/cryptoEarlyMomentumBatch',()=>({runEarlyMomentumBatch:vi.fn(async()=>Response.json({requestAttempts:100,scan:{rows:[]}}))}));
vi.mock('@/lib/admin/cryptoBaseBatch',()=>({runBaseBatch:vi.fn()}));
import {runEarlyMomentumBatch} from '@/lib/admin/cryptoEarlyMomentumBatch';
import {getRedis} from '@/lib/redis';
import {runDiscoveryBatch} from '@/lib/admin/cryptoDiscoveryBatch';
import {runMomentumBatch} from '@/lib/admin/cryptoMomentumBatch';
import {runBaseBatch} from '@/lib/admin/cryptoBaseBatch';
import {runCryptoAutomation} from '@/lib/admin/cryptoAutomation';
let saved:Record<string,unknown>,set:ReturnType<typeof vi.fn>,release:ReturnType<typeof vi.fn>;
const now=Date.parse('2026-09-28T08:15:00Z');
beforeEach(()=>{
 vi.clearAllMocks();vi.spyOn(Date,'now').mockReturnValue(now);
 saved={'admin:crypto-markets:automation:v1':true};
 set=vi.fn(async()=> 'OK');release=vi.fn(async()=>1);vi.mocked(getRedis).mockReturnValue({get:vi.fn(async(k:string)=>saved[k]),set,ttl:vi.fn(async()=>1),eval:release} as never);
 vi.mocked(runDiscoveryBatch).mockImplementation(async()=>Response.json({snapshot:{requests:17}}));
 vi.mocked(runMomentumBatch).mockImplementation(async()=>Response.json({requestAttempts:100,scan:{rows:[]}}));
 vi.mocked(runBaseBatch).mockImplementation(async()=>Response.json({requestAttempts:20,scan:{rows:[]}}));
});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});
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
 set.mockResolvedValue(null);expect(await runCryptoAutomation()).toMatchObject({skipped:true,ok:false});expect(runMomentumBatch).not.toHaveBeenCalled();expect(release).not.toHaveBeenCalled();
});
it('releases its lock after success so a retry is not blocked for ten minutes',async()=>{
 await runCryptoAutomation();
 const lockCall=set.mock.calls.find(c=>c[0]==='admin:crypto-markets:automation:v1:lock');
 expect(lockCall?.[1]).toEqual(expect.any(String));
 expect(release).toHaveBeenCalledWith(expect.stringContaining("redis.call('get', KEYS[1]) == ARGV[1]"),['admin:crypto-markets:automation:v1:lock'],[lockCall?.[1]]);
 expect(release).toHaveBeenCalledOnce();
});
it('releases its lock after failure but never clears a successor reservation',async()=>{
 vi.mocked(runDiscoveryBatch).mockRejectedValueOnce(new Error('Provider unavailable'));
 release.mockResolvedValueOnce(0); // Atomic compare found a different owner after TTL expiry.
 expect(await runCryptoAutomation()).toMatchObject({ok:false,error:'Provider unavailable'});
 expect(release).toHaveBeenCalledOnce();
 expect(release.mock.calls[0][0]).toContain("else return 0 end");
});
it('reports stale discovery rejection honestly rather than success',async()=>{
 vi.mocked(runMomentumBatch).mockImplementation(async()=>Response.json({error:'Refresh discovery'},{status:409}));expect(await runCryptoAutomation()).toMatchObject({ok:false});expect(runBaseBatch).not.toHaveBeenCalled();
});

it('retries discovery when a current-window scan contains no coins',async()=>{
 saved['admin:crypto-markets:momentum-volume:v1']={startedAt:new Date(now).toISOString(),rows:[]};
 saved['admin:crypto-markets:bases:v1']={startedAt:new Date(now).toISOString(),version:2,rows:[{}]};
 await runCryptoAutomation();expect(runDiscoveryBatch).toHaveBeenCalledOnce();
});
it('does not label a persistent cooldown as completed scan work',async()=>{
 vi.useFakeTimers();
 vi.mocked(runMomentumBatch).mockImplementation(async()=>Response.json({error:'Cooling down'},{status:429}));
 const pending=runCryptoAutomation();await vi.runAllTimersAsync();
 expect(await pending).toMatchObject({ok:false});
});

it('waits for a manual batch then resumes scheduled work',async()=>{
 vi.useFakeTimers();
 vi.mocked(runMomentumBatch).mockResolvedValueOnce(Response.json({error:'Shared batch active'},{status:429}));
 const pending=runCryptoAutomation();await vi.runAllTimersAsync();
 expect(await pending).toMatchObject({ok:true});
 expect(runMomentumBatch).toHaveBeenCalledTimes(2);expect(runBaseBatch).toHaveBeenCalledOnce();
});
it('honours pause while waiting for a manual batch',async()=>{
 vi.useFakeTimers();
 vi.mocked(runMomentumBatch).mockImplementation(async()=>{saved['admin:crypto-markets:automation:v1']=false;return Response.json({error:'Shared batch active'},{status:429});});
 const pending=runCryptoAutomation();await vi.runAllTimersAsync();
 expect(await pending).toMatchObject({ok:false,error:'Background scans paused while waiting for an active batch'});
 expect(runMomentumBatch).toHaveBeenCalledOnce();expect(runBaseBatch).not.toHaveBeenCalled();
});

it('keeps confirmed entry scanning healthy if supplementary hourly research fails',async()=>{
 vi.mocked(runEarlyMomentumBatch).mockResolvedValueOnce(Response.json({error:'Hourly provider down'},{status:503}));
 const result=await runCryptoAutomation();expect(result).toMatchObject({ok:true,reports:{earlyWatch:{ok:false}}});
});
