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
 {stop:101}, {maxEntry:100}, {entryFloor:101}, {stop:undefined}, {stop:NaN}, {stop:0.000000001},
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
it('returns only post-entry history; earlier candles are read only as a gap-fill anchor',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);
 const fetcher=vi.fn(async(_url:string)=>Response.json([[now/1000-900,98,101,100,100,10]]));vi.stubGlobal('fetch',fetcher);
 const path=await fetchPaperPath('bitcoin','BTC-USD',new Date(now-600000).toISOString());
 const url=new URL(fetcher.mock.calls[0][0] as string);
 expect(url.searchParams.get('start')).toBe(new Date(now-9*900000).toISOString());
 expect(path.candles).toHaveLength(1);expect(path.filledBars).toBe(0);
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
it('fills a short no-trade run flat at the prior close, flags it, and rejects longer gaps',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);
 const serve=(missing:(t:number)=>boolean)=>vi.fn(async(url:string)=>{const p=new URL(url).searchParams,a=Date.parse(p.get('start')!),b=Date.parse(p.get('end')!),rows=[];for(let t=a;t<b;t+=900000)if(!missing(t))rows.unshift([t/1000,98,101,100,99,10]);return Response.json(rows);});
 // 3 missing candles across the page boundary of a 400-candle catch-up.
 vi.stubGlobal('fetch',serve(t=>t>=now-110*900000&&t<now-107*900000));
 const path=await fetchPaperPath('bitcoin','BTC-USD',new Date(now-400*900000).toISOString());
 expect(path.candles).toHaveLength(400);expect(path.filledBars).toBe(3);
 expect(path.candles.find(c=>c.openAt===now-109*900000)).toMatchObject({open:99,high:99,low:99,close:99});
 vi.stubGlobal('fetch',serve(t=>t>=now-120*900000&&t<now-110*900000));
 await expect(fetchPaperPath('bitcoin','BTC-USD',new Date(now-400*900000).toISOString())).rejects.toThrow('no-trade limit');
});
it('fills a no-trade run right after the checkpoint from a real anchor candle, never past the last real candle',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json([[(now-900000)/1000,98,101,100,100,10],[(now-10*900000)/1000,95,97,96,96.5,10]])));
 const path=await fetchPaperPath('bitcoin','BTC-USD',new Date(now-4*900000).toISOString());
 expect(path.candles.map(c=>c.openAt)).toEqual([now-4*900000,now-3*900000,now-2*900000,now-900000]);
 expect(path.candles[0]).toMatchObject({open:96.5,close:96.5});expect(path.filledBars).toBe(3);
});
it('anchors the target to the actual fill (paper and backtest share this), so R at target does not depend on entry timing',()=>{
 for(const ask of ['99.2','100','101.5']){
  const q=parsePaperQuote({bid:String(Number(ask)-.01),ask,time:new Date(now).toISOString()},'BTC-USD',now),p=planCryptoPaper(signal,q,200000,200000,now);
  expect(p.ok).toBe(true);
  if(p.ok){expect(p.target).toBeCloseTo(p.fill+2*(p.fill-p.stop),6);expect(p.signalTarget).toBe(112);expect(p.targetRule).toBe('fill-2R-v1');expect(p.rewardRisk).toBeGreaterThan(1.88);expect(p.rewardRisk).toBeLessThan(2);}
 }
});
