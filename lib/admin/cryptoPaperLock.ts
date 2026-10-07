import {getRedis} from '@/lib/redis';
import {netR} from './cryptoExcursion';

/**
 * Shadow portfolio lock (research only; never changes a paper stop).
 * Arms once the book's open P&L has reached LOCK.armR x the per-trade risk budget. Triggers when open P&L then
 * falls LOCK.dropFromPeak (40%) from its peak. On trigger every open position gets a hypothetical tighter stop:
 *   in profit: max(breakeven, last close - 1 ATR); at a loss: last close - 1 ATR; never below the ledger stop.
 * Each locked position is then replayed on completed 15m candles (stop first, then the ledger target) until the
 * lock stop or the ledger's own exit, and its R is compared with the ledger's R. Fixed before any data was seen.
 */
export const LOCK={rule:'portfolio-lock-v1',armR:2,dropFromPeak:.4,lockAtr:1};
type Bar={openAt:number;closeAt:number;open?:number;high:number;low:number;close?:number};
export type LockPosition={positionId:string;symbol:string;instrumentType:string;entry:number;stop0:number;target:number|null;lockStop:number;costRate:number;through:number;
 status:'OPEN'|'CLOSED'|'UNAVAILABLE';lockR:number|null;ledgerR:number|null;exit?:{price:number;at:string;reason:'LOCK_STOP'|'TARGET'|'LEDGER_EXIT'};reason?:string};
export type LockEpisode={triggeredAt:string;peakOpenPnl:number;triggerOpenPnl:number;positions:LockPosition[]};
export type LockState={rule:string;bookId:string;phase:'WATCHING'|'TRIGGERED';since:string;peakOpenPnl:number;peakAt:string|null;armUsd:number;episode:LockEpisode|null;
 completed:{triggeredAt:string;positions:number;lockTotalR:number;ledgerTotalR:number}[]};
export type LockInput={positionId:string;symbol:string;instrumentType:string;entry:number;stop:number;stop0:number;target:number|null;lastClose:number|null;atr:number|null};
const round=(x:number)=>Math.round(x*1000)/1000;
export function newLockState(bookId:string,now:number,openPnl:number,armUsd:number):LockState{
 return {rule:LOCK.rule,bookId,phase:'WATCHING',since:new Date(now).toISOString(),peakOpenPnl:openPnl,peakAt:new Date(now).toISOString(),armUsd,episode:null,completed:[]};
}
/** Hypothetical lock stop for one position; null when the inputs to set it are missing (recorded, never guessed). */
export function lockStopFor(p:LockInput):number|null{
 if(p.lastClose==null||p.atr==null||!(p.atr>0)||!Number.isFinite(p.lastClose))return null;
 const tight=p.lastClose-LOCK.lockAtr*p.atr,inProfit=p.lastClose>p.entry;
 return Math.max(p.stop,inProfit?Math.max(p.entry,tight):tight);
}
/** One cycle mark: update the peak, and trigger when armed and open P&L has fallen 40% from the peak. */
export function markLock(s:LockState,now:number,openPnl:number,positions:LockInput[],costRate:(instrument:string)=>number,throughOf:(id:string)=>number):LockState{
 if(s.phase!=='WATCHING')return s;
 const next={...s};
 if(openPnl>next.peakOpenPnl){next.peakOpenPnl=openPnl;next.peakAt=new Date(now).toISOString();}
 const armed=next.peakOpenPnl>=next.armUsd;
 if(armed&&openPnl<=next.peakOpenPnl*(1-LOCK.dropFromPeak)&&positions.length){
  next.phase='TRIGGERED';
  next.episode={triggeredAt:new Date(now).toISOString(),peakOpenPnl:next.peakOpenPnl,triggerOpenPnl:openPnl,positions:positions.map(p=>{
   const lockStop=lockStopFor(p);
   return {positionId:p.positionId,symbol:p.symbol,instrumentType:p.instrumentType,entry:p.entry,stop0:p.stop0,target:p.target,lockStop:lockStop??NaN,costRate:costRate(p.instrumentType),through:throughOf(p.positionId),
    status:lockStop==null?'UNAVAILABLE':'OPEN',lockR:null,ledgerR:null,...(lockStop==null?{reason:'Last close or signal ATR unavailable; lock stop unknown'}:{})};})};
 }
 return next;
}
/** Replays completed candles from `through`: lock stop first (gap fills at the open), then the ledger target. */
export function advanceLockPosition(p:LockPosition,bars:Bar[],until:number):LockPosition{
 if(p.status!=='OPEN')return p;
 let through=p.through;
 for(const b of bars.filter(x=>x.openAt>=p.through&&x.closeAt<=until).sort((a,c)=>a.openAt-c.openAt)){
  if(b.openAt!==through)throw Error('Lock replay candles have a gap');
  if(b.low<=p.lockStop){const px=b.open!=null&&b.open<=p.lockStop?b.open:p.lockStop;
   return {...p,through:b.closeAt,status:'CLOSED',lockR:round(netR(px,p.entry,p.stop0,p.costRate)),exit:{price:px,at:new Date(b.closeAt).toISOString(),reason:'LOCK_STOP'}};}
  if(p.target!=null&&b.high>=p.target)return {...p,through:b.closeAt,status:'CLOSED',lockR:round(netR(p.target,p.entry,p.stop0,p.costRate)),exit:{price:p.target,at:new Date(b.closeAt).toISOString(),reason:'TARGET'}};
  through=b.closeAt;
 }
 return {...p,through};
}
/** The ledger closed the position while the lock had not fired: the lock would have shared the ledger's exit. */
export function settleWithLedger(p:LockPosition,ledger:{r:number|null;exitAt:number}):LockPosition{
 if(p.status==='CLOSED')return {...p,ledgerR:ledger.r};
 if(p.status==='UNAVAILABLE')return {...p,ledgerR:ledger.r};
 return {...p,status:'CLOSED',lockR:ledger.r,ledgerR:ledger.r,exit:{price:NaN,at:new Date(ledger.exitAt).toISOString(),reason:'LEDGER_EXIT'}};
}
/** When every locked position has both results, the episode is summarised and watching restarts from the current open P&L. */
export function finishEpisodeIfDone(s:LockState,now:number,openPnl:number):LockState{
 const e=s.episode;if(s.phase!=='TRIGGERED'||!e)return s;
 if(e.positions.some(p=>p.status==='OPEN'||(p.status==='CLOSED'&&p.ledgerR==null)))return s;
 const measured=e.positions.filter(p=>p.status==='CLOSED'&&p.lockR!=null&&p.ledgerR!=null);
 return {...s,phase:'WATCHING',since:new Date(now).toISOString(),peakOpenPnl:openPnl,peakAt:new Date(now).toISOString(),episode:null,
  completed:[...s.completed,{triggeredAt:e.triggeredAt,positions:measured.length,lockTotalR:round(measured.reduce((a,p)=>a+p.lockR!,0)),ledgerTotalR:round(measured.reduce((a,p)=>a+p.ledgerR!,0))}].slice(-50)};
}
const KEY=(bookId:string)=>`admin:crypto-paper:portfolio-lock:v1:${bookId}`;
export async function loadLock(bookId:string){return getRedis()?.get<LockState>(KEY(bookId)).catch(()=>null)??null;}
export async function saveLock(s:LockState){await getRedis()?.set(KEY(s.bookId),s).catch(()=>undefined);}
