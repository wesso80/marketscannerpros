import {expect,it} from 'vitest';
import {buildIVMetrics} from '@/hooks/useOptionsChain';
import {summarizeChain} from '@/lib/goldenEgg/optionsChain';
import type {OptionsContract} from '@/types/optionsTerminal';
it('uses the same near-ATM IV and quote-date horizon as Golden Egg, with no invented IV history',()=>{
 const contracts=[{strike:335,type:'call',iv:.151,bid:1.19,ask:1.29},{strike:335,type:'put',iv:.151,bid:2.5,ask:2.62},{strike:345,type:'call',iv:.9,bid:.1,ask:.2}].map(c=>({...c,expiration:'2026-10-05',openInterest:1000,volume:100})) as OptionsContract[];
 const iv=buildIVMetrics(contracts,333.69,'2026-10-05','2026-10-02');
 const gold=summarizeChain(contracts.map(c=>({...c,implied_volatility:c.iv,open_interest:c.openInterest,date:'2026-10-02'})),333.69,{nowMs:Date.parse('2026-10-03T15:00Z')})!;
 expect(iv.avgIV).toBeCloseTo(.151);expect(iv.ivLevel).toBe('unavailable');
 expect(iv.expectedMoveAbs).toBeCloseTo(333.69*.151*Math.sqrt(3/365));
 expect(iv.expectedMoveAbs).toBeCloseTo(gold.expectedMove!,2);
 expect(iv.atmStraddleMid).toBeCloseTo(3.8);
 expect(buildIVMetrics(contracts,333.69,'2026-10-05','').expectedMoveAbs).toBe(0);
});
