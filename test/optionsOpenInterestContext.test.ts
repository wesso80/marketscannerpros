import {expect,it} from 'vitest';
import {oiContextContracts,buildOIHeatmap} from '@/hooks/useOptionsChain';
import type {OptionsContract,StrikeGroup} from '@/types/optionsTerminal';
it('uses quoted contracts in the same spot-centred window and retains fractional strikes',()=>{
 const rows=[{strike:337.5,type:'call',bid:1,ask:1.1,openInterest:100},{strike:330,type:'call',bid:0,ask:1,openInterest:99999},{strike:700,type:'call',bid:1,ask:1.1,openInterest:999999}] as OptionsContract[];
 const selected=oiContextContracts(rows,335,5);expect(selected.map(c=>c.strike)).toEqual([337.5]);
 const map=buildOIHeatmap(rows.map(c=>({strike:c.strike,call:c} as StrikeGroup)));
 expect(map.find(r=>r.strike===330)).toBeUndefined();expect(map.find(r=>r.strike===337.5)?.callOI).toBe(100);
});
