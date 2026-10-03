import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/coingecko',()=>({getDerivativesTickers:vi.fn(async()=>[{symbol:'BTCUSDT',index_id:'BTC',contract_type:'perpetual',funding_rate:0.01,open_interest:100}]),getGlobalData:vi.fn(async()=>({market_cap_change_percentage_24h_usd:0,market_cap_percentage:{}})),getMarketData:vi.fn(async()=>[{price_change_percentage_24h:0}])}));
vi.mock('@/lib/crypto/okxDerivatives',()=>({getOkxFundingRates:vi.fn(async()=>[{symbol:'BTC',ratePercent8h:0.01,rawRatePercent:0.01,intervalHours:8,observedAt:Date.now()}])}));
it('reports the same percent as the BTC OKX funding feed, without multiplying it again',async()=>{
 const {GET}=await import('@/app/api/fear-greed-custom/route');
 const r=await (await GET(new NextRequest('https://test/api/fear-greed-custom'))).json();
 expect(r.raw.btcFundingRate).toBe(0.01);
 expect(r.methodology).not.toMatch(/positioning|Alternative.me/);
 expect(r.components.reduce((n:number,c:any)=>n+c.weight,0)).toBeCloseTo(100);
 expect(r.components.reduce((n:number,c:any)=>n+c.contribution,0)).toBeCloseTo(r.value,0);
});
