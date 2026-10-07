import {describe,expect,it} from 'vitest';
import {LOCK,newLockState,lockStopFor,markLock,advanceLockPosition,settleWithLedger,finishEpisodeIfDone} from '@/lib/admin/cryptoPaperLock';
const S=900000,T0=Date.UTC(2026,9,8);
const inp=(over={})=>({positionId:'a',symbol:'sol',instrumentType:'coinbase:SOL-USD',entry:100,stop:95,stop0:95,target:110,lastClose:106,atr:2,...over});
const bar=(k:number,o:number,h:number,l:number,c:number)=>({openAt:T0+k*S,closeAt:T0+(k+1)*S,open:o,high:h,low:l,close:c});
describe('shadow portfolio lock (portfolio-lock-v1)',()=>{
 it('fixed rules: arm at +2R of per-trade risk, trigger on a 40% fall from peak, tighten by 1 ATR',()=>{
  expect(LOCK).toEqual({rule:'portfolio-lock-v1',armR:2,dropFromPeak:.4,lockAtr:1});
 });
 it('lock stop: max(breakeven, close - 1 ATR) in profit; close - 1 ATR at a loss; never below the ledger stop; unknown without ATR',()=>{
  expect(lockStopFor(inp({lastClose:106}))).toBe(104);
  expect(lockStopFor(inp({lastClose:101}))).toBe(100);
  expect(lockStopFor(inp({lastClose:98}))).toBe(96);
  expect(lockStopFor(inp({lastClose:96}))).toBe(95);
  expect(lockStopFor(inp({atr:null}))).toBeNull();
 });
 it('does not trigger before arming, then triggers once open P&L falls 40% from the armed peak',()=>{
  let s=newLockState('b',T0,0,100);
  s=markLock(s,T0,90,[inp()],()=>0,()=>T0);expect(s.phase).toBe('WATCHING'); // peak 90 < arm 100
  s=markLock(s,T0+S,50,[inp()],()=>0,()=>T0);expect(s.phase).toBe('WATCHING'); // not armed, no trigger
  s=markLock(s,T0+2*S,200,[inp()],()=>0,()=>T0);expect(s.peakOpenPnl).toBe(200);
  s=markLock(s,T0+3*S,121,[inp()],()=>0,()=>T0);expect(s.phase).toBe('WATCHING'); // 39.5% below
  s=markLock(s,T0+4*S,120,[inp(),inp({positionId:'b',atr:null})],()=>0,()=>T0+4*S);
  expect(s.phase).toBe('TRIGGERED');
  expect(s.episode!.positions.map(p=>[p.positionId,p.status,p.lockStop])).toEqual([['a','OPEN',104],['b','UNAVAILABLE',NaN]]);
 });
 it('replays stop first, settles with the ledger, and summarises the episode only when every result is known',()=>{
  let s=markLock(newLockState('b',T0,0,10),T0,100,[inp()],()=>0,()=>T0);
  s=markLock(s,T0+S,60,[inp()],()=>0,()=>T0+S);
  let p=s.episode!.positions[0];
  p=advanceLockPosition(p,[bar(1,105,107,104.5,106),bar(2,106,108,103,104),bar(3,104,200,1,100)],T0+10*S);
  expect(p).toMatchObject({status:'CLOSED',exit:{reason:'LOCK_STOP',price:104}}); // bar 3 never seen
  expect(p.lockR).toBeCloseTo(.8,3);
  s=finishEpisodeIfDone({...s,episode:{...s.episode!,positions:[p]}},T0+3*S,10);
  expect(s.phase).toBe('TRIGGERED'); // waiting for the ledger result
  p=settleWithLedger(p,{r:-1,exitAt:T0+20*S});
  s=finishEpisodeIfDone({...s,episode:{...s.episode!,positions:[p]}},T0+21*S,10);
  expect(s.phase).toBe('WATCHING');
  expect(s.completed).toEqual([{triggeredAt:new Date(T0+S).toISOString(),positions:1,lockTotalR:.8,ledgerTotalR:-1}]);
  // A lock that never fired shares the ledger exit.
  const q=settleWithLedger({...p,status:'OPEN',lockR:null,ledgerR:null,exit:undefined},{r:2,exitAt:T0});
  expect(q).toMatchObject({status:'CLOSED',lockR:2,ledgerR:2,exit:{reason:'LEDGER_EXIT'}});
 });
 it('fails on a candle gap instead of skipping a possible stop',()=>{
  const s=markLock(markLock(newLockState('b',T0,0,10),T0,100,[inp()],()=>0,()=>T0),T0+S,60,[inp()],()=>0,()=>T0+S);
  expect(()=>advanceLockPosition(s.episode!.positions[0],[bar(3,105,106,104.5,105)],T0+10*S)).toThrow('gap');
 });
});
