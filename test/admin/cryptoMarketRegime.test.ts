import {it,expect} from 'vitest';
import {btcLongTrend,breadthAt,breadthBucket,bullGate} from '@/lib/admin/cryptoMarketRegime';
const D=86400000,day=Date.UTC(2026,8,29);
const series=(f:(i:number)=>number,n=260)=>Array.from({length:n},(_,i)=>({t:day-(n-1-i)*D,o:1,h:1,l:1,c:f(i),v:1}));
it('classifies the BTC 200-day regime from completed daily candles only',()=>{
 expect(btcLongTrend(series(i=>30000+i*100),day+3600000)).toBe('BULL');
 expect(btcLongTrend(series(i=>90000-i*100),day+3600000)).toBe('BEAR');
 // Bear market with a sharp late rally: price above the 200-day but the 50-day still below it.
 expect(btcLongTrend(series(i=>i<250?90000-i*150:120000),day+3600000)).toBe('TRANSITION');
 expect(btcLongTrend(series(i=>i,150),day)).toBe('UNAVAILABLE');
 expect(btcLongTrend(series(i=>i).slice(0,-1),day)).toBe('UNAVAILABLE');
});
it('measures breadth only from coins with fresh 50-day history and gates on BULL plus >=50%',()=>{
 const coins:Record<string,[number,number][]>={};
 for(let k=0;k<12;k++)coins[`c${k}`]=series(i=>k<8?100+i:300-i,80).map(b=>[b.t,b.c]);
 coins.stale=series(i=>100+i,80).slice(0,-3).map(b=>[b.t,b.c]);
 const b=breadthAt(coins,day+60000)!;
 expect(b).toEqual({fraction:8/12,coins:12});expect(breadthBucket(b)).toBe('>60% above 50d');
 expect(bullGate('BULL',b)).toBe('ON');expect(bullGate('TRANSITION',b)).toBe('OFF');expect(bullGate('BULL',{fraction:.4})).toBe('OFF');
 expect(breadthAt({a:coins.c0},day)).toBeNull();expect(bullGate('BULL',null)).toBe('UNAVAILABLE');
});
