import {expect,it} from 'vitest';
import {chainQuality,quoteDateLabel} from '@/lib/options/quoteQuality';
it('grades realtime near-money quotes, excluding unquoted distant wings',()=>{
 const contracts=[...Array.from({length:20},(_,i)=>({strike:95+i/2,bid:1,ask:1.02})),...Array.from({length:100},()=>({strike:200,bid:0,ask:0}))];
 expect(chainQuality(contracts,100,'realtime','2026-10-02',Date.parse('2026-10-02T16:00Z'))).toMatchObject({coverage:100,tightShare:100,degraded:false,stale:false});
 expect(chainQuality(contracts,100,'previous_session','2026-10-02',Date.parse('2026-10-03T16:00Z')).degraded).toBe(true);
 expect(quoteDateLabel('previous_session','2026-10-02')).toBe('last session (Fri 2 Oct)');
 expect(chainQuality(contracts,100,'previous_session','2026-09-25',Date.parse('2026-10-03T16:00Z')).stale).toBe(true);
});
