import {expect,it} from 'vitest';
import {atmStrike} from '@/lib/options/atmStrike';
import {buildStrikeGroups,buildBestStrikes} from '@/hooks/useOptionsChain';
import type {OptionsContract} from '@/types/optionsTerminal';
it('uses nearest actual strike for rows and both ATM cards, not nearest delta',()=>{
 const rows=[{strike:335,type:'call',delta:.6},{strike:335,type:'put',delta:-.59},{strike:330,type:'call',delta:.5},{strike:330,type:'put',delta:-.5}].map(c=>({...c,bid:1,ask:1.1,openInterest:100,volume:10})) as OptionsContract[];
 expect(atmStrike([330,335],333.69)).toBe(335);expect(atmStrike([335,330],332.5)).toBe(330);expect(atmStrike([],333)).toBeNull();
 expect(buildStrikeGroups(rows,333.69).filter(r=>r.isAtm).map(r=>r.strike)).toEqual([335]);
 expect(buildBestStrikes(rows,333.69).filter(r=>r.label.startsWith('ATM')).map(r=>r.strike)).toEqual([335,335]);
});

it('does not relabel a farther quoted strike ATM when the real nearest strike is unquoted',()=>{
 const rows=[{strike:335,type:'call',delta:.5,bid:0,ask:0},{strike:330,type:'call',delta:.6,bid:1,ask:1.1}].map(c=>({...c,openInterest:100,volume:10})) as OptionsContract[];
 expect(buildBestStrikes(rows,333.69).some(c=>c.label==='ATM Call')).toBe(false);
});
