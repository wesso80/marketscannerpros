import {it,expect} from 'vitest';
import {returnCorrelation,correlationScale,instrumentPair} from '@/lib/admin/cryptoCorrelation';
const F=4*3600000;
const series=(f:(k:number)=>number,n=40)=>Array.from({length:n},(_,k)=>({t:(k+1)*F,o:1,h:1,l:1,c:f(k),v:1}));
const a=series(k=>100*Math.exp(.02*Math.sin(k*1.3))),b=series(k=>50*Math.exp(.02*Math.sin(k*1.3))),z=series(k=>80*Math.exp(.02*Math.sin(k*2.9+1)*Math.cos(k*.7)));
it('measures 4h return correlation on aligned candles over the last 30 bars',()=>{
 expect(returnCorrelation(a,b)!.rho).toBeCloseTo(1,6);expect(returnCorrelation(a,b)!.n).toBe(30);
 expect(Math.abs(returnCorrelation(a,z)!.rho)).toBeLessThan(.7);
 expect(returnCorrelation(a,series(k=>100+k,10))).toBeNull();
});
it('scales risk by 1/sqrt(1+n), counts missing history as correlated, and floors at 25%',()=>{
 expect(correlationScale(a,[{coin:'z',bars:z}])).toMatchObject({scale:1,correlated:[],unavailable:[]});
 expect(correlationScale(a,[{coin:'b',bars:b},{coin:'x',bars:null},{coin:'z',bars:z}])).toMatchObject({scale:1/Math.sqrt(3),correlated:[{coin:'b',rho:1}],unavailable:['x']});
 expect(correlationScale(a,Array.from({length:20},(_,i)=>({coin:`c${i}`,bars:b}))).scale).toBe(.25);
});
it('maps paper instruments to their candle venues',()=>{
 expect(instrumentPair('coinbase:SOL-USD')).toEqual({exchange:'gdax',product:'SOL-USD',quote:'USD',volumeUnit:'SOL'});
 expect(instrumentPair('okx-usd-v1:SOL-USDT')).toEqual({exchange:'okex',product:'SOL-USDT',quote:'USDT',volumeUnit:'SOL'});
 expect(instrumentPair('spot')).toBeNull();
});
