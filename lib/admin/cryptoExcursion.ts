/**
 * Maximum favourable / adverse excursion (MFE / MAE) in R, research only. Never changes a position.
 *
 * Point-in-time rules (completed candles only):
 * - A bar counts only once it has closed (closeAt <= until).
 * - A bar that opened before the entry (the fill candle): its LOW counts for MAE (conservative), its HIGH does not
 *   count for MFE, because that high may predate the fill.
 * - Exit inside a bar (stop/target touched intrabar): that bar's high/low are excluded, because their order relative
 *   to the exit is unknown; the exit price itself is included. A marked exit at a completed close keeps the whole bar.
 * - R is net of the same per-side cost used by the ledger, "as if exited at that price": MFE and final R are then
 *   on the same basis, so give-back is not inflated by costs.
 */
export type ExcursionBar={openAt:number;closeAt:number;high:number;low:number};
export type ExcursionState={fill:number;stop:number;cost:number;entryAt:number;through:number;high:number|null;low:number|null;highAt:number|null;lowAt:number|null};
export const EXCURSION_RULE='excursion-v1';
/** Paper exit reasons that fill inside a candle (that candle's extremes are excluded). TIME_EXIT fills at a completed close. */
export const INTRABAR_PAPER_EXITS=new Set(['STOP_LOSS','TAKE_PROFIT','RULE_EXIT']);
/** Net R if exited at `price`: exit slippage and fee on the exit leg, entry fee on the fill (same model as the ledger). */
export function netR(price:number,fill:number,stop:number,cost:number){const eff=price*(1-cost);return (eff-fill-fill*cost-eff*cost)/(fill-stop);}
export function startExcursion(fill:number,stop:number,cost:number,entryAt:number,step:number):ExcursionState|null{
 if(![fill,stop,cost,entryAt].every(Number.isFinite)||stop<=0||stop>=fill||cost<0)return null;
 return {fill,stop,cost,entryAt,through:Math.floor(entryAt/step)*step,high:null,low:null,highAt:null,lowAt:null};
}
const addHigh=(s:ExcursionState,p:number,at:number)=>{if(s.high==null||p>s.high){s.high=p;s.highAt=at;}};
const addLow=(s:ExcursionState,p:number,at:number)=>{if(s.low==null||p<s.low){s.low=p;s.lowAt=at;}};
/**
 * Consumes completed bars from `through` up to `until`. Bars must be contiguous from `through`; a gap throws so the
 * caller can refetch or mark the trade unavailable (never skipped, which could hide an extreme).
 */
/**
 * allowGaps: for exchange history where a missing candle means no trades in that interval (backtests), so no price
 * existed to record. Live paper paths are gap-filled and validated first, so they keep the strict default.
 */
export function advanceExcursion(state:ExcursionState,bars:ExcursionBar[],until:number,exit?:{price:number;at:number;insideBar:boolean},opts:{allowGaps?:boolean}={}):ExcursionState{
 const s={...state};
 const end=exit?exit.at:until;
 const use=bars.filter(b=>b.openAt>=s.through).sort((a,b)=>a.openAt-b.openAt);
 for(const b of use){
  if(b.closeAt>until)break;
  if(exit&&(exit.insideBar?b.closeAt>=exit.at:b.closeAt>exit.at))break;
  if(b.closeAt>end)break;
  if(b.openAt!==s.through&&!(opts.allowGaps&&b.openAt>s.through))throw Error('Excursion candles have a gap');
  if(![b.high,b.low].every(Number.isFinite)||b.low<=0||b.high<b.low)throw Error('Excursion candle invalid');
  addLow(s,b.low,b.closeAt);
  if(b.openAt>=s.entryAt)addHigh(s,b.high,b.closeAt);
  s.through=b.closeAt;
 }
 if(exit){addHigh(s,exit.price,exit.at);addLow(s,exit.price,exit.at);}
 return s;
}
export function excursionR(s:ExcursionState){
 return {mfeR:s.high==null?null:round(netR(s.high,s.fill,s.stop,s.cost)),maeR:s.low==null?null:round(netR(s.low,s.fill,s.stop,s.cost))};
}
/**
 * Give-back = (MFE - final R) / MFE. Undefined (null) when the trade never showed a net profit (MFE <= 0).
 * Values above 1 mean the trade ended below breakeven after having been in profit.
 */
export function giveBack(mfeR:number|null|undefined,finalR:number|null|undefined){
 if(mfeR==null||finalR==null||!Number.isFinite(mfeR)||!Number.isFinite(finalR)||mfeR<=0)return null;
 return round((mfeR-finalR)/mfeR);
}
const round=(x:number)=>Math.round(x*1000)/1000;
/** Averages for stats. The ratio mean is over trades that reached +1R (small MFEs make the ratio explode); the median uses every trade with MFE > 0. */
export function giveBackSummary(rows:{mfeR:number|null;maeR:number|null;finalR:number|null}[]){
 const withX=rows.filter(r=>r.mfeR!=null&&r.maeR!=null);
 const mean=(a:number[])=>a.length?round(a.reduce((s,x)=>s+x,0)/a.length):null;
 const ratios=withX.map(r=>({g:giveBack(r.mfeR,r.finalR),mfe:r.mfeR!})).filter((x):x is {g:number;mfe:number}=>x.g!=null);
 const med=(a:number[])=>{if(!a.length)return null;const s=[...a].sort((x,y)=>x-y),m=Math.floor(s.length/2);return round(s.length%2?s[m]:(s[m-1]+s[m])/2);};
 const closed=withX.filter(r=>r.finalR!=null);
 return {trades:withX.length,avgMfeR:mean(withX.map(r=>r.mfeR!)),avgMaeR:mean(withX.map(r=>r.maeR!)),
  avgGiveBackR:mean(closed.filter(r=>r.mfeR!>0).map(r=>r.mfeR!-r.finalR!)),
  medianGiveBack:med(ratios.map(x=>x.g)),avgGiveBackReached1R:mean(ratios.filter(x=>x.mfe>=1).map(x=>x.g)),reached1R:ratios.filter(x=>x.mfe>=1).length};
}
export type GiveBackSummary=ReturnType<typeof giveBackSummary>;
/** Book level: sum of each open position's peak net profit (from its MFE) vs its current open P&L. */
export function bookGiveBack(rows:{peakUsd:number|null;currentUsd:number}[]){
 const peak=rows.reduce((s,r)=>s+Math.max(0,r.peakUsd??0),0),current=rows.reduce((s,r)=>s+r.currentUsd,0);
 return {peakOpenProfitUsd:round(peak),currentOpenPnlUsd:round(current),givenBackUsd:round(peak-current),givenBackPct:peak>0?round((peak-current)/peak):null};
}
/** Running peak of a series of book marks, and the current distance from it. */
export function peakDistance(marks:{at:string;value:number}[]){
 let peak:{at:string;value:number}|null=null;for(const m of marks)if(Number.isFinite(m.value)&&(!peak||m.value>peak.value))peak=m;
 const last=marks.at(-1)??null;
 return {peak,last,fromPeak:peak&&last?round(last.value-peak.value):null,fromPeakPct:peak&&last&&peak.value>0?round((peak.value-last.value)/peak.value):null};
}
