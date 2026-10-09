import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({store:new Map<string,unknown>(),get:vi.fn(),set:vi.fn(),eval:vi.fn(),stamp:vi.fn(),fetch:vi.fn(),email:vi.fn(),persist:vi.fn(),auth:vi.fn()}));
vi.mock('@/lib/redis',()=>({getRedis:()=>({get:m.get,set:m.set,eval:m.eval})}));
vi.mock('@/lib/adminAuth',()=>({requireAdmin:m.auth}));
vi.mock('@/lib/admin/adminCrypto',()=>({isAdminCryptoEnabled:()=>true}));
vi.mock('@/lib/admin/cryptoFlow',()=>({stampMomentumVolume:m.stamp,unavailableFlowStamp:()=>({stamp:'unavailable'})}));
vi.mock('@/lib/admin/cryptoVolumeMomentum',()=>({fetchVolumeMomentum:m.fetch,createMomentumScan:vi.fn()}));
vi.mock('@/lib/admin/cryptoSetupEmail',()=>({sendCryptoSetupEmails:m.email}));
vi.mock('@/lib/admin/cryptoForwardScore',()=>({persistForwardScores:m.persist}));
vi.mock('@/lib/admin/cryptoJev',()=>({attachJevShadow:vi.fn()}));
vi.mock('@/lib/admin/cryptoJevChart',()=>({attachChartConfirmer:vi.fn()}));
vi.mock('@/lib/admin/cryptoJevCatalyst',()=>({attachCatalystShadow:vi.fn(async()=>{})}));
vi.mock('@/lib/admin/cryptoShadowScore',()=>({attachShadowScoreWithContext:vi.fn()}));
import {GET} from '@/app/api/admin/crypto-markets/momentum/route';
import {runMomentumBatch} from '@/lib/admin/cryptoMomentumBatch';
const KEY='admin:crypto-markets:momentum-volume:v1',LOCK=KEY+':batch-lock';
const request=()=>new Request('https://example.test/api/admin/crypto-markets/momentum');
const scan=()=>({version:1,startedAt:new Date().toISOString(),updatedAt:'2026-10-09T00:00:00Z',discoveryAt:new Date().toISOString(),rows:[{id:'btc',symbol:'BTC',stage:'MOMENTUM_VOLUME',pair:{product:'BTC-USDT'}}]});
beforeEach(()=>{
 vi.resetAllMocks();m.store.clear();vi.stubEnv('CRYPTO_MARKETS_PAUSED','false');m.auth.mockResolvedValue({ok:true});
 m.store.set(KEY,scan());
 m.get.mockImplementation(async(key:string)=>structuredClone(m.store.get(key)??null));
 m.set.mockImplementation(async(key:string,value:unknown,options:{nx?:boolean})=>{if(options?.nx&&m.store.has(key))return null;m.store.set(key,structuredClone(value));return 'OK';});
 m.eval.mockImplementation(async(script:string,keys:string[],args:unknown[])=>{
  expect(script).toContain("redis.call('get', KEYS[1]) ~= ARGV[1]");
  expect(script).toContain("redis.call('set', KEYS[2], ARGV[2], 'EX', ARGV[3])");
  if(m.store.get(keys[0])!==args[0])return 0;
  m.store.set(keys[1],JSON.parse(String(args[1])));return 1;
 });
 m.stamp.mockImplementation(async(rows:any[])=>{for(const row of rows)if(row.stage==='MOMENTUM_VOLUME'&&!row.flowStamp)row.flowStamp={stamp:'neutral',rule:'flow-stamp-v1'};});
});
afterEach(()=>vi.unstubAllEnvs());
describe('stored momentum reads',()=>{
 it('concurrent GETs preserve missing observations and never enrich or write',async()=>{
  const before=structuredClone(m.store.get(KEY));const responses=await Promise.all([GET(request()),GET(request())]);
  for(const response of responses){expect(await response.json()).toEqual({scan:before});expect(response.headers.get('cache-control')).toBe('private, no-store');}
  expect(m.store.get(KEY)).toEqual(before);expect(m.stamp).not.toHaveBeenCalled();expect(m.set).not.toHaveBeenCalled();expect(m.eval).not.toHaveBeenCalled();
 });
 it('denies before reading storage',async()=>{m.auth.mockResolvedValue({ok:false});const r=await GET(request());expect(r.status).toBe(403);expect(r.headers.get('cache-control')).toBe('private, no-store');expect(m.get).not.toHaveBeenCalled();});
 it('keeps missing scans null and redacts storage errors',async()=>{m.store.delete(KEY);expect(await(await GET(request())).json()).toEqual({scan:null});m.get.mockRejectedValueOnce(Error('redis-secret'));const r=await GET(request());expect(r.status).toBe(503);expect(await r.text()).not.toContain('redis-secret');expect(r.headers.get('cache-control')).toBe('private, no-store');});
});
describe('writer owns enrichment and snapshot publication',()=>{
 it('fills missing stamps on an already-completed scan inside the owned batch',async()=>{
  expect((await runMomentumBatch()).status).toBe(200);
  expect((m.store.get(KEY) as any).rows[0].flowStamp.stamp).toBe('neutral');
  expect(m.eval).toHaveBeenCalledOnce();expect(m.eval.mock.calls[0][1]).toEqual([LOCK,KEY]);
  expect(m.eval.mock.calls[0][2][0]).toBe(m.store.get(LOCK));expect(m.set.mock.calls.every(([key])=>key===LOCK)).toBe(true);
  expect(m.email).toHaveBeenCalledOnce();
 });
 it('does no enrichment when another batch owns the lock',async()=>{m.store.set(LOCK,'other');expect((await runMomentumBatch()).status).toBe(429);expect(m.stamp).not.toHaveBeenCalled();expect(m.eval).not.toHaveBeenCalled();});
 it.each(['expired','replaced'])('rejects a %s lease without overwriting the successor or sending emails',async(mode)=>{
  const successor={...scan(),updatedAt:'newer-snapshot'};
  m.stamp.mockImplementation(async()=>{mode==='expired'?m.store.delete(LOCK):m.store.set(LOCK,'successor');m.store.set(KEY,successor);});
  expect((await runMomentumBatch()).status).toBe(409);expect(m.store.get(KEY)).toEqual(successor);expect(m.email).not.toHaveBeenCalled();expect(m.persist).not.toHaveBeenCalled();
 });
 it('also fences intermediate progress before enrichment',async()=>{
  const pending=scan();pending.rows[0].stage='PENDING';m.store.set(KEY,pending);
  const successor={...scan(),updatedAt:'successor'};
  m.fetch.mockImplementation(async()=>{m.store.set(LOCK,'successor');m.store.set(KEY,successor);return {stage:'NO_SIGNAL'};});
  expect((await runMomentumBatch()).status).toBe(409);expect(m.store.get(KEY)).toEqual(successor);expect(m.stamp).not.toHaveBeenCalled();expect(m.email).not.toHaveBeenCalled();
 });
});
