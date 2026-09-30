import {it,expect,vi,beforeEach} from 'vitest';
import {createHmac} from 'crypto';
const store=new Map<string,unknown>();
vi.mock('@/lib/redis',()=>({getRedis:()=>({set:async(k:string,v:unknown,o?:{nx?:boolean})=>{if(o?.nx&&store.has(k))return null;store.set(k,v);return 'OK';},get:async(k:string)=>store.get(k)??null,del:async(k:string)=>store.delete(k)})}));
import {assessTickers,networkMap,pickHolderContract,assessHolders,verifyCgWebhook,webhookCoinId,NEW_LISTINGS} from '@/lib/admin/cryptoNewListings';
import type {CoinTicker} from '@/lib/coingecko';
beforeEach(()=>{store.clear();delete process.env.CG_WEBHOOK_SECRET;});
const t=(o:Partial<CoinTicker>):CoinTicker=>({base:'NEW',target:'USDT',market:{name:'Binance',identifier:'binance',has_trading_incentive:false},last:1,volume:1,converted_last:{btc:0,eth:0,usd:1},converted_volume:{btc:0,eth:0,usd:500000},trust_score:'green',bid_ask_spread_percentage:.2,timestamp:'',last_traded_at:'',last_fetch_at:'',is_anomaly:false,is_stale:false,trade_url:null,coin_id:'new-coin',cost_to_move_up_usd:50000,cost_to_move_down_usd:40000,...o});
it('matches tickers by CoinGecko id (never symbol), drops stale/anomalous ones, and applies the liquidity screen',()=>{
 const r=assessTickers('new-coin',[t({}),t({coin_id:'other-new',base:'NEW'}),t({is_stale:true}),t({market:{name:'Gate',identifier:'gate',has_trading_incentive:false},converted_volume:{btc:0,eth:0,usd:1000}})],'now');
 expect(r).toMatchObject({liquidity:'LIQUID',excluded:{otherCoin:1,staleOrAnomaly:1}});expect(r.exchanges.map(e=>e.exchange)).toEqual(['binance','gate']);
 expect(assessTickers('new-coin',[t({bid_ask_spread_percentage:2})],'now').liquidity).toBe('THIN');
 expect(assessTickers('new-coin',[t({cost_to_move_down_usd:500})],'now').liquidity).toBe('THIN');
 expect(assessTickers('new-coin',[t({coin_id:'x'})],'now').liquidity).toBe('NO_USABLE_TICKERS');
 expect(assessTickers('new-coin',null,'now').liquidity).toBe('UNAVAILABLE');
});
it('picks a token contract on a network with holder data, and reports native coins or unsupported networks',()=>{
 const map=networkMap([{id:'eth',attributes:{coingecko_asset_platform_id:'ethereum'}},{id:'solana',attributes:{coingecko_asset_platform_id:'solana'}},{id:'polygon_pos',attributes:{coingecko_asset_platform_id:'polygon-pos'}}]);
 expect(pickHolderContract({detail_platforms:{solana:{contract_address:'So1'},ethereum:{contract_address:'0xabc'}}},map)).toEqual({platform:'ethereum',network:'eth',address:'0xabc'});
 expect(pickHolderContract({detail_platforms:{'':{contract_address:''}}},map)).toMatchObject({reason:expect.stringContaining('No token contract')});
 expect(pickHolderContract({platforms:{'polygon-pos':'0xdef'}},map)).toMatchObject({reason:expect.stringContaining('polygon-pos')});
 expect(pickHolderContract(null,map)).toEqual({reason:'Coin detail unavailable'});
});
it('flags concentrated supply from top holders and marks missing data UNAVAILABLE',()=>{
 const h=(p:number[])=>({lastUpdatedAt:'x',holders:p.map((pct,i)=>({rank:i+1,address:`a${i}`,label:i===0?'Binance':null,amount:'1',percentage:String(pct)}))});
 expect(assessHolders('eth','0x',h([25,5,5]),'now')).toMatchObject({flag:'CONCENTRATED',top1Pct:25,top10Pct:35});
 expect(assessHolders('eth','0x',h(Array(10).fill(5.5)),'now')).toMatchObject({flag:'CONCENTRATED',top10Pct:55});
 expect(assessHolders('eth','0x',h([3,2,1]),'now').flag).toBe('OK');
 expect(assessHolders('eth','0x',null,'now')).toMatchObject({flag:'UNAVAILABLE',top1Pct:null});
});
const sign=(body:string,ts:string,id:string,secret='whsec_test')=>createHmac('sha256',secret).update(`${ts}:${id}:${body}`).digest('hex');
it('verifies webhook signatures over the raw body with replay protection',()=>{
 const body='{"type":"cg.coin.listed","data":{"id":"new-coin"}}',now=Date.UTC(2026,8,30),ts=String(now/1000);
 expect(verifyCgWebhook(body,{timestamp:ts,eventId:'e1',signature:sign(body,ts,'e1')},'whsec_test',now)).toEqual({ok:true});
 expect(verifyCgWebhook(body+' ',{timestamp:ts,eventId:'e1',signature:sign(body,ts,'e1')},'whsec_test',now)).toMatchObject({ok:false,reason:'Signature mismatch'});
 expect(verifyCgWebhook(body,{timestamp:String(now/1000-NEW_LISTINGS.webhookToleranceSeconds-1),eventId:'e1',signature:'x'},'whsec_test',now)).toMatchObject({reason:'Timestamp outside tolerance'});
 expect(verifyCgWebhook(body,{timestamp:null,eventId:'e1',signature:'x'},'whsec_test',now)).toMatchObject({reason:'Missing CoinGecko headers'});
 expect(webhookCoinId({data:{id:'new-coin'}})).toBe('new-coin');expect(webhookCoinId({data:{symbol:'NEW'}})).toBeNull();expect(webhookCoinId({data:{id:'Bad ID!'}})).toBeNull();
});
it('webhook route: disabled without a secret, rejects bad signatures, ignores other events, queues listed coins once',async()=>{
 const {POST}=await import('@/app/api/webhooks/coingecko/route');
 const req=(body:string,id:string,sig?:string)=>{const ts=String(Math.floor(Date.now()/1000));return new Request('http://x/api/webhooks/coingecko',{method:'POST',body,headers:{'x-cg-timestamp':ts,'x-cg-event-id':id,'x-cg-signature':sig??sign(body,ts,id)}});};
 const listed='{"type":"cg.coin.listed","data":{"id":"new-coin"}}';
 expect((await POST(req(listed,'e0'))).status).toBe(404);
 process.env.CG_WEBHOOK_SECRET='whsec_test';
 expect((await POST(req(listed,'e1','bad'))).status).toBe(401);
 expect(await (await POST(req('{"type":"cg.coin.info.updated","data":{"id":"bitcoin"}}','e2'))).json()).toMatchObject({ignored:'cg.coin.info.updated'});
 expect((await POST(req(listed,'e3'))).status).toBe(200);
 expect(await (await POST(req(listed,'e3'))).json()).toMatchObject({duplicate:true});
 const s=store.get('admin:crypto-markets:new-listings:v1') as {listings:Record<string,{source:string}>;webhookEvents:number};
 expect(s.listings['new-coin'].source).toBe('webhook cg.coin.listed');expect(s.webhookEvents).toBe(1);
});
