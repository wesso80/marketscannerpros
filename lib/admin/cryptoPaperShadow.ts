import type {PaperExitCandle} from './portfolio-lab/paperExitPath';
const STEP=900000,H=3600000;
export const SHADOW_PLAN='partial-trail-v1' as const,SHADOW_TITLE='Crypto shadow exit plan partial-trail-v1';
/** Research-only alternative exit, replayed on the same candles as the ledger. It never changes a paper position. */
export const SHADOW_RULES={partialR:1.5,partialFraction:.5,trailAtr:2,timeStopHours:24,timeStopMinR:1};
export type ShadowLeg={fraction:number;price:number;at:string;reason:'PARTIAL_TARGET'|'STOP'|'BREAKEVEN_STOP'|'TRAIL_STOP'|'TIME_STOP'};
export type ShadowState={version:1;plan:typeof SHADOW_PLAN;positionId:string;symbol:string;instrumentType:string;entry:number;entryAt:string;stop0:number;atr:number;costRate:number;entryFeePerUnit:number;through:string;status:'OPEN'|'CLOSED'|'UNAVAILABLE';stop:number;highest:number|null;remaining:number;legs:ShadowLeg[];r:number|null;reason?:string};
export function initShadow(p:{id:string;symbol:string;instrumentType:string;averageEntry:number;openedAt:string;initialStopLoss?:number|null;quantity:number;entryFee?:number},atr:number,costRate:number):ShadowState{
 const stop0=p.initialStopLoss,entryAt=Date.parse(p.openedAt);
 const base:ShadowState={version:1,plan:SHADOW_PLAN,positionId:p.id,symbol:p.symbol,instrumentType:p.instrumentType,entry:p.averageEntry,entryAt:p.openedAt,stop0:stop0??NaN,atr,costRate,entryFeePerUnit:p.entryFee!=null&&p.quantity>0?p.entryFee/p.quantity:p.averageEntry*costRate,
  through:new Date(Math.floor(entryAt/STEP)*STEP).toISOString(),status:'OPEN',stop:stop0??NaN,highest:null,remaining:1,legs:[],r:null};
 if(stop0==null||!Number.isFinite(stop0)||stop0<=0||stop0>=p.averageEntry||!Number.isFinite(entryAt))return {...base,status:'UNAVAILABLE',reason:'Original stop or entry time unavailable'};
 if(!Number.isFinite(atr)||atr<=0)return {...base,status:'UNAVAILABLE',reason:'Signal ATR not recorded; trailing distance unknown'};
 return base;
}
/** Net result per unit after the same per-side slippage and fee estimates the ledger uses. */
function netPerUnit(s:ShadowState,price:number){const eff=price*(1-s.costRate);return eff-s.entry-s.entryFeePerUnit-eff*s.costRate;}
function close(s:ShadowState,price:number,at:number,reason:ShadowLeg['reason']):ShadowState{
 const legs=[...s.legs,{fraction:s.remaining,price,at:new Date(at).toISOString(),reason}];
 const r=legs.reduce((sum,l)=>sum+l.fraction*netPerUnit(s,l.price),0)/(s.entry-s.stop0);
 return {...s,legs,remaining:0,status:'CLOSED',r:Math.round(r*1000)/1000,through:new Date(at).toISOString()};
}
/**
 * Replays completed 15m candles from the saved checkpoint. Order inside a candle is unknown, so the stop is
 * checked first; after a same-candle partial, a breakeven touch is also charged. Trail and time-stop levels use
 * only candles already completed, so no later price is used to set an earlier exit.
 */
export function advanceShadow(state:ShadowState,candles:PaperExitCandle[],now=Date.now()):ShadowState{
 if(state.status!=='OPEN')return state;
 let s={...state,legs:[...state.legs]};
 const entryAt=Date.parse(s.entryAt),risk=s.entry-s.stop0,rules=SHADOW_RULES;
 const bars=candles.filter(b=>b.openAt>=Date.parse(s.through)&&b.closeAt<=now).sort((a,b)=>a.openAt-b.openAt);
 let expected=Date.parse(s.through);
 for(const b of bars){
  if(b.openAt!==expected||b.closeAt-b.openAt!==STEP||![b.open,b.high,b.low,b.close].every(Number.isFinite))throw Error('Shadow exit candles have a gap or invalid bar');
  const partialEntry=b.openAt<entryAt,partialDone=s.remaining<1;
  if(b.low<=s.stop){
   const price=b.open<=s.stop&&!partialEntry?b.open:s.stop;
   return close(s,price,b.closeAt,!partialDone?'STOP':s.stop>s.entry?'TRAIL_STOP':'BREAKEVEN_STOP');
  }
  if(!partialEntry){
   if(!partialDone&&b.high>=s.entry+rules.partialR*risk){
    s.legs.push({fraction:rules.partialFraction,price:s.entry+rules.partialR*risk,at:new Date(b.closeAt).toISOString(),reason:'PARTIAL_TARGET'});
    s.remaining=1-rules.partialFraction;s.stop=Math.max(s.stop,s.entry);
    if(b.low<=s.entry)return close(s,s.entry,b.closeAt,'BREAKEVEN_STOP');
   }
   s.highest=Math.max(s.highest??-Infinity,b.high);
   if(s.remaining===1&&b.closeAt>=entryAt+rules.timeStopHours*H&&s.highest<s.entry+rules.timeStopMinR*risk)return close(s,b.close,b.closeAt,'TIME_STOP');
   if(s.remaining<1)s.stop=Math.max(s.stop,s.highest-rules.trailAtr*s.atr);
  }
  expected=b.closeAt;s.through=new Date(b.closeAt).toISOString();
 }
 return s;
}
/** Persist only on a material change or daily, so the replay window stays inside the provider catch-up bound. */
export function shadowChanged(before:ShadowState,after:ShadowState){
 return before.status!==after.status||before.legs.length!==after.legs.length||before.stop!==after.stop||Date.parse(after.through)-Date.parse(before.through)>=24*H;
}
