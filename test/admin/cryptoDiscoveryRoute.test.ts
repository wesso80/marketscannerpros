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
  it('GET reads cache without provider requests',async()=>{expect((await GET(new Request('https://test'))).status).toBe(200);expect(mocks.tickers).not.toHaveBeenCalled();expect(mocks.markets).not.toHaveBeenCalled();});
  it('rejects unauthorized requests before cache or providers',async()=>{mocks.auth.mockResolvedValue({ok:false});expect((await POST(new Request('https://test'))).status).toBe(403);expect(mocks.redis).not.toHaveBeenCalled();});
  it('respects provider pause',async()=>{mocks.enabled.mockReturnValue(false);expect((await POST(new Request('https://test'))).status).toBe(409);expect(mocks.tickers).not.toHaveBeenCalled();});
  it('fails closed when the shared budget cannot be reserved',async()=>{mocks.set.mockRejectedValue(new Error('offline'));expect((await POST(new Request('https://test'))).status).toBe(503);expect(mocks.tickers).not.toHaveBeenCalled();});
  it('rejects repeated scans during cooldown',async()=>{mocks.set.mockResolvedValue(null);expect((await POST(new Request('https://test'))).status).toBe(429);expect(mocks.tickers).not.toHaveBeenCalled();});
  it('retains previous results and reports failure when all venues fail',async()=>{mocks.tickers.mockResolvedValue(null);const res=await POST(new Request('https://test'));expect(res.status).toBe(503);expect((await res.json()).error).toContain('zero coins');expect(mocks.set).toHaveBeenCalledTimes(1);expect(mocks.markets).not.toHaveBeenCalled();});
});
