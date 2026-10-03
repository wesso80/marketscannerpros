/**
 * Generic calibration arithmetic shared by the crypto and equity-news ledgers.
 * Pure: observations in, graded sides out. No provider, no Jev, no persistence.
 * Thresholds are constants; changing one is a rule change and should bump the caller's ruleVersion.
 * The crypto ledger applies MC_GUARD on top of the two-window screen before a side stays confirmed.
 * Equity news does not: it is a different family, and mixing the two confirmation rules in one sample would be dishonest.
 */
export const CAL_CORE={minSide:30,minHalf:15,minLiftR:0.25,minLiftPct:1} as const;
/**
 * Multiple-comparisons guard (mc-guard-v1) for a family on the order of 65 tested sides.
 * A side the two-window screen would confirm stays confirmed only when all three hold:
 * 1. Bonferroni: |lift| ≥ z × SE, z = Φ⁻¹(1 − α/(2m)), α = 0.05, m = sides with n ≥ minSide that were actually tested.
 * 2. Discovery window: the same screen, on the earliest 2/3 of the field only, with 10 rows per half (the full sample still required 15).
 * 3. Holdout window: the latest third, untouched by that discovery screen, has ≥10 rows of this side, the same sign of lift, and |lift| at least the confirmation floor.
 * The published halfA/halfB stay the full-sample split so a question's sample is not relabelled. The guard only removes confirmations.
 * Question text is unchanged; callers put MC_GUARD.version on the ledger and on filing keys so pre-guard confirmations are not treated as this rule.
 */
export const MC_GUARD={version:'mc-guard-v1' as const,alpha:0.05,discoveryMin:10,holdoutMin:10};
export type CalibrationStatus='collecting'|'flat'|'directional'|'confirmed'|'contradicted';
export type SideWindow={holdoutN:number;holdoutLift:number|null;discoveryConfirmed:boolean};
export type SideGuard={rule:typeof MC_GUARD.version;family:number;z:number;passed:boolean;reason:'bonferroni'|'discovery-window'|'holdout'|'passed'|null};
export type CalibrationSide={side:string;n:number;mean:number|null;lift:number|null;se:number|null;halfA:{n:number;lift:number|null};halfB:{n:number;lift:number|null};status:CalibrationStatus;informational:boolean;window?:SideWindow;guard?:SideGuard};
export type CalibrationFieldBase<Outcome extends string>={id:string;label:string;file:string;ruleVersion:string;outcome:Outcome;unit:'R'|'%';observations:number;sides:CalibrationSide[]};
export type FieldDef<O>={id:string;label:string;file:string;ruleVersion:string;side:(o:O)=>string|null};
/** Sides shown for completeness but never graded or proposed. Callers may extend. */
export const INFORMATIONAL_SIDES=new Set(['NOT_RECORDED','Jev unavailable','Catalyst unavailable']);
export const mean=(a:number[])=>a.length?a.reduce((s,n)=>s+n,0)/a.length:null;
export function se(a:number[]){
 if(a.length<2)return null;
 const m=mean(a) as number,v=a.reduce((s,n)=>s+(n-m)**2,0)/(a.length-1);
 return Math.sqrt(v/a.length);
}
const sign=(n:number|null)=>n==null?0:n>0?1:n<0?-1:0;
/** Acklam's inverse standard-normal CDF. Deterministic, no dependency. */
export function inverseNormCdf(p:number):number{
 if(!(p>0&&p<1))return p<=0?-Infinity:Infinity;
 const a=[-3.969683028665376e+01,2.209460984245205e+02,-2.759285104469687e+02,1.383577518672690e+02,-3.066479806614716e+01,2.506628277459239e+00];
 const b=[-5.447609879822406e+01,1.615858368580409e+02,-1.556989798598866e+02,6.680131188771972e+01,-1.328068155288572e+01];
 const c=[-7.784894002430293e-03,-3.223964580411365e-01,-2.400758277161838e+00,-2.549732539343734e+00,4.374664141464968e+00,2.938163982698783e+00];
 const d=[7.784695709041462e-03,3.224671290700398e-01,2.445134137142996e+00,3.754408661907416e+00];
 const plow=0.02425,phigh=1-plow;
 const tail=(q:number)=>(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
 if(p<plow)return tail(Math.sqrt(-2*Math.log(p)));
 if(p>phigh)return -tail(Math.sqrt(-2*Math.log(1-p)));
 const q=p-0.5,r=q*q;
 return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}
/** Two-sided Bonferroni critical value for `family` simultaneous tests at MC_GUARD.alpha. family is at least 1. */
export function bonferroniZ(family:number,alpha=MC_GUARD.alpha):number{
 const m=Math.max(1,Math.floor(family)||1);
 return inverseNormCdf(1-alpha/(2*m));
}
type ScreenInput={informational:boolean;n:number;lift:number|null;se:number|null;nA:number;liftA:number|null;nB:number;liftB:number|null;minSide:number;minHalf:number;minLift:number};
function screenStatus(x:ScreenInput):CalibrationStatus{
 let status:CalibrationStatus='collecting';
 if(!x.informational&&x.n>=x.minSide&&x.lift!=null){
  const halvesReady=x.nA>=x.minHalf&&x.nB>=x.minHalf;
  const opposed=halvesReady&&x.liftA!=null&&x.liftB!=null&&sign(x.liftA)!==0&&sign(x.liftB)!==0&&sign(x.liftA)!==sign(x.liftB)&&Math.abs(x.liftA)>=x.minLift&&Math.abs(x.liftB)>=x.minLift;
  if(opposed)status='contradicted';
  else if(x.se!=null&&Math.abs(x.lift)<x.se)status='flat';
  else if(!halvesReady)status='directional';
  else if(sign(x.lift)!==0&&sign(x.liftA)===sign(x.lift)&&sign(x.liftB)===sign(x.lift)&&Math.abs(x.lift)>=x.minLift)status='confirmed';
  else status='directional';
 }
 return status;
}
/**
 * One field: observations split by side, lift = side mean − overall mean, and the same lift inside each time half.
 * Confirmed needs both halves to carry at least minHalf rows and to agree on the sign of the lift. Informational sides are shown but never graded.
 * `window` is the third-window arithmetic the crypto guard reads. This function does not apply that guard.
 */
export function calibrateField<O extends {at:number},Outcome extends string>(def:FieldDef<O>,obs:O[],value:(o:O)=>number,unit:'R'|'%',outcome:Outcome,informationalSides:Set<string>=INFORMATIONAL_SIDES):CalibrationFieldBase<Outcome>{
 const tagged=obs.flatMap(o=>{const side=def.side(o);return side?[{o,side,y:value(o)}]:[];}).sort((a,b)=>a.o.at-b.o.at).map((t,i)=>({...t,i}));
 const all=tagged.map(t=>t.y),allMean=mean(all);
 const split=Math.floor(tagged.length/2);
 const halfA=tagged.slice(0,split),halfB=tagged.slice(split);
 const halfMean=(h:typeof tagged)=>mean(h.map(t=>t.y));
 const meanA=halfMean(halfA),meanB=halfMean(halfB);
 const minLift=unit==='R'?CAL_CORE.minLiftR:CAL_CORE.minLiftPct;
 const cut=Math.floor(tagged.length*2/3);
 const discovery=tagged.filter(t=>t.i<cut),holdout=tagged.filter(t=>t.i>=cut);
 const dSplit=Math.floor(discovery.length/2);
 const dPos=new Map(discovery.map((t,idx)=>[t.i,idx]));
 const dMeanA=mean(discovery.slice(0,dSplit).map(t=>t.y)),dMeanB=mean(discovery.slice(dSplit).map(t=>t.y)),dMean=mean(discovery.map(t=>t.y));
 const holdMean=mean(holdout.map(t=>t.y));
 const sides=new Map<string,typeof tagged>();
 for(const t of tagged)sides.set(t.side,[...(sides.get(t.side)??[]),t]);
 const rows:CalibrationSide[]=[...sides].map(([side,list])=>{
  const ys=list.map(t=>t.y),m=mean(ys),s=se(ys);
  const lift=m!=null&&allMean!=null?m-allMean:null;
  const inA=list.filter(t=>t.i<split),inB=list.filter(t=>t.i>=split);
  const liftA=meanA!=null&&inA.length?(mean(inA.map(t=>t.y)) as number)-meanA:null,liftB=meanB!=null&&inB.length?(mean(inB.map(t=>t.y)) as number)-meanB:null;
  const informational=informationalSides.has(side);
  const status=screenStatus({informational,n:list.length,lift,se:s,nA:inA.length,liftA,nB:inB.length,liftB,minSide:CAL_CORE.minSide,minHalf:CAL_CORE.minHalf,minLift});
  const dSide=list.filter(t=>t.i<cut);
  const dA=dSide.filter(t=>(dPos.get(t.i)??0)<dSplit),dB=dSide.filter(t=>(dPos.get(t.i)??0)>=dSplit);
  const dYs=dSide.map(t=>t.y),dLift=mean(dYs)!=null&&dMean!=null?(mean(dYs) as number)-dMean:null;
  const dLiftA=dMeanA!=null&&dA.length?(mean(dA.map(t=>t.y)) as number)-dMeanA:null,dLiftB=dMeanB!=null&&dB.length?(mean(dB.map(t=>t.y)) as number)-dMeanB:null;
  const discoveryConfirmed=screenStatus({informational,n:dSide.length,lift:dLift,se:se(dYs),nA:dA.length,liftA:dLiftA,nB:dB.length,liftB:dLiftB,minSide:MC_GUARD.discoveryMin*2,minHalf:MC_GUARD.discoveryMin,minLift})==='confirmed';
  const hSide=list.filter(t=>t.i>=cut),hMean=mean(hSide.map(t=>t.y));
  const holdoutLift=hMean!=null&&holdMean!=null?hMean-holdMean:null;
  const window:SideWindow={holdoutN:hSide.length,holdoutLift,discoveryConfirmed};
  return {side,n:list.length,mean:m,lift,se:s,halfA:{n:inA.length,lift:liftA},halfB:{n:inB.length,lift:liftB},status,informational,window};
 }).sort((a,b)=>Number(a.informational)-Number(b.informational)||b.n-a.n||a.side.localeCompare(b.side));
 return {id:def.id,label:def.label,file:def.file,ruleVersion:def.ruleVersion,outcome,unit,observations:tagged.length,sides:rows};
}
/** Sides that reached the screen: enough rows, a lift, and not informational. This is m in the Bonferroni gate. */
export function testedSideCount(fields:Array<{sides:CalibrationSide[]}>):number{
 return fields.reduce((n,f)=>n+f.sides.filter(s=>!s.informational&&s.n>=CAL_CORE.minSide&&s.lift!=null).length,0);
}
/**
 * Downgrades a screen-confirmed side that fails mc-guard-v1. Never promotes a side. Pure.
 * Missing window data fails closed: a confirmation without the third-window arithmetic does not pass.
 */
export function applyMcGuard<T extends CalibrationFieldBase<string>>(fields:T[],family=testedSideCount(fields)):T[]{
 const z=bonferroniZ(family);
 return fields.map(f=>{
  const floor=f.unit==='R'?CAL_CORE.minLiftR:CAL_CORE.minLiftPct;
  return {...f,sides:f.sides.map(s=>{
   if(s.informational||s.status!=='confirmed'||s.lift==null)return s;
   const seOk=s.se==null?false:Math.abs(s.lift)>=z*s.se-1e-9;
   const discOk=s.window?.discoveryConfirmed===true;
   const h=s.window;
   const holdOk=!!h&&h.holdoutN>=MC_GUARD.holdoutMin&&h.holdoutLift!=null&&sign(h.holdoutLift)===sign(s.lift)&&Math.abs(h.holdoutLift)>=floor;
   const passed=seOk&&discOk&&holdOk;
   const reason:SideGuard['reason']=passed?'passed':!seOk?'bonferroni':!discOk?'discovery-window':'holdout';
   const guard:SideGuard={rule:MC_GUARD.version,family,z,passed,reason};
   return passed?{...s,guard}:{...s,status:'directional' as const,guard};
  })};
 });
}
export function splitAt(obs:{at:number}[]){
 const sorted=[...obs].sort((a,b)=>a.at-b.at);const i=Math.floor(sorted.length/2);
 return sorted[i]?new Date(sorted[i].at).toISOString():null;
}
