import { describe,it,expect,vi } from 'vitest';
import { collectDiscoveryMarkets, eligibleVenue, screenCryptoMarkets } from '@/lib/admin/cryptoDiscovery';
import type { CoinTicker, CoinGeckoMarketData } from '@/lib/coingecko';
const now = Date.parse('2026-09-28T02:00:00Z');
const ticker = (id='quant',exchange='binance') => ({coin_id:id,base:'QNT',target:'USDT',market:{identifier:exchange},
  last_traded_at:new Date(now-60000).toISOString(),is_stale:false,is_anomaly:false,converted_volume:{usd:300000},bid_ask_spread_percentage:0.1}) as CoinTicker;
const coin = (id='quant') => ({id,symbol:'qnt',name:'Quant',current_price:100,market_cap:1e9,total_volume:1e8,
  last_updated:new Date(now-60000).toISOString(),price_change_percentage_1h_in_currency:2,price_change_percentage_24h:9}) as CoinGeckoMarketData;
describe('major exchange discovery',()=>{
  it('validates trade times at response receipt, including trades after the scan began',async()=>{
    const result=await collectDiscoveryMarkets(async ex=>[{...ticker('quant',ex),last_traded_at:new Date(now+1000).toISOString()}],async()=>[coin()],now,()=>now+2000);
    expect(result.eligiblePairs).toBe(5);expect(result.rejectedPairs).toEqual({});
  });
  it('still rejects genuinely stale or future trades at response receipt',async()=>{
    const result=await collectDiscoveryMarkets(async ex=>[{...ticker('quant',ex),last_traded_at:new Date(now+3000).toISOString()},{...ticker('old',ex),last_traded_at:new Date(now-900001).toISOString()}],async()=>[],now,()=>now+2000);
    expect(result.eligiblePairs).toBe(0);expect(result.rejectedPairs.trade_timestamp_outside_window).toBe(10);
  });
  it('keeps identities separate when symbols collide, deduplicates identical IDs',()=>{
    const rows=screenCryptoMarkets([coin(),coin(),coin('other-quant')],new Set(['quant']),now);
    expect(rows).toHaveLength(2); expect(rows.find(r=>r.id==='other-quant')?.fixedScanCovered).toBe(false);
  });
  it('retains extended moves for review rather than issuing entry permission',()=>{
    expect(screenCryptoMarkets([{...coin(),price_change_percentage_24h:60}],new Set(),now)[0].stage).toBe('EXTENDED');
  });
  it.each([{last_updated:'bad'},{total_volume:null},{price_change_percentage_1h_in_currency:undefined},{id:'wrapped-bitcoin'},{id:'tether'},{id:'microstrategy-xstock'}])('does not invent missing quality/momentum data %j',patch=>{
    expect(screenCryptoMarkets([{...coin(),...patch}],new Set(),now)[0].stage).toBe('EXCLUDED');
  });
  it.each([{is_stale:true},{is_anomaly:true},{bid_ask_spread_percentage:null},{bid_ask_spread_percentage:1},
    {last_traded_at:new Date(now-3600000).toISOString()},{last_traded_at:new Date(now+60000).toISOString()}])('rejects unsuitable venue evidence %j',patch=>{
    expect(eligibleVenue({...ticker(),...patch},'binance',now)).toBeNull();
  });
  it('requires the requested exchange identity',()=>expect(eligibleVenue(ticker(),'unapproved',now)).toBeNull());
  it('deduplicates venue pairs, stops at list end and only fetches verified coin IDs',async()=>{
    const fetch=vi.fn(async()=>[coin(),coin('unrequested')]);
    const result=await collectDiscoveryMarkets(async ex=>[ticker('quant',ex),ticker('quant',ex)],fetch,now);
    expect(result.requests).toBe(6); expect(fetch).toHaveBeenCalledWith(['quant']);
    expect(result.venues.quant).toHaveLength(5); expect(result.rows).toHaveLength(1);
  });
  it('reports failures and missing markets without substituting the broad coin universe',async()=>{
    const result=await collectDiscoveryMarkets(async ex=>ex==='binance'?null:[ticker('quant',ex)],async()=>null,now);
    expect(result.coverage[0].status).toBe('FAILED'); expect(result.missingMarketIds).toEqual(['quant']);
    expect(result.failedMarketBatches).toEqual([1]);
  });
  it('caps a full run at 21 requests',async()=>{
    const result=await collectDiscoveryMarkets(async(ex,p)=>Array.from({length:100},(_,i)=>ticker(`${ex}-${p}-${i}`,ex)),async ids=>ids.map(coin),now);
    expect(result.requests).toBe(21); expect(result.rows).toHaveLength(1500);
    expect(result.coverage.every(c=>c.status==='CAPPED')).toBe(true);
  });
});
