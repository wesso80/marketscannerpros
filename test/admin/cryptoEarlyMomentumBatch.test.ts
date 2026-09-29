import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('@/lib/redis',()=>({getRedis:vi.fn()}));
vi.mock('@/lib/admin/adminCrypto',()=>({isAdminCryptoEnabled:()=>true}));
vi.mock('@/lib/admin/cryptoVolumeMomentum',()=>({createMomentumScan:vi.fn((rows,discoveryAt)=>({version:1,discoveryAt,rows:rows.map(r=>({...r,stage:'PENDING',pair:{exchange:'gdax',product:'TEST-USD',quote:'USD',volumeUnit:'TEST'}}))}))}));
vi.mock('@/lib/admin/cryptoEarlyMomentum',()=>({fetchEarlyMomentum:vi.fn(async()=>({stage:'EARLY_WATCH'}))}));
import {getRedis} from '@/lib/redis';
import {fetchEarlyMomentum} from '@/lib/admin/cryptoEarlyMomentum';
import {runEarlyMomentumBatch} from '@/lib/admin/cryptoEarlyMomentumBatch';
const key='admin:crypto-markets:early-momentum:v1',now=Date.UTC(2026,8,29,1,15);
let saved:Record<string,any>;
beforeEach(()=>{vi.clearAllMocks();vi.spyOn(Date,'now').mockReturnValue(now);saved={'admin:crypto-discovery:v1':{startedAt:new Date(now-2*3600000).toISOString(),rows:Array.from({length:310},(_,i)=>({id:String(i),symbol:String(i)}))}};vi.mocked(getRedis).mockReturnValue({get:async k=>saved[k],set:async(k,v)=>{saved[k]=v;return 'OK';}} as never);});
afterEach(()=>vi.restoreAllMocks());
it('reuses older discovery, caps coverage and advances only the requested batch',async()=>{
 const b=await (await runEarlyMomentumBatch(5)).json();expect(b.scan.rows).toHaveLength(300);expect(fetchEarlyMomentum).toHaveBeenCalledTimes(5);expect(saved['admin:crypto-markets:momentum-volume:v1']).toBeUndefined();
 expect(b.scan.rows[0].id).toBe('0');expect(b.scan.rows[0].stage).toBe('EARLY_WATCH');
});
it('does not refetch a completed current hourly window',async()=>{
 saved[key]={startedAt:new Date(now).toISOString(),rows:[{stage:'EARLY_WATCH'}]};
 expect((await (await runEarlyMomentumBatch()).json()).requestAttempts).toBe(0);expect(fetchEarlyMomentum).not.toHaveBeenCalled();
});
it('refuses stale discovery rather than starting expensive refreshes',async()=>{
 saved['admin:crypto-discovery:v1'].startedAt=new Date(now-5*3600000).toISOString();expect((await runEarlyMomentumBatch()).status).toBe(409);expect(fetchEarlyMomentum).not.toHaveBeenCalled();
});
it('records provider failure as unavailable instead of an empty clean scan',async()=>{
 vi.mocked(fetchEarlyMomentum).mockRejectedValueOnce(Error('offline'));
 const b=await (await runEarlyMomentumBatch(1)).json();expect(b.scan.rows[0].stage).toBe('UNAVAILABLE');
});
