import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({q:vi.fn()}));
vi.mock('@/lib/db',()=>({q:mocks.q}));vi.mock('@/lib/admin/errorResponse',()=>({adminErrorText:vi.fn()}));
import {journalExpectancyFromRows,loadJournalExpectancy} from '@/lib/admin/journalExpectancy';
beforeEach(()=>{mocks.q.mockReset();});
it('preserves all closed counts while requiring valid R for ranked groups',()=>{
 const data=journalExpectancyFromRows([{kind:'overall',sample:100,valid_r_count:2,missing_r_count:98},{kind:'symbol',key:'A',sample:99,valid_r_count:1,avg_r:5},{kind:'symbol',key:'B',sample:2,valid_r_count:2,avg_r:0,total_r:0,wins:0,r_multiple_count:1,dynamic_r_count:1}]);
 expect(data.sampleTrades).toBe(100);expect(data.validRCount).toBe(2);expect(data.bestSymbols.map(x=>x.key)).toEqual(['B']);expect(data.bestSymbols[0]).toMatchObject({avgR:0,winRate:0,sourceCounts:{rMultiple:1,dynamicR:1,normalizedR:0}});
});
it('orders all groups before taking four and keeps uncapped overall totals',()=>{
 const data=journalExpectancyFromRows([{kind:'overall',sample:100,valid_r_count:100},...Array.from({length:50},(_,i)=>({kind:'symbol',key:String(i),sample:2,valid_r_count:2,avg_r:i,total_r:2*i}))]);
 expect(data.bestSymbols[0].key).toBe('49');expect(data.weakestSymbols[0].key).toBe('0');expect(data.bestSymbols).toHaveLength(4);expect(data.sampleTrades).toBe(100);
});
it('distinguishes an empty successful read from failure and absent workspace',async()=>{
 mocks.q.mockResolvedValue([{kind:'overall',sample:0,valid_r_count:0}]);expect(await loadJournalExpectancy('owner')).toMatchObject({status:'available',sampleTrades:0,validRCount:0});
 mocks.q.mockRejectedValue(new Error('secret'));const failed=await loadJournalExpectancy('owner');expect(failed).toMatchObject({status:'unavailable',sampleTrades:null,validRCount:null});expect(JSON.stringify(failed)).not.toContain('secret');
 mocks.q.mockClear();expect((await loadJournalExpectancy(null)).status).toBe('unavailable');expect(mocks.q).not.toHaveBeenCalled();
});
it('does not turn malformed aggregate output into zero history',()=>{expect(journalExpectancyFromRows([]).status).toBe('unavailable');});
