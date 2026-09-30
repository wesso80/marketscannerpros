import {it,expect} from 'vitest';
import {aggregate,dailyContext,exitFixed,exitTrend,exitDaily,runCoin,verifyMapping,stats,rankTopThird,netR,dayKey,HARNESS,type HarnessTrade} from '@/lib/admin/strategyHarness';
import type {ExchangeBar} from '@/lib/admin/cryptoExchangeVolume';
const H=3600000,F=4*H,D=86400000,t0=Date.UTC(2022,0,1);
const bar=(t:number,o:number,h:number,l:number,c:number,v=10):ExchangeBar=>({t,o,h,l,c,v});
it('aggregates complete hourly groups into close-stamped 4h/daily bars and drops incomplete ones',()=>{
 const hourly=Array.from({length:7},(_,i)=>bar(t0+(i+1)*H,1+i,2+i,.5+i,1.5+i));
 const f=aggregate(hourly,F);expect(f).toEqual([{t:t0+F,o:1,h:5,l:.5,c:4.5,v:40}]);
});
it('fixed exits: stop first when a candle touches both, gaps fill at the open, horizon is marked',()=>{
 const p={fill:100,stop:95,target:110,entryAt:t0};
 expect(exitFixed(p,[bar(t0+H,100,111,94,105)],0,t0+7*D,Infinity)).toMatchObject({price:95,reason:'STOP'});
 expect(exitFixed(p,[bar(t0+H,100,101,99,100),bar(t0+2*H,90,91,89,90)],0,t0+7*D,Infinity)).toMatchObject({price:90,reason:'STOP_GAP'});
 expect(exitFixed(p,[bar(t0+H,100,110.5,99,110)],0,t0+7*D,Infinity)).toMatchObject({price:110,reason:'TARGET'});
 const flat=Array.from({length:200},(_,i)=>bar(t0+(i+1)*H,100,101,99,100.5));
 expect(exitFixed(p,flat,0,t0+7*D,Infinity)).toMatchObject({reason:'HORIZON',marked:true,at:t0+7*D});
});
it('trend exits: a daily close under the 20-day EMA exits at that close while the wide ATR trail is not hit',()=>{
 const hourly:ExchangeBar[]=[];
 // Wide intraday swings (ATR ~ 10) keep the 3 x ATR trail far away; a slow decline then closes under the EMA.
 for(let d=0;d<60;d++)for(let h=1;h<=24;h++){const p=d<45?100+d:144-(d-44)*2,w=h%2?5:-5;hourly.push(bar(t0+d*D+h*H,p,p+Math.abs(w),p-Math.abs(w),p));}
 const daily=aggregate(hourly,D),ctx=dailyContext(daily),four=aggregate(hourly,F);
 const x=exitTrend({fill:130,stop:100,target:null,entryAt:t0+30*D},hourly,0,ctx,four,true,Infinity)!;
 expect(x.reason).toBe('CLOSE_BELOW_EMA20');expect(x.at%D).toBe(0);expect(x.at).toBeGreaterThan(t0+45*D);
 expect(exitDaily({fill:130,stop:100,target:null,entryAt:t0+30*D},daily,ctx,Infinity)!.reason).toBe('CLOSE_BELOW_EMA20');
 // Narrow ranges: the 3 x ATR trail is raised close under price and exits first (it only ever moves up).
 const tight:ExchangeBar[]=[];for(let d=0;d<60;d++)for(let h=1;h<=24;h++){const p=d<45?100+d:145-(d-44)*6;tight.push(bar(t0+d*D+h*H,p,p+.5,p-.5,p));}
 const td=aggregate(tight,D),y=exitTrend({fill:130,stop:100,target:null,entryAt:t0+30*D},tight,0,dailyContext(td),aggregate(tight,F),true,Infinity)!;
 expect(['STOP_GAP','TRAIL_STOP']).toContain(y.reason);expect(y.price).toBeGreaterThan(100);
});
it('the tight 4h trail engages only when price is stretched more than 3 daily ATR above the 20-day EMA',()=>{
 const hourly:ExchangeBar[]=[];
 for(let d=0;d<40;d++)for(let h=1;h<=24;h++){const p=d<30?100+(h%2):100+(d-29)*8+h*.3;hourly.push(bar(t0+d*D+h*H,p,p+.4,p-.4,p));}
 // A sharp 4h drop after the spike: the tight trail exits before any daily EMA exit.
 const last=hourly.at(-1)!;for(let k=1;k<=6;k++)hourly.push(bar(last.t+k*H,last.c-k*3,last.c-k*3+.2,last.c-k*3-.2,last.c-k*3));
 const daily=aggregate(hourly,D),ctx=dailyContext(daily),four=aggregate(hourly,F);
 const withTight=exitTrend({fill:101,stop:95,target:null,entryAt:t0+29*D},hourly,0,ctx,four,true,Infinity)!,without=exitTrend({fill:101,stop:95,target:null,entryAt:t0+29*D},hourly,0,ctx,four,false,Infinity)!;
 expect(['TRAIL_STOP','STOP_GAP']).toContain(withTight.reason);
 expect(withTight.price).toBeGreaterThan(without.price);expect(withTight.at).toBeLessThanOrEqual(without.at);
});
// Uptrend with periodic high-volume 4h pushes, so the live signal fires.
function market(){const hourly:ExchangeBar[]=[];let p=100;
 for(let i=1;i<=24*80;i++){const four=Math.floor((i-1)/4),spike=four%12===11;const step=spike?1.006:1.0004,o=p;p*=step;hourly.push(bar(t0-40*D+i*H,o,Math.max(o,p)*1.01,Math.min(o,p)*.99,p,spike?40:10));}
 return hourly;}
it('gates every variant by the point-in-time universe, the BTC regime and the ranking; entries follow signals',()=>{
 const hourly=market(),end=hourly.at(-1)!.t,days=new Set(Array.from({length:40},(_,i)=>dayKey(t0+i*D)));
 const base={coin:'x',product:'X-USD',universeDays:days,rankDays:days,btcBull:new Map([...days].map(d=>[d,true]))};
 const all=runCoin(base,hourly,end),count=(v:string,ts:HarnessTrade[])=>ts.filter(t=>t.variant===v).length;
 expect(count('A',all)).toBeGreaterThan(0);expect(count('A',all)).toBeGreaterThanOrEqual(count('B',all));
 for(const t of all){expect(Date.parse(t.entryAt)).toBeGreaterThanOrEqual(Date.parse(t.signalAt));expect(t.fill).toBeGreaterThan(t.stop);if(['B','C','D','E','F'].includes(t.variant))expect(t.kind).toBe('CONTINUATION');}
 expect(runCoin({...base,universeDays:new Set()},hourly,end)).toEqual([]);
 const bear=runCoin({...base,btcBull:new Map()},hourly,end);expect(['C','D','E','F'].map(v=>count(v,bear))).toEqual([0,0,0,0]);
 const unranked=runCoin({...base,rankDays:new Set()},hourly,end);expect(count('F',unranked)).toBe(0);expect(count('A',unranked)).toBe(count('A',all));
});
it('accepts a Coinbase pair only when its daily closes match CoinGecko (never by symbol alone)',()=>{
 const daily=Array.from({length:40},(_,i)=>bar(t0+(i+1)*D,10,11,9,10+i*.1));
 const same=new Map(daily.map(b=>[dayKey(b.t),b.c*1.01])),other=new Map(daily.map(b=>[dayKey(b.t),b.c*1.5]));
 expect(verifyMapping(daily,same)).toMatchObject({accepted:true,overlap:40});expect(verifyMapping(daily,other).accepted).toBe(false);
 expect(verifyMapping(daily.slice(0,10),same).accepted).toBe(false);
});
it('reports expectancy, profit factor and drawdown on the R curve by exit time',()=>{
 const t=(r:number,exit:string)=>({variant:'A',coin:'x',kind:'BREAKOUT',signalAt:'',entryAt:'2022-01-01',exitAt:exit,fill:1,stop:.9,exit:1,r,reason:'',marked:false}) as HarnessTrade;
 const s=stats([t(2,'2022-01-02'),t(-1,'2022-01-03'),t(-1,'2022-01-04'),t(3,'2022-01-05')]);
 expect(s).toMatchObject({trades:4,winRate:.5,expectancyR:.75,profitFactor:2.5,maxDrawdownR:-2,totalR:3});
 expect(netR(110,100,95,0)).toBeCloseTo(2,9);
});
it('ranks all coins first, takes the top third, then requires being above the 50-day average',()=>{
 const day='2022-06-01',prices=new Map<string,Map<string,number>>(),mk=(id:string,f:(k:number)=>number)=>prices.set(id,new Map(Array.from({length:121},(_,k)=>[dayKey(Date.parse(day)-(120-k)*D),f(k)*(1+.001*Math.sin(k*1.3))])));
 mk('crash',k=>k<115?200-k:120+(k-115)*30);mk('b',k=>100*1.004**k);mk('c',k=>100*1.003**k);mk('d',k=>100*1.001**k);mk('e',k=>100);mk('f',k=>100*.999**k);
 const r=rankTopThird(prices,new Map([[day,['crash','b','c','d','e','f']]])).get(day)!;
 expect(r.has('d')).toBe(false);expect(r.size).toBeLessThanOrEqual(2);expect(HARNESS.rank.topFraction).toBeCloseTo(1/3,9);
});
