import {afterEach,beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),get:vi.fn(),set:vi.fn(),enabled:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/adminAuth',()=>({requireAdmin:m.auth}));vi.mock('@/lib/redis',()=>({getRedis:()=>({get:m.get,set:m.set})}));vi.mock('@/lib/admin/adminCrypto',()=>({isAdminCryptoEnabled:m.enabled}));
vi.mock('@/lib/admin/cryptoBaseScan',async()=>({...await vi.importActual('@/lib/admin/cryptoBaseScan'),fetchDailyBase:m.fetch}));
import {GET,POST} from '@/app/api/admin/crypto-markets/bases/route';
const req=()=>new Request('https://test',{method:'POST'});
const snapshot=()=>({startedAt:new Date().toISOString(),rows:Array.from({length:8},(_,i)=>({id:`coin-${i}`,symbol:`C${i}`,name:`Coin ${i}`,stage:'WATCH',venues:[{exchange:'gdax',pair:`C${i}/USD`,volumeUsd:1e6,spreadPct:.1,observedAt:new Date().toISOString()}]}))});
afterEach(()=>vi.useRealTimers());
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-09-28T04:00:00Z'));vi.resetAllMocks();m.auth.mockResolvedValue({ok:true});m.enabled.mockReturnValue(true);m.set.mockResolvedValue('OK');m.get.mockImplementation(async(k:string)=>k==='admin:crypto-discovery:v1'?snapshot():null);m.fetch.mockImplementation(async r=>({...r,stage:'NOT_BASE'}));});
it('authenticates reads and writes and obeys crypto pause',async()=>{m.auth.mockResolvedValue({ok:false});expect((await GET(req())).status).toBe(403);expect((await POST(req())).status).toBe(403);m.auth.mockResolvedValue({ok:true});m.enabled.mockReturnValue(false);expect((await POST(req())).status).toBe(409);expect(m.fetch).not.toHaveBeenCalled();});
it('bounds each batch to five and retains pending rows',async()=>{const b=await (await POST(req())).json();expect(b.requestAttempts).toBe(5);expect(b.scan.rows.filter((r:{stage:string})=>r.stage==='PENDING')).toHaveLength(3);expect(m.fetch).toHaveBeenCalledTimes(5);});
it('requires fresh discovery and respects the shared lock',async()=>{m.get.mockResolvedValue(null);expect((await POST(req())).status).toBe(409);m.set.mockResolvedValue(null);expect((await POST(req())).status).toBe(429);expect(m.fetch).not.toHaveBeenCalled();});
it('continues past failed providers without fabricating bases',async()=>{m.fetch.mockRejectedValue(Error('provider'));const b=await (await POST(req())).json();expect(b.scan.rows.filter((r:{stage:string})=>r.stage==='UNAVAILABLE')).toHaveLength(5);});
it('saved reads spend no provider calls',async()=>{await GET(req());expect(m.fetch).not.toHaveBeenCalled();});
it('preserves completed Coinbase evidence during the same-day v1 upgrade',async()=>{
 const old={version:1,startedAt:new Date().toISOString(),rows:[{id:'coin-0',product:'C0-USD',stage:'NOT_BASE',reason:'wide range',asOf:'2026-09-28T00:00:00.000Z',high:12,low:8,widthPct:50,gapPct:0,slopePct:0,contraction:1}]};
 m.get.mockImplementation(async(k:string)=>k==='admin:crypto-discovery:v1'?snapshot():old);
 const b=await (await POST(req())).json();expect(b.scan.version).toBe(2);expect(b.scan.rows[0].reason).toBe('wide range');expect(b.scan.rows[0].exchange).toBe('gdax');expect(m.fetch.mock.calls.some(c=>c[0].id==='coin-0')).toBe(false);
});

it('returns saved progress when another browser owns the batch reservation',async()=>{
 const scan={version:2,rows:[{id:'coin-0',stage:'NOT_BASE'}]};m.set.mockResolvedValue(null);m.get.mockResolvedValue(scan);
 const response=await POST(req());expect(response.status).toBe(429);expect((await response.json()).scan).toEqual(scan);expect(m.fetch).not.toHaveBeenCalled();
});
