/**
 * Generic calibration arithmetic shared by the crypto and equity-news ledgers.
 * Pure: observations in, graded sides out. No provider, no Jev, no persistence.
 * Thresholds are constants; changing one is a rule change and should bump the caller's ruleVersion.
 */
export const CAL_CORE={minSide:30,minHalf:15,minLiftR:0.25,minLiftPct:1} as const;
export type CalibrationStatus='collecting'|'flat'|'directional'|'confirmed'|'contradicted';
export type CalibrationSide={side:string;n:number;mean:number|null;lift:number|null;se:number|null;halfA:{n:number;lift:number|null};halfB:{n:number;lift:number|null};status:CalibrationStatus;informational:boolean};
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
/**
 * One field: observations split by side, lift = side mean − overall mean, and the same lift inside each time half.
 * Confirmed needs both halves to carry at least minHalf rows and to agree on the sign of the lift. Informational sides are shown but never graded.
 */
export function calibrateField<O extends {at:number},Outcome extends string>(def:FieldDef<O>,obs:O[],value:(o:O)=>number,unit:'R'|'%',outcome:Outcome,informationalSides:Set<string>=INFORMATIONAL_SIDES):CalibrationFieldBase<Outcome>{
 const tagged=obs.flatMap(o=>{const side=def.side(o);return side?[{o,side,y:value(o)}]:[];}).sort((a,b)=>a.o.at-b.o.at).map((t,i)=>({...t,i}));
 const all=tagged.map(t=>t.y),allMean=mean(all);
 const split=Math.floor(tagged.length/2);
 const halfA=tagged.slice(0,split),halfB=tagged.slice(split);
 const halfMean=(h:typeof tagged)=>mean(h.map(t=>t.y));
 const meanA=halfMean(halfA),meanB=halfMean(halfB);
 const minLift=unit==='R'?CAL_CORE.minLiftR:CAL_CORE.minLiftPct;
 const sides=new Map<string,typeof tagged>();
 for(const t of tagged)sides.set(t.side,[...(sides.get(t.side)??[]),t]);
 const rows:CalibrationSide[]=[...sides].map(([side,list])=>{
  const ys=list.map(t=>t.y),m=mean(ys),s=se(ys);
  const lift=m!=null&&allMean!=null?m-allMean:null;
  const inA=list.filter(t=>t.i<split),inB=list.filter(t=>t.i>=split);
  const liftA=meanA!=null&&inA.length?(mean(inA.map(t=>t.y)) as number)-meanA:null,liftB=meanB!=null&&inB.length?(mean(inB.map(t=>t.y)) as number)-meanB:null;
  const informational=informationalSides.has(side);
  let status:CalibrationStatus='collecting';
  if(!informational&&list.length>=CAL_CORE.minSide&&lift!=null){
   const halvesReady=inA.length>=CAL_CORE.minHalf&&inB.length>=CAL_CORE.minHalf;
   const opposed=halvesReady&&liftA!=null&&liftB!=null&&sign(liftA)!==0&&sign(liftB)!==0&&sign(liftA)!==sign(liftB)&&Math.abs(liftA)>=minLift&&Math.abs(liftB)>=minLift;
   if(opposed)status='contradicted';
   else if(s!=null&&Math.abs(lift)<s)status='flat';
   else if(!halvesReady)status='directional';
   else if(sign(lift)!==0&&sign(liftA)===sign(lift)&&sign(liftB)===sign(lift)&&Math.abs(lift)>=minLift)status='confirmed';
   else status='directional';
  }
  return {side,n:list.length,mean:m,lift,se:s,halfA:{n:inA.length,lift:liftA},halfB:{n:inB.length,lift:liftB},status,informational};
 }).sort((a,b)=>Number(a.informational)-Number(b.informational)||b.n-a.n||a.side.localeCompare(b.side));
 return {id:def.id,label:def.label,file:def.file,ruleVersion:def.ruleVersion,outcome,unit,observations:tagged.length,sides:rows};
}
export function splitAt(obs:{at:number}[]){
 const sorted=[...obs].sort((a,b)=>a.at-b.at);const i=Math.floor(sorted.length/2);
 return sorted[i]?new Date(sorted[i].at).toISOString():null;
}
