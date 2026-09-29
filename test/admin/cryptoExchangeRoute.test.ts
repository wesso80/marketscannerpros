import {beforeEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),redis:vi.fn(),get:vi.fn(),set:vi.fn(),enabled:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/adminAuth',()=>({requireAdmin:m.auth}));vi.mock('@/lib/redis',()=>({getRedis:m.redis}));vi.mock('@/lib/admin/adminCrypto',()=>({isAdminCryptoEnabled:m.enabled}));
vi.mock('@/lib/admin/cryptoExchangeVolume',async()=>({...await vi.importActual('@/lib/admin/cryptoExchangeVolume'),fetchExchangeVolume:m.fetch}));
import {POST} from '@/app/api/admin/crypto-markets/volume/route';
const req=()=>new Request('https://test',{method:'POST',body:JSON.stringify({coinId:'test'})});
// Evidence is stamped 1s in the past: the route reads Date.now() before these mocks run, and a later-millisecond
// stamp is correctly rejected as future-dated, which made the cached-evidence test fail intermittently.
const past=()=>new Date(Date.now()-1000).toISOString();
const snapshot=()=>({startedAt:past(),rows:[{id:'test',stage:'WATCH',venues:[{exchange:'gdax',pair:'TEST/USD',volumeUsd:1e6,spreadPct:.1,observedAt:past()}]}]});
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({ok:true});m.enabled.mockReturnValue(true);m.redis.mockReturnValue({get:m.get,set:m.set});m.set.mockResolvedValue('OK');m.get.mockImplementation(async(k:string)=>k==='admin:crypto-discovery:v1'?snapshot():null);m.fetch.mockResolvedValue({fetchedAt:new Date().toISOString()});});
it('checks auth, admin pause and eligibility before provider calls',async()=>{m.auth.mockResolvedValue({ok:false});expect((await POST(req())).status).toBe(403);m.auth.mockResolvedValue({ok:true});m.enabled.mockReturnValue(false);expect((await POST(req())).status).toBe(409);m.enabled.mockReturnValue(true);m.get.mockResolvedValue(null);expect((await POST(req())).status).toBe(409);expect(m.fetch).not.toHaveBeenCalled();});
it('does not guess a Coinbase listing or spend requests on uncovered coins',async()=>{const s=snapshot();s.rows[0].venues=[];m.get.mockResolvedValue(s);expect((await POST(req())).status).toBe(422);expect(m.fetch).not.toHaveBeenCalled();});
it('returns cached evidence without provider calls',async()=>{m.get.mockImplementation(async(k:string)=>k==='admin:crypto-discovery:v1'?snapshot():{fetchedAt:past()});const r=await POST(req());expect((await r.json()).requestAttempts).toBe(0);expect(m.fetch).not.toHaveBeenCalled();});
it('respects shared pacing and budget',async()=>{m.set.mockResolvedValue(null);expect((await POST(req())).status).toBe(429);expect(m.fetch).not.toHaveBeenCalled();});
it('uses the discovered exchange pair and fails visibly on provider errors',async()=>{const r=await POST(req());expect(r.status).toBe(200);expect(m.fetch).toHaveBeenCalledWith('test','TEST-USD',expect.any(Number));m.fetch.mockRejectedValue(Error('provider'));expect((await POST(req())).status).toBe(503);});
