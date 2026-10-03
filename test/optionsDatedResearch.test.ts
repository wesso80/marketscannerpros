import {expect,it} from 'vitest';
import {datedResearchCandidates,optionEntryBlocker} from '@/lib/options/decisionGate';
it('retains dated EOD research but never authorizes entry timing',()=>{
 const input={freshness:'EOD',asOf:'2026-10-02',quotedStrikes:2,hasCurrentIV:true};
 const candidates=datedResearchCandidates([{strike:335}],{date:'2026-10-05'},input);
 expect(candidates).toMatchObject({asOf:'2026-10-02',strikes:[{strike:335}],entryTiming:'Wait for live quotes'});
 expect(optionEntryBlocker({...input,hasExpiry:true})).toMatch(/timing is unverified/);
 expect(datedResearchCandidates([{strike:335}],{date:'2026-10-05'},{...input,freshness:'STALE'})).toBeNull();
 expect(datedResearchCandidates([{strike:335}],{date:'2026-10-05'},{...input,quotedStrikes:0})).toBeNull();
});
