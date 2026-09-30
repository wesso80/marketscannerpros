import {it,expect} from 'vitest';

import {fillTrailingNoTrade} from '@/lib/admin/cryptoCandleGaps';
it('fills trailing no-trade candles only with a fresh quote and only up to 2 hours; otherwise fails closed',()=>{
 const S=900000,end=Date.UTC(2026,8,30,12),c=(k:number,px:number)=>({openAt:end-k*S-S,closeAt:end-k*S,open:px,high:px+1,low:px-1,close:px});
 const r=fillTrailingNoTrade([c(3,10),c(2,11)],end,true);
 expect(r.filled).toBe(2);expect(r.candles.slice(-2)).toEqual([{openAt:end-2*S,closeAt:end-S,open:11,high:11,low:11,close:11},{openAt:end-S,closeAt:end,open:11,high:11,low:11,close:11}]);
 expect(fillTrailingNoTrade([c(2,11)],end,false).filled).toBe(0);
 expect(fillTrailingNoTrade([c(9,11)],end,true).filled).toBe(0);
 expect(fillTrailingNoTrade([c(8,11)],end,true).filled).toBe(8);
 expect(fillTrailingNoTrade([c(0,11)],end,true).filled).toBe(0);
 expect(fillTrailingNoTrade([],end,true).filled).toBe(0);
});
it('keeps filling on consecutive quiet cycles from the last REAL candle, still capped at 2 hours from that trade',()=>{
 const S=900000,end=Date.UTC(2026,8,30,12);
 // Previous cycle filled through end-S; the last real trade candle closed at end-3S. No trades since.
 const r=fillTrailingNoTrade([],end,true,S,undefined,{closeAt:end-3*S,close:7,from:end-S});
 expect(r.filled).toBe(1);expect(r.candles).toEqual([{openAt:end-S,closeAt:end,open:7,high:7,low:7,close:7}]);
 expect(fillTrailingNoTrade([],end,false,S,undefined,{closeAt:end-3*S,close:7,from:end-S}).filled).toBe(0);
 expect(fillTrailingNoTrade([],end,true,S,undefined,{closeAt:end-9*S,close:7,from:end-S}).filled).toBe(0);
 expect(fillTrailingNoTrade([],end,true,S,undefined,{closeAt:end-8*S,close:7,from:end-2*S}).filled).toBe(2);
 expect(fillTrailingNoTrade([],end,true,S,undefined,{closeAt:end-3*S,close:7,from:end}).filled).toBe(0);
});
