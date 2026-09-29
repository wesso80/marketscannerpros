import {expect,it,vi,afterEach} from 'vitest';
import {parsePaperQuote,planCryptoPaper,fetchPaperPath,parsePaperBook,fetchPaperQuote} from '@/lib/admin/cryptoPaperMarket';
import type {VolumeMomentum} from '@/lib/admin/cryptoVolumeMomentum';
const now=Date.parse('2026-09-28T05:00:00Z');
const signal={stage:'MOMENTUM_VOLUME',asOf:'2026-09-28T04:00:00Z',stop:95,target:112,maxEntry:102,entryFloor:99} as VolumeMomentum;
const quote=parsePaperQuote({bid:'99.99',ask:'100',time:new Date(now).toISOString()},'BTC-USD',now);
it('sizes to risk and notional limits including entry/exit friction',()=>{
 const p=planCryptoPaper(signal,quote,200000,200000,now);expect(p.ok).toBe(true);
 if(p.ok){expect(p.risk).toBeLessThanOrEqual(500);expect(p.notional).toBeLessThanOrEqual(20000);expect(p.fill).toBe(100.05);expect(p.rewardRisk).toBeGreaterThan(1.5);}
});
it.each([
 {stage:'EXTENDED'}, {asOf:'2026-09-27T04:00:00Z'}, {asOf:'2026-09-29T04:00:00Z'},
 {stop:101}, {target:104}, {maxEntry:100}, {entryFloor:101}, {stop:undefined}, {stop:NaN}, {stop:0.000000001},
])('rejects stale, incomplete, chased, invalid and poor reward/risk setups %j',patch=>{
 expect(planCryptoPaper({...signal,...patch} as VolumeMomentum,quote,200000,200000,now).ok).toBe(false);
});
it.each([{bid:99,ask:100},{priceAt:'2026-09-28T04:58:00Z'},{priceAt:'garbage'},{ask:NaN},{bid:101}])('blocks bad quotes %j',patch=>{
 expect(planCryptoPaper(signal,{...quote,...patch},200000,200000,now).ok).toBe(false);
});
it('does not enter on missing cash or equity',()=>{
 expect(planCryptoPaper(signal,quote,200000,0,now).ok).toBe(false);
 expect(planCryptoPaper(signal,quote,NaN,200000,now).ok).toBe(false);
});
it('rejects stale/future tick timestamps and crossed bid/ask',()=>{
 for(const raw of [{bid:100,ask:99,time:new Date(now).toISOString()},{bid:100,ask:101,time:new Date(now-61000).toISOString()},{bid:100,ask:101,time:new Date(now+1).toISOString()}])expect(()=>parsePaperQuote(raw,'BTC-USD',now)).toThrow();
});

afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('fetches only post-entry history, not unrelated pre-entry gaps',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);
 const fetcher=vi.fn(async(_url:string)=>Response.json([[now/1000-900,98,101,100,100,10]]));vi.stubGlobal('fetch',fetcher);
 const path=await fetchPaperPath('bitcoin','BTC-USD',new Date(now-600000).toISOString());
 const url=new URL(fetcher.mock.calls[0][0] as string);
 expect(url.searchParams.get('start')).toBe(new Date(now-900000).toISOString());
 expect(path.candles).toHaveLength(1);
});
it('retains a precise provider failure instead of a generic monitoring message',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:429})));
 await expect(fetchPaperPath('bitcoin','BTC-USD',new Date(now-900000).toISOString())).rejects.toThrow('HTTP 429');
});
it('does not silently discard history outside the recovery window',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await expect(fetchPaperPath('bitcoin','BTC-USD',new Date(now-673*900000).toISOString())).rejects.toThrow('requires recovery');expect(fetcher).not.toHaveBeenCalled();
});

it('values from a fresh order book without requiring a recent last trade',()=>{
 expect(parsePaperBook({bids:[['99','10',1]],asks:[['100','10',1]],time:new Date(now).toISOString(),sequence:123},'BTC-USD',now)).toMatchObject({bid:99,ask:100,source:'coinbase_order_book',sequence:123});
});
it.each([
 {time:new Date(now-61000).toISOString()}, {time:new Date(now+1).toISOString()}, {time:undefined},
 {auction_mode:true}, {bids:[]}, {asks:[['100','0',1]]}, {bids:[['101','10',1]]},
])('rejects unsafe order books %j',patch=>{
 expect(()=>parsePaperBook({bids:[['99','10',1]],asks:[['100','10',1]],time:new Date(now).toISOString(),sequence:123,...patch},'BTC-USD',now)).toThrow();
});
it('fetches the timestamped book instead of the last-trade ticker',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);
 const fetcher=vi.fn(async()=>Response.json({bids:[['99','10',1]],asks:[['100','10',1]],time:new Date(now).toISOString(),sequence:123}));vi.stubGlobal('fetch',fetcher);
 await expect(fetchPaperQuote('BTC-USD')).resolves.toMatchObject({source:'coinbase_order_book'});
 expect(fetcher).toHaveBeenCalledWith('https://api.exchange.coinbase.com/products/BTC-USD/book?level=1',expect.objectContaining({cache:'no-store'}));
});
it('catches up a missed interval longer than one provider page without skipping candles',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);
 const fetcher=vi.fn(async(url:string)=>{const p=new URL(url).searchParams,a=Date.parse(p.get('start')!),b=Date.parse(p.get('end')!),rows=[];for(let t=a;t<b;t+=900000)rows.unshift([t/1000,98,101,100,100,10]);return Response.json(rows);});
 vi.stubGlobal('fetch',fetcher);
 const path=await fetchPaperPath('bitcoin','BTC-USD',new Date(now-400*900000).toISOString());
 expect(fetcher).toHaveBeenCalledTimes(2);expect(path.candles).toHaveLength(400);
 expect(path.candles[0].openAt).toBe(now-400*900000);expect(path.candles.at(-1)!.closeAt).toBe(now);
});
it('rejects a gap at a page boundary instead of skipping it',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{const p=new URL(url).searchParams,a=Date.parse(p.get('start')!),b=Date.parse(p.get('end')!),rows=[];for(let t=a;t<b;t+=900000)if(t!==a||a===now-400*900000)rows.push([t/1000,98,101,100,100,10]);return Response.json(rows);}));
 await expect(fetchPaperPath('bitcoin','BTC-USD',new Date(now-400*900000).toISOString())).rejects.toThrow('between history pages');
});
