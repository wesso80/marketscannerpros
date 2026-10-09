import {describe,expect,it} from 'vitest';
import {computeBreakdowns,type BreakdownRow} from '@/lib/admin/modelBreakdowns';
describe('admin outcome breakdowns',()=>{
 const rows:BreakdownRow[]=[
  {score:80,outcome:'correct',asset_type:'crypto',timeframe:'4h',regime:'TREND_UP',signal_at:'2026-10-02T00:00:00Z'},
  {score:65,outcome:'wrong',asset_type:'CRYPTO',timeframe:'1d',regime:'RANGE',signal_at:'2026-10-01T00:00:00Z'},
  {score:65,outcome:'neutral',asset_type:'equities',timeframe:'1d',regime:'RANGE',signal_at:'2026-10-03T00:00:00Z'},
  {score:0,outcome:'pending',asset_type:'equity',timeframe:null,regime:null,signal_at:'invalid'},
  {score:50,outcome:'expired',asset_type:null},
  {score:50,outcome:null,asset_type:'crypto'},
 ];
 it('partitions the same cohort once per dimension and reconciles every outcome',()=>{
  const result=computeBreakdowns(rows);
  for(const groups of Object.values(result)){
   expect(groups.reduce((n,g)=>n+g.signals,0)).toBe(rows.length);
   expect(groups.reduce((n,g)=>n+g.labelled,0)).toBe(2);
   for(const g of groups)expect(g.wins+g.losses+g.neutral+g.pending+g.expired+g.excludedOrUnknown+g.excludedScores).toBe(g.signals);
  }
  expect(result.asset.map(g=>g.name)).toEqual(['Crypto','Equities','Not recorded']);
  expect(result.asset[0]).toMatchObject({signals:3,labelled:2,wins:1,losses:1,hitRate:50,excludedOrUnknown:1});
  expect(result.asset[1]).toMatchObject({signals:2,labelled:0,hitRate:null,neutral:1,pending:1,undatedSignals:1});
 });
 it('uses actual earliest/latest dates and preserves missing classifications',()=>{
  const result=computeBreakdowns(rows);
  expect(result.asset[0]).toMatchObject({sampleFrom:'2026-10-01T00:00:00.000Z',sampleTo:'2026-10-02T00:00:00.000Z',undatedSignals:1});
  expect(result.timeframe.find(g=>g.name==='Not recorded')?.signals).toBe(3);
  expect(result.regime.find(g=>g.name==='Not recorded')?.signals).toBe(3);
 });
 it('weights the hit rate by outcomes, not by score-band rates',()=>{
  const result=computeBreakdowns([{score:80,outcome:'correct'},...Array.from({length:9},()=>({score:65,outcome:'wrong'}))]);
  expect(result.asset[0].hitRate).toBe(10);
 });
 it('flags small labelled samples despite many pending rows and explicitly accounts for excluded scores',()=>{
  const result=computeBreakdowns([{score:null,outcome:'correct'},{score:120,outcome:'wrong'},
   ...Array.from({length:30},()=>({score:80,outcome:'pending'})),{score:80,outcome:'correct'}]);
  expect(result.asset[0]).toMatchObject({signals:33,labelled:1,pending:30,excludedScores:2,smallSample:true});
 });
 it('returns empty partitions for empty data and lifts the small-sample flag at the shared threshold',()=>{
  expect(computeBreakdowns([])).toEqual({asset:[],timeframe:[],regime:[]});
  expect(computeBreakdowns(Array.from({length:20},()=>({score:65,outcome:'correct'}))).asset[0].smallSample).toBe(false);
 });
});
