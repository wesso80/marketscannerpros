import { it, expect, vi } from 'vitest';
vi.mock('@/lib/admin/providerTelemetry',()=>({recordProviderFailure:vi.fn(),recordProviderSuccess:vi.fn()}));
vi.mock('@/lib/circuitBreaker',()=>({coinGeckoCircuit:{call:(fn:()=>unknown)=>fn()}}));
it('requests documented full precision and preserves fractional OHLC',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify([[1791021600000,84585.67305,84585.67305,84572.06358,84582.08109]]))));
 const {getOHLC}=await import('@/lib/coingecko');const data=await getOHLC('bitcoin',1,{retries:0});
 expect(new URL(String(vi.mocked(fetch).mock.calls[0][0])).searchParams.get('precision')).toBe('full');
 expect(data![0][4]).toBe(84582.08109);vi.unstubAllGlobals();
});
