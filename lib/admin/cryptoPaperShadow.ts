import type {PaperExitCandle} from './portfolio-lab/paperExitPath';
const STEP=900000,H=3600000,F=4*H;
/** Default plan for single-plan callers; earlier states keep the rules they started with. v1/v2 share a legacy journal title. */
export const SHADOW_PLAN='partial-trail-v2' as const,SHADOW_TITLE='Crypto shadow exit plan partial-trail-v1';
export type ShadowPlan='partial-trail-v1'|'partial-trail-v2'|'failed-breakout-trail-v3'|'trail-only-v4';
/** Plans replayed on every open position. Each is stored under its own journal title so rule versions never mix. */
export const SHADOW_PLANS_ACTIVE:readonly ShadowPlan[]=['partial-trail-v2','failed-breakout-trail-v3','trail-only-v4'];
export const shadowTitle=(plan:ShadowPlan)=>plan==='partial-trail-v1'||plan==='partial-trail-v2'?SHADOW_TITLE:`Crypto shadow exit plan ${plan}`;
export const SHADOW_TITLES=[...new Set(SHADOW_PLANS_ACTIVE.map(shadowTitle))];
export type ShadowRules={partialR:number|null;partialFraction:number;trailAtr:number;trailFromStart:boolean;failedBreakoutExit:boolean;timeStopHours:number;timeStopMinR:number};
/**
 * Research-only alternative exits, replayed on the same candles as the ledger. They never change a paper position.
 * v2: half at +1.5R, breakeven, 2-ATR trail on the rest, 72h time stop (18 completed 4h candles) if +1R never reached.
 * v3: v2 plus a failed-breakout exit: the first completed 4h candle after entry that closes below the signal's entry
 *     floor (breakout trigger or prior high) closes the remainder at that close. Tests whether cutting failed
 *     breakouts early beats holding to the structural stop.
 * v4: no partial; the whole position trails 2 ATR below the highest completed high from entry, same 72h time stop.
 *     Tests whether the fixed 2R target (and the v2 partial) give up the momentum tail.
 * Rules are fixed a priori from the 4h timeframe, not fitted to results.
 */
export const SHADOW_RULES_BY_PLAN:Record<ShadowPlan,ShadowRules>={
 'partial-trail-v1':{partialR:1.5,partialFraction:.5,trailAtr:2,trailFromStart:false,failedBreakoutExit:false,timeStopHours:24,timeStopMinR:1},
 'partial-trail-v2':{partialR:1.5,partialFraction:.5,trailAtr:2,trailFromStart:false,failedBreakoutExit:false,timeStopHours:72,timeStopMinR:1},
 'failed-breakout-trail-v3':{partialR:1.5,partialFraction:.5,trailAtr:2,trailFromStart:false,failedBreakoutExit:true,timeStopHours:72,timeStopMinR:1},
 'trail-only-v4':{partialR:null,partialFraction:0,trailAtr:2,trailFromStart:true,failedBreakoutExit:false,timeStopHours:72,timeStopMinR:1},
};
export const SHADOW_RULES=SHADOW_RULES_BY_PLAN[SHADOW_PLAN];
export type ShadowLeg={fraction:number;price:number;at:string;reason:'PARTIAL_TARGET'|'STOP'|'BREAKEVEN_STOP'|'TRAIL_STOP'|'TIME_STOP'|'FAILED_BREAKOUT'|'HORIZON'};
export type ShadowState={version:1;plan:ShadowPlan;positionId:string;symbol:string;instrumentType:string;entry:number;entryAt:string;stop0:number;atr:number;entryFloor?:number|null;costRate:number;entryFeePerUnit:number;through:string;status:'OPEN'|'CLOSED'|'UNAVAILABLE';stop:number;highest:number|null;remaining:number;legs:ShadowLeg[];r:number|null;reason?:string};
export function initShadow(p:{id:string;symbol:string;instrumentType:string;averageEntry:number;openedAt:string;initialStopLoss?:number|null;quantity:number;entryFee?:number},atr:number,costRate:number,plan:ShadowPlan=SHADOW_PLAN,entryFloor?:number|null):ShadowState{
 const stop0=p.initialStopLoss,entryAt=Date.parse(p.openedAt);
 const base:ShadowState={version:1,plan,positionId:p.id,symbol:p.symbol,instrumentType:p.instrumentType,entry:p.averageEntry,entryAt:p.openedAt,stop0:stop0??NaN,atr,entryFloor:entryFloor??null,costRate,entryFeePerUnit:p.entryFee!=null&&p.quantity>0?p.entryFee/p.quantity:p.averageEntry*costRate,
  through:new Date(Math.floor(entryAt/STEP)*STEP).toISOString(),status:'OPEN',stop:stop0??NaN,highest:null,remaining:1,legs:[],r:null};
 if(stop0==null||!Number.isFinite(stop0)||stop0<=0||stop0>=p.averageEntry||!Number.isFinite(entryAt))return {...base,status:'UNAVAILABLE',reason:'Original stop or entry time unavailable'};
 if(!Number.isFinite(atr)||atr<=0)return {...base,status:'UNAVAILABLE',reason:'Signal ATR not recorded; trailing distance unknown'};
 if(SHADOW_RULES_BY_PLAN[plan].failedBreakoutExit&&!(typeof entryFloor==='number'&&Number.isFinite(entryFloor)&&entryFloor>0))return {...base,status:'UNAVAILABLE',reason:'Signal entry floor not recorded; failed-breakout level unknown'};
 return base;
}
/** Net result per unit after the same per-side slippage and fee estimates the ledger uses. */
function netPerUnit(s:ShadowState,price:number){const eff=price*(1-s.costRate);return eff-s.entry-s.entryFeePerUnit-eff*s.costRate;}
function close(s:ShadowState,price:number,at:number,reason:ShadowLeg['reason']):ShadowState{
 const legs=[...s.legs,{fraction:s.remaining,price,at:new Date(at).toISOString(),reason}];
 const r=legs.reduce((sum,l)=>sum+l.fraction*netPerUnit(s,l.price),0)/(s.entry-s.stop0);
 return {...s,legs,remaining:0,status:'CLOSED',r:Math.round(r*1000)/1000,through:new Date(at).toISOString()};
}
/** Backtest only: marks a still-open remainder at a completed candle close so long-running winners are not dropped. */
export function closeShadowAt(s:ShadowState,price:number,at:number):ShadowState{return s.status==='OPEN'?close(s,price,at,'HORIZON'):s;}
/**
 * Replays completed 15m candles from the saved checkpoint. Order inside a candle is unknown, so the stop is
 * checked first; after a same-candle partial, a breakeven touch is also charged. Trail and time-stop levels use
 * only candles already completed, so no later price is used to set an earlier exit.
 */
export function advanceShadow(state:ShadowState,candles:PaperExitCandle[],now=Date.now()):ShadowState{
 if(state.status!=='OPEN')return state;
 let s={...state,legs:[...state.legs]};
 const entryAt=Date.parse(s.entryAt),risk=s.entry-s.stop0,rules=SHADOW_RULES_BY_PLAN[s.plan]??SHADOW_RULES_BY_PLAN['partial-trail-v1'];
 const bars=candles.filter(b=>b.openAt>=Date.parse(s.through)&&b.closeAt<=now).sort((a,b)=>a.openAt-b.openAt);
 let expected=Date.parse(s.through);
 for(const b of bars){
  if(b.openAt!==expected||b.closeAt-b.openAt!==STEP||![b.open,b.high,b.low,b.close].every(Number.isFinite))throw Error('Shadow exit candles have a gap or invalid bar');
  const partialEntry=b.openAt<entryAt,partialDone=s.remaining<1;
  if(b.low<=s.stop){
   const price=b.open<=s.stop&&!partialEntry?b.open:s.stop;
   return close(s,price,b.closeAt,s.stop>s.entry?'TRAIL_STOP':partialDone&&s.stop===s.entry?'BREAKEVEN_STOP':s.stop>s.stop0?'TRAIL_STOP':'STOP');
  }
  if(!partialEntry){
   if(rules.partialR!=null&&!partialDone&&b.high>=s.entry+rules.partialR*risk){
    s.legs.push({fraction:rules.partialFraction,price:s.entry+rules.partialR*risk,at:new Date(b.closeAt).toISOString(),reason:'PARTIAL_TARGET'});
    s.remaining=1-rules.partialFraction;s.stop=Math.max(s.stop,s.entry);
    if(b.low<=s.entry)return close(s,s.entry,b.closeAt,'BREAKEVEN_STOP');
   }
   s.highest=Math.max(s.highest??-Infinity,b.high);
   if(s.remaining===1&&b.closeAt>=entryAt+rules.timeStopHours*H&&s.highest<s.entry+rules.timeStopMinR*risk)return close(s,b.close,b.closeAt,'TIME_STOP');
   // Failed breakout: a completed 4h candle that began after entry closes below the signal's entry floor.
   if(rules.failedBreakoutExit&&s.entryFloor!=null&&b.closeAt%F===0&&b.closeAt-F>=entryAt&&b.close<s.entryFloor)return close(s,b.close,b.closeAt,'FAILED_BREAKOUT');
   if(s.remaining<1||rules.trailFromStart)s.stop=Math.max(s.stop,s.highest-rules.trailAtr*s.atr);
  }
  expected=b.closeAt;s.through=new Date(b.closeAt).toISOString();
 }
 return s;
}
/** Persist only on a material change or daily, so the replay window stays inside the provider catch-up bound. */
export function shadowChanged(before:ShadowState,after:ShadowState){
 return before.status!==after.status||before.legs.length!==after.legs.length||before.stop!==after.stop||Date.parse(after.through)-Date.parse(before.through)>=24*H;
}
