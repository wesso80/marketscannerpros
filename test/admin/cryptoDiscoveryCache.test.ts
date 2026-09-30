import {afterEach,expect,it,vi} from 'vitest';
vi.mock('@/lib/circuitBreaker',()=>({coinGeckoCircuit:{call:(f:()=>unknown)=>f()}}));
vi.mock('@/lib/admin/cgCredits',()=>({recordCgCall:vi.fn()}));
vi.mock('@/lib/admin/providerTelemetry',()=>({recordProviderFailure:vi.fn(),recordProviderSuccess:vi.fn()}));
import {getDiscoveryExchangeTickers,getMarketData} from '@/lib/coingecko';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('bypasses stale-while-revalidate for admin discovery while preserving public market caching',async()=>{
 vi.stubEnv('COINGECKO_API_KEY','test');
 const fetch=vi.fn<typeof globalThis.fetch>(async()=>Response.json({tickers:[]}));vi.stubGlobal('fetch',fetch);
 await getDiscoveryExchangeTickers('gdax',1);
 expect(fetch.mock.calls[0][1]).toMatchObject({cache:'no-store'});
 expect(fetch.mock.calls[0][1]).not.toHaveProperty('next');
 fetch.mockImplementation(async()=>Response.json([]));
 await getMarketData({ids:['bitcoin']},{retries:0,noStore:true});
 expect(fetch.mock.calls[1][1]).toMatchObject({cache:'no-store'});
 await getMarketData({ids:['bitcoin']});
 expect(fetch.mock.calls[2][1]).toMatchObject({next:{revalidate:90}});
 expect(fetch.mock.calls[2][1]).not.toHaveProperty('cache');
});
