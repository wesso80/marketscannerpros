import {afterEach,it,expect,vi} from 'vitest';
import {parseOkxQuote,convertOkxQuote,convertedExitPath,usdSignal,fetchOkxUsdPath} from '@/lib/admin/cryptoPaperOkx';
import {planCryptoPaper} from '@/lib/admin/cryptoPaperMarket';
import {evaluatePaperExitPath} from '@/lib/admin/portfolio-lab/paperExitPath';
import type {ArcaPosition} from '@/lib/admin/portfolio-lab/types';
import type {VolumeMomentum} from '@/lib/admin/cryptoVolumeMomentum';
const now=Date.UTC(2026,8,29,1),step=900000;
const raw={code:'0',data:[{instType:'SPOT',instId:'CELO-USDT',bidPx:'100',askPx:'100.01',bidSz:'20',askSz:'20',ts:String(now)}]};
const fx={product:'USDT-USD',bid:.995,ask:.9951,priceAt:new Date(now).toISOString(),receivedAt:new Date(now).toISOString()};
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('uses observed bid/ask conversion and the older source timestamp',()=>{
 const q=convertOkxQuote(parseOkxQuote(raw,'CELO-USDT',now),{...fx,priceAt:new Date(now-1000).toISOString()},now);
 expect(q.bid).toBe(99.5);expect(q.ask).toBeCloseTo(99.519951);expect(q.priceAt).toBe(new Date(now-1000).toISOString());
});
it.each([{instId:'WRONG-USDT'},{instType:'SWAP'},{ts:String(now-61000)},{bidSz:'0'},{askPx:'99'},{ts:String(now+1)}])('rejects wrong identity or unusable quotes %j',patch=>{
 expect(()=>parseOkxQuote({...raw,data:[{...raw.data[0],...patch}]},'CELO-USDT',now)).toThrow();
});
it('refuses missing/stale conversion and blocks new entries during depeg',()=>{
 const q=parseOkxQuote(raw,'CELO-USDT',now);
 expect(()=>convertOkxQuote(q,{...fx,priceAt:new Date(now-61000).toISOString()},now)).toThrow();
 const converted=convertOkxQuote(q,{...fx,bid:.9,ask:.9001},now);
 expect(()=>usdSignal({} as VolumeMomentum,converted)).toThrow('deviates');
 // Valuation/exit quotes remain available during depeg; no fake $1 rate.
 expect(converted.bid).toBe(90);
});
it('does not invent a cross-currency target from highs at different times',()=>{
 const b={t:now,o:100,h:110,l:90,c:100,v:1},f={t:now,o:1,h:1.1,l:.9,c:1,v:1};
 const path=convertedExitPath('celo',[b],[f]);expect(path.candles[0].high).toBeCloseTo(99);expect(path.candles[0].low).toBe(81);
 const p={symbol:'celo',assetClass:'crypto',side:'LONG',openedAt:new Date(now-step).toISOString(),averageEntry:95,stopLoss:80,initialStopLoss:80,takeProfit1:115} as ArcaPosition;
 expect(evaluatePaperExitPath(p,path,now).exit).toBeUndefined();
 expect(()=>convertedExitPath('celo',[b],[])).toThrow('Missing matching');
});
it('retains conservative stop priority and USD conversion under depeg',()=>{
 const b={t:now,o:100,h:101,l:99,c:100,v:1},f={t:now,o:.9,h:.91,l:.89,c:.9,v:1};
 const path=convertedExitPath('celo',[b],[f]);
 const p={symbol:'celo',assetClass:'crypto',side:'LONG',openedAt:new Date(now-step).toISOString(),averageEntry:100,stopLoss:95,initialStopLoss:95,takeProfit1:110} as ArcaPosition;
 expect(evaluatePaperExitPath(p,path,now).exit).toMatchObject({reason:'STOP_LOSS',price:89});
});
it('includes costs of both legs in sizing and reward-risk',()=>{
 const signal={stage:'MOMENTUM_VOLUME',asOf:new Date(now).toISOString(),stop:95,target:112,maxEntry:102,entryFloor:99} as VolumeMomentum;
 const q={...fx,product:'TEST-USD',bid:99.99,ask:100};
 const a=planCryptoPaper(signal,q,200000,200000,now),b=planCryptoPaper(signal,q,200000,200000,now,.001);
 expect(a.ok&&b.ok).toBe(true);if(a.ok&&b.ok){expect(b.quantity).toBeLessThan(a.quantity);expect(b.rewardRisk).toBeLessThan(a.rewardRisk);expect(b.risk).toBeLessThanOrEqual(500);}
});
it('fetches aligned historical FX rather than using the current conversion rate for old bars',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.includes('okx.com')?{code:'0',data:[[String(now-step),'100','110','90','100','20','0','0','1']]}:[[(now-step)/1000,.98,1,.99,.99,100]])));
 const path=await fetchOkxUsdPath('celo','CELO-USDT',new Date(now-step).toISOString());expect(path.candles[0].open).toBe(98);expect(path.candles[0].low).toBe(88.2);
});
it('blocks incomplete historical conversion instead of assuming parity',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);vi.stubGlobal('fetch',vi.fn(async(url:string)=>Response.json(url.includes('okx.com')?{code:'0',data:[[String(now-step),'100','110','90','100','20','0','0','1']]}:[])));
 await expect(fetchOkxUsdPath('celo','CELO-USDT',new Date(now-step).toISOString())).rejects.toThrow('Incomplete');
});
it('walks OKX 100-candle pages back to the checkpoint during catch-up',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);const n=250,start=now-n*step;
 const okx=vi.fn((after:number)=>{const rows=[];for(let t=after-step;t>=Math.max(start,after-100*step);t-=step)rows.push([String(t),'100','110','90','100','20','0','0','1']);return {code:'0',data:rows};});
 const fetcher=vi.fn(async(url:string)=>{const p=new URL(url).searchParams;if(url.includes('okx.com')){expect(p.get('limit')).toBe('100');return Response.json(okx(Number(p.get('after'))));}
  const a=Date.parse(p.get('start')!),b=Date.parse(p.get('end')!),rows=[];for(let t=a;t<b;t+=step)rows.push([t/1000,.98,1,.99,.99,100]);return Response.json(rows);});
 vi.stubGlobal('fetch',fetcher);
 const path=await fetchOkxUsdPath('celo','CELO-USDT',new Date(start).toISOString());
 expect(path.candles).toHaveLength(n);expect(path.candles[0].openAt).toBe(start);
 expect(fetcher.mock.calls.filter(([u])=>String(u).includes('okx.com'))).toHaveLength(3);
});
it('still refuses OKX catch-up beyond seven days',async()=>{
 vi.spyOn(Date,'now').mockReturnValue(now);const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 await expect(fetchOkxUsdPath('celo','CELO-USDT',new Date(now-673*step).toISOString())).rejects.toThrow('requires recovery');expect(fetcher).not.toHaveBeenCalled();
});
