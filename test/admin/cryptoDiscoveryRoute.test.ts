import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({auth:vi.fn(),redis:vi.fn(),get:vi.fn(),set:vi.fn(),enabled:vi.fn(),tickers:vi.fn(),markets:vi.fn()}));
vi.mock('@/lib/adminAuth',()=>({requireAdmin:mocks.auth}));
vi.mock('@/lib/redis',()=>({getRedis:mocks.redis}));
vi.mock('@/lib/coingecko',()=>({getMarketData:mocks.markets,getDiscoveryExchangeTickers:mocks.tickers,COINGECKO_ID_MAP:{}}));
vi.mock('@/lib/admin/adminCrypto',()=>({isAdminCryptoEnabled:mocks.enabled,isCoinGeckoEnabled:mocks.enabled}));
import {GET,POST} from '@/app/api/admin/crypto-discovery/route';
beforeEach(()=>{vi.resetAllMocks(); mocks.auth.mockResolvedValue({ok:true});mocks.enabled.mockReturnValue(true);
  mocks.redis.mockReturnValue({get:mocks.get,set:mocks.set});mocks.set.mockResolvedValue('OK');mocks.get.mockResolvedValue(null);mocks.tickers.mockResolvedValue([]);});
describe('discovery request boundaries',()=>{
  it('requests current market data without changing the shared scan budget',async()=>{
    mocks.tickers.mockImplementation(async(exchange:string)=>[{coin_id:'bitcoin',base:'BTC',target:'USD',market:{identifier:exchange},last_traded_at:new Date(Date.now()-1000).toISOString(),is_stale:false,is_anomaly:false,converted_volume:{usd:1e9},bid_ask_spread_percentage:.1}]);
    mocks.markets.mockResolvedValue([{id:'bitcoin',symbol:'btc',name:'Bitcoin',current_price:100,market_cap:1e9,total_volume:1e8,last_updated:new Date().toISOString(),price_change_percentage_1h_in_currency:2,price_change_percentage_24h:3}]);
    expect((await POST(new Request('https://test'))).status).toBe(200);
    expect(mocks.markets).toHaveBeenCalledWith(expect.anything(),{retries:0,timeoutMs:5000,noStore:true});
    expect(mocks.set).toHaveBeenCalledWith('admin:crypto-discovery:v1:budget','reserved',{nx:true,ex:900});
  });
  it('GET reads cache without provider requests',async()=>{expect((await GET(new Request('https://test'))).status).toBe(200);expect(mocks.tickers).not.toHaveBeenCalled();expect(mocks.markets).not.toHaveBeenCalled();});
  it('rejects unauthorized requests before cache or providers',async()=>{mocks.auth.mockResolvedValue({ok:false});expect((await POST(new Request('https://test'))).status).toBe(403);expect(mocks.redis).not.toHaveBeenCalled();});
  it('respects provider pause',async()=>{mocks.enabled.mockReturnValue(false);expect((await POST(new Request('https://test'))).status).toBe(409);expect(mocks.tickers).not.toHaveBeenCalled();});
  it('fails closed when the shared budget cannot be reserved',async()=>{mocks.set.mockRejectedValue(new Error('offline'));expect((await POST(new Request('https://test'))).status).toBe(503);expect(mocks.tickers).not.toHaveBeenCalled();});
  it('rejects repeated scans during cooldown',async()=>{mocks.set.mockResolvedValue(null);expect((await POST(new Request('https://test'))).status).toBe(429);expect(mocks.tickers).not.toHaveBeenCalled();});
  it('retains previous results and reports failure when all venues fail',async()=>{mocks.tickers.mockResolvedValue(null);const res=await POST(new Request('https://test'));expect(res.status).toBe(503);expect((await res.json()).error).toContain('zero coins');expect(mocks.set).toHaveBeenCalledTimes(1);expect(mocks.markets).not.toHaveBeenCalled();});
});
