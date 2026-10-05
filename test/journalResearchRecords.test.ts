import {describe,it,expect} from 'vitest';
import {isResearchRecord} from '@/lib/journal/researchRecords';
import {mapJournalResponseToPayload} from '@/lib/journal/mapPayload';
import {matchesQuery} from '@/components/journal/hooks/useJournalData';
import {initialJournalQuery} from '@/components/journal/state/journalQuery';
const now=Date.parse('2026-10-05T11:00:00Z');
const own={id:1,symbol:'AAPL',side:'LONG',entryPrice:100,quantity:1,date:'2026-10-01',exitDate:'2026-10-02',exitPrice:110,pl:10,plPercent:10,rMultiple:1,isOpen:false,strategy:'manual'};
const research=[{execution_mode:'PAPER'},{executionMode:'paper'},{tags:['auto_plan_draft']},{tags:['auto_alert']},{tags:['execution_engine']},{tags:['paper_trade']},{strategy:'scanner_signal'},{strategy:'strategy_signal'},{strategy:'options_confluence_scanner'}];
describe('personal journal summaries',()=>{
 it.each(research)('classifies existing research markers %j',marker=>expect(isResearchRecord(marker)).toBe(true));
 it('retains all saved rows while excluding research from KPIs, counts, curve and review',()=>{
  const entries=[own,...research.map((marker,i)=>({...own,id:i+2,pl:10000,rMultiple:100,...marker}))];
  const payload=mapJournalResponseToPayload({entries},now);
  expect(payload.trades).toHaveLength(entries.length);
  expect(payload.kpis.realizedPnlTotal).toBe(10);
  expect(payload.kpis.realizedPnl30d).toBe(10);
  expect(payload.kpis.closedTrades30d).toBe(1);
  expect(payload.equityCurve.points).toEqual([{ts:own.exitDate,value:10}]);
  expect(payload.dockSummary.reviewQueue).toBe(0);
  expect(payload.dockModules.review.playbookExpectancy?.[0].sampleSize).toBe(1);
  expect(payload.trades.filter(row=>matchesQuery(row,initialJournalQuery))).toHaveLength(1);
  expect(payload.trades.filter(row=>matchesQuery(row,{...initialJournalQuery,research:true}))).toHaveLength(entries.length);
  expect(entries[1].pl).toBe(10000);
 });
 it('keeps personal simulated asset records without automatic markers',()=>{
  expect(isResearchRecord({strategy:'manual',tags:['paper']})).toBe(false);
  expect(initialJournalQuery).toMatchObject({research:false,pageSize:10});
 });
});
