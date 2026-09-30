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
