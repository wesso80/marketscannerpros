import {describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('@/lib/db',()=>({q:vi.fn(async()=>[])}));
import {ledgerRecords,replaySkipped,SIGNAL_LEDGER,SIGNAL_LEDGER_DDL,signalLedgerDdlStatements} from '@/lib/admin/cryptoSignalLedger';
import {SHADOW_PLANS_ACTIVE} from '@/lib/admin/cryptoPaperShadow';
const S=900000,T0=Date.UTC(2026,9,8,0);
const row=(over={})=>({id:'sol',symbol:'SOL',pair:{exchange:'gdax',product:'SOL-USD'},stage:'MOMENTUM_VOLUME',kind:'BREAKOUT',asOf:new Date(T0).toISOString(),close:100,stop:95,target:110,atr:2,entryFloor:99,maxEntry:101,trigger:99,relativeVolume:2,changePct:3,reason:'',...over}) as any;
const dec=(over={})=>({coin:'sol',product:'SOL-USD',venue:'gdax',signalAt:new Date(T0).toISOString(),checkedAt:new Date(T0+60000).toISOString(),status:'BLOCKED',reason:'20-position cap',...over}) as any;
const bar=(k:number,o:number,h:number,l:number,c:number)=>({openAt:T0+k*S,closeAt:T0+(k+1)*S,open:o,high:h,low:l,close:c});
describe('signal ledger (research only)',()=>{
 it('migration matches the code DDL',()=>{
  expect(SIGNAL_LEDGER_DDL).toBe(readFileSync('migrations/122_crypto_signal_ledger.sql','utf8'));
  expect(signalLedgerDdlStatements()).toHaveLength(2);
 });
 it('one record per signal: reasons accumulate across sleeves and cycles, TAKEN wins, duplicates of a traded signal add nothing',()=>{
  const f=()=>({btcRegime:'UP'});
  const recs=ledgerRecords([dec(),dec({sleeve:'live',reason:'5% portfolio risk cap',ask:100.2,quoteAt:new Date(T0+60000).toISOString()}),dec({reason:'Signal already traded'}),dec({coin:'eth',product:'ETH-USD',status:'OPENED',reason:'ok',sleeve:'research'})],[row(),row({id:'eth',pair:{exchange:'gdax',product:'ETH-USD'}}),row({id:'ada',pair:{exchange:'gdax',product:'ADA-USD'},stage:'EXTENDED'})],f);
  const sol=recs.find(r=>r.coin==='sol')!,eth=recs.find(r=>r.coin==='eth')!,ada=recs.find(r=>r.coin==='ada')!;
  expect(sol).toMatchObject({decision:'SKIPPED',reasons:['20-position cap','live: 5% portfolio risk cap'],quote:{ask:100.2},signal:{stop:95,atr:2},features:{btcRegime:'UP'}});
  expect(eth).toMatchObject({decision:'TAKEN',reasons:['research: opened']});
  expect(ada).toMatchObject({decision:'SKIPPED',reasons:['chase limit (EXTENDED)']});
  expect(recs).toHaveLength(3);
 });
 it('replays a skipped signal through the ledger plan and every shadow plan, from completed candles after entry only',()=>{
  const sig=row().valueOf();
  const head=[bar(0,100,100.5,99.5,100),bar(1,100,103,99.8,102.8),bar(2,102.8,112,102,111)];
  const a=replaySkipped(sig,{ask:100,at:T0},[...head,bar(3,111,999,1,500)],.0005,T0+3*S) as any;
  const b=replaySkipped(sig,{ask:100,at:T0},[...head,bar(3,111,90,80,85)],.0005,T0+3*S) as any;
  expect(a.status).toBe('RESOLVED');expect(a).toEqual(b); // bar 3 is after the horizon: never used
  expect(a.fixed2r).toMatchObject({status:'CLOSED',exit:'TAKE_PROFIT'});
  expect(Object.keys(a.plans)).toEqual([...SHADOW_PLANS_ACTIVE]);
  expect(a.entry.inZone).toBe(true);
  // A chase-limited quote above maxEntry still replays (zone bypassed), and records that the zone failed.
  const chased=replaySkipped(sig,{ask:104,at:T0},head,.0005,T0+3*S) as any;
  expect(chased.status).toBe('RESOLVED');expect(chased.entry.inZone).toBe(false);
 });
 it('resolves skipped signals only after the horizon, a few per run',()=>{
  expect(SIGNAL_LEDGER).toMatchObject({horizonDays:6,resolvePerRun:6});
 });
});
