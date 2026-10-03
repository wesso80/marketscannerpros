import { expect, it } from 'vitest';
import { serializePublicQuote } from '@/lib/market-data/publicQuote';
import { normalizeCryptoMover } from '@/lib/analysis/publicMover';
import { consumeApiQuota } from '@/lib/apiQuota';
import { canonicalPickFields } from '@/lib/scoring/canonical/dailyPick';
import { computeGlobalM2 } from '@/lib/intelligence/engines/globalM2';
const now = Date.parse('2026-10-02T15:00:00Z');
it('normalizes worker, DB and provider quotes without losing nulls or source age', () => {
 const variants = [
  {price:12,prevClose:10,changeAmt:2,changePct:20,updatedAt:new Date(now).toISOString(),assetClass:'equity'},
  {price:'12',prev_close:'10',change_amount:'2',change_percent:'20',observed_at:new Date(now).toISOString(),asset_class:'equity'},
  {'05. price':'12','08. previous close':'10','09. change':'2','10. change percent':'20%',updatedAt:new Date(now).toISOString(),assetClass:'equity'},
 ];
 const quotes=variants.map(v=>serializePublicQuote(v,now));
 expect(quotes[0]).toEqual(quotes[1]);expect(quotes[1]).toEqual(quotes[2]);
 expect(quotes[0].open).toBeNull();expect(quotes[0].stale).toBe(false);
 expect(serializePublicQuote({price:12,fetchedAt:new Date(now).toISOString()},now).stale).toBe(true);
});
it('distinguishes rolling crypto change from a previous session close',()=>{
 const q=serializePublicQuote({price:12,prevClose:10,changePct:20,source:'coingecko_markets',updatedAt:new Date(now-3600000).toISOString()},now);
 expect(q.prevClose).toBeNull();expect(q.price24hAgo).toBe(10);expect(q.changeBasis).toBe('rolling_24h');expect(q.stale).toBe(true);
});
it('does not fabricate missing quote fields',()=>{
 const q=serializePublicQuote({price:null,changePct:'bad',volume:null},now);
 expect(q.price).toBeNull();expect(q.changePct).toBeNull();expect(q.volume).toBeNull();expect(q.stale).toBe(true);
});
it('returns dollar change, not percentage points, and null unknown market cap',()=>{
 const q=normalizeCryptoMover({symbol:'BTC',usd:120,usd_24h_change:20});
 expect(Number(q.change_amount)).toBe(20);expect(q.market_cap).toBeNull();
});
it('keeps genuine zero percentiles separate from missing calibration',()=>{
 expect(canonicalPickFields(null).scorePercentile).toBeNull();
 expect(canonicalPickFields({score:0,permission:'WATCH',scoreBasis:'calibrated_expectancy_percentile',calibration:{percentile:0}} as any).scorePercentile).toBe(0);
});
it('does not count stale M2 balances as live coverage',()=>{
 const bloc=(id:string,stale:boolean)=>({id,name:id,nativeCurrency:'USD',classification:'EXACT' as const,provider:'test',sourceSeries:'test',stale,observations:[0,1,2,3,4].map(i=>({month:`2026-0${i+1}`,nativeM2:100,fxRate:null,usdM2:100}))});
 const r=computeGlobalM2({blocs:[bloc('US',false),bloc('CN',true)]},{lagMonths:1,nominalWeights:{US:50,CN:50}},'2026-06-01T00:00:00Z');
 expect(r.quality.weightedCoveragePercent).toBe(50);expect(r.quality.staleBlocCount).toBe(1);
});
it('keeps 300/min protection and reports the actual remaining wait',()=>{
 const store=new Map(); for(let i=0;i<300;i++)expect(consumeApiQuota(store,'ip',now).limited).toBe(false);
 expect(consumeApiQuota(store,'ip',now+59000)).toEqual({limited:true,retryAfter:1});
 expect(consumeApiQuota(store,'ip',now+60000).limited).toBe(false);
});
