import {expect,it} from 'vitest';
import {contractCosts,quoteSpreadPct} from '@/lib/options/contractCosts';
it('shows long contract costs, breakeven and daily decay in dollars',()=>{
 expect(contractCosts({type:'call',strike:335,bid:1.19,ask:1.29,theta:-.31},333.69)).toMatchObject({askCost:129,midCost:124,maxLoss:129,breakeven:336.29,thetaDollars:-31,spreadCost:10});
 expect(contractCosts({type:'put',strike:335,bid:1.19,ask:1.29,theta:-.31},333.69).breakeven).toBe(333.71);
});
it('does not report zero spread for missing, one-sided or crossed quotes',()=>{
 for(const [bid,ask] of [[0,0],[0,1],[2,1],[NaN,2]]) expect(quoteSpreadPct({bid,ask})).toBeNull();
 expect(quoteSpreadPct({bid:1,ask:1})).toBe(0);
});
