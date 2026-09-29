import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('@/lib/redis',()=>({getRedis:vi.fn()}));
import {getRedis} from '@/lib/redis';
import {reportCryptoCycleHealth,cryptoHealthIssues,testCryptoOpsEmail} from '@/lib/admin/cryptoOpsAlerts';
const key='admin:crypto-markets:ops-alerts:v1';
const good={monitoring:{ok:true},scanning:{ok:true},paper:{ok:true}};
const bad={...good,monitoring:{ok:false}};
let saved:Record<string,unknown>,fetcher:ReturnType<typeof vi.fn>;
beforeEach(()=>{vi.clearAllMocks();saved={};vi.stubEnv('CRYPTO_SETUP_ALERT_EMAIL','owner@example.test');vi.stubEnv('RESEND_API_KEY','test');fetcher=vi.fn(async()=>Response.json({id:'test-mail'}));vi.stubGlobal('fetch',fetcher);vi.mocked(getRedis).mockReturnValue({get:async k=>saved[k],set:async(k,v,o)=>{if(o?.nx&&saved[k]!==undefined&&k.endsWith(':payload'))return null;saved[k]=structuredClone(v);return 'OK';}} as never);});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('healthy cycles and ordinary blocked entries send no fault email',async()=>{expect(await reportCryptoCycleHealth(good)).toMatchObject({healthy:true});expect(fetcher).not.toHaveBeenCalled();});
it('sends a failure once, suppresses repeats, then sends one recovery',async()=>{
 await reportCryptoCycleHealth(bad);await reportCryptoCycleHealth(bad);expect(fetcher).toHaveBeenCalledTimes(1);
 await reportCryptoCycleHealth(good);await reportCryptoCycleHealth(good);expect(fetcher).toHaveBeenCalledTimes(2);
 expect(JSON.parse(fetcher.mock.calls[1][1].body).subject).toContain('recovered');
});
it('sends an additional notification when a different stage fails during an incident',async()=>{
 await reportCryptoCycleHealth(bad);await reportCryptoCycleHealth({...bad,scanning:{ok:false}});await reportCryptoCycleHealth(bad);expect(fetcher).toHaveBeenCalledTimes(2);
});
it('retries a failed delivery with the same idempotency key and frozen body',async()=>{
 fetcher.mockResolvedValueOnce(new Response('{}',{status:503}));expect(await reportCryptoCycleHealth(bad)).toMatchObject({ok:false});
 expect(await reportCryptoCycleHealth(bad)).toMatchObject({ok:true});
 expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
 expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe(fetcher.mock.calls[1][1].headers['Idempotency-Key']);
});
it('reports supplementary hourly failures separately from paper health',()=>{
 expect(cryptoHealthIssues({...good,scanning:{ok:true,reports:{earlyWatch:{error:'failed'}}}})).toEqual(['Hourly research watchlist degraded']);
});
it('cannot deliver without coordination and does not expose raw stage errors',async()=>{
 await reportCryptoCycleHealth({...bad,monitoring:{ok:false,error:'private database connection'}});
 expect(fetcher.mock.calls[0][1].body).not.toContain('private database');
 vi.mocked(getRedis).mockReturnValue(null);expect(await reportCryptoCycleHealth(bad)).toMatchObject({ok:false});
});
it('test email does not create a false incident or alter recorded health',async()=>{
 await testCryptoOpsEmail();expect(saved[key]).toBeUndefined();expect(fetcher.mock.calls[0][1].body).toContain('TEST ONLY');
});
