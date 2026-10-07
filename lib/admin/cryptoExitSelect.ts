import {META,fitGbt,predictGbt,trainableBefore,type GbtModel,type Holdout} from './cryptoMetaModel';
import {SHADOW_PLANS_ACTIVE} from './cryptoPaperShadow';

/**
 * Exit selection in shadow (Phase 5, RESEARCH ONLY). For each confirmed setup, choose which exit plan to run (the
 * live fixed 2R plan or one of the shadow plans) from features known at the signal close. One regression model per
 * plan predicts that plan's net R; the selector takes the highest prediction. Judged against always-fixed (live),
 * the best single plan picked on training data only, and the hindsight oracle (an upper bound nobody can reach).
 * Same walk-forward, purge, 7-day embargo and locked holdout rules as the Phase 4 model. Live choices are logged
 * only; no paper position's exits change.
 */
export const EXIT_PLANS=['fixed-2r',...SHADOW_PLANS_ACTIVE] as const;
export type ExitPlan=typeof EXIT_PLANS[number];
export const EXIT_SELECT={version:'exit-select-v1',
 /** Smaller than the Phase 4 trees: seven models per window. */
 gbt:{trees:50,depth:2,rate:.05,minLeaf:50,bins:16,lambda:5},
 /** Training targets are clipped to the training 1st-99th percentile per plan (fat tails); evaluation uses raw R. */
 winsor:[.01,.99] as [number,number]} as const;
const D=86400000;
export type ExitRow={id:string;signalAt:number;exitAt:number;x:number[];r:Record<ExitPlan,number>};
export type ExitSelector={models:Record<ExitPlan,GbtModel>;staticBest:ExitPlan;trainMeans:Record<ExitPlan,number>};
const mean=(a:number[])=>a.length?a.reduce((s,x)=>s+x,0)/a.length:NaN;
const r4=(x:number)=>Math.round(x*10000)/10000;
function quantile(sorted:number[],q:number){if(!sorted.length)return NaN;const i=Math.min(sorted.length-1,Math.max(0,Math.floor(q*(sorted.length-1))));return sorted[i];}
export function fitSelector(rows:ExitRow[]):ExitSelector{
 const X=rows.map(r=>r.x),models={} as Record<ExitPlan,GbtModel>,trainMeans={} as Record<ExitPlan,number>;
 for(const p of EXIT_PLANS){
  const y=rows.map(r=>r.r[p]),s=[...y].sort((a,b)=>a-b),lo=quantile(s,EXIT_SELECT.winsor[0]),hi=quantile(s,EXIT_SELECT.winsor[1]);
  models[p]=fitGbt(X,y.map(v=>Math.min(hi,Math.max(lo,v))),EXIT_SELECT.gbt,'squared');trainMeans[p]=r4(mean(y));
 }
 // Best single plan on the training rows only (ties keep the live plan first).
 const staticBest=EXIT_PLANS.reduce((b,p)=>trainMeans[p]>trainMeans[b]?p:b,EXIT_PLANS[0] as ExitPlan);
 return {models,staticBest,trainMeans};
}
export function predictPlans(m:ExitSelector,x:number[]):Record<ExitPlan,number>{return Object.fromEntries(EXIT_PLANS.map(p=>[p,predictGbt(m.models[p],x)])) as Record<ExitPlan,number>;}
export function selectPlan(m:ExitSelector,x:number[]){const e=predictPlans(m,x);const plan=EXIT_PLANS.reduce((b,p)=>e[p]>e[b]?p:b,EXIT_PLANS[0] as ExitPlan);return {plan,expectedR:r4(e[plan]),expected:Object.fromEntries(EXIT_PLANS.map(p=>[p,r4(e[p])]))};}

export type StrategyName='fixed-2r'|'static-best'|'model'|'oracle';
export type StrategyStats={n:number;meanR:number|null;totalR:number;winRate:number|null;
 /** Paired difference against always-fixed (the live plan): mean, standard error, t. */
 vsFixed:{meanDiff:number|null;se:number|null;t:number|null}};
export function strategyStats(rs:number[],fixed:number[]):StrategyStats{
 const n=rs.length,d=rs.map((r,i)=>r-fixed[i]),md=mean(d),sd=n>1?Math.sqrt(d.reduce((s,x)=>s+(x-md)**2,0)/(n-1)):NaN,se=n>1?sd/Math.sqrt(n):NaN;
 return {n,meanR:n?r4(mean(rs)):null,totalR:r4(rs.reduce((s,x)=>s+x,0)),winRate:n?r4(rs.filter(x=>x>0).length/n):null,
  vsFixed:{meanDiff:n?r4(md):null,se:Number.isFinite(se)?r4(se):null,t:Number.isFinite(se)&&se>0?r4(md/se):null}};
}
type Picks={fixed:number[];staticBest:number[];model:number[];oracle:number[];plans:Record<ExitPlan,number[]>;choices:Record<ExitPlan,number>};
const emptyPicks=():Picks=>({fixed:[],staticBest:[],model:[],oracle:[],plans:Object.fromEntries(EXIT_PLANS.map(p=>[p,[]])) as unknown as Record<ExitPlan,number[]>,choices:Object.fromEntries(EXIT_PLANS.map(p=>[p,0])) as Record<ExitPlan,number>});
function score(m:ExitSelector,test:ExitRow[],into:Picks){
 for(const r of test){const pick=selectPlan(m,r.x).plan;
  into.fixed.push(r.r['fixed-2r']);into.staticBest.push(r.r[m.staticBest]);into.model.push(r.r[pick]);into.oracle.push(Math.max(...EXIT_PLANS.map(p=>r.r[p])));
  for(const p of EXIT_PLANS)into.plans[p].push(r.r[p]);into.choices[pick]++;}
}
export type ExitSummary={strategies:Record<StrategyName,StrategyStats>;plans:Record<ExitPlan,StrategyStats>;modelChoices:Record<ExitPlan,number>};
function summarise(p:Picks):ExitSummary{
 return {strategies:{'fixed-2r':strategyStats(p.fixed,p.fixed),'static-best':strategyStats(p.staticBest,p.fixed),model:strategyStats(p.model,p.fixed),oracle:strategyStats(p.oracle,p.fixed)},
  plans:Object.fromEntries(EXIT_PLANS.map(x=>[x,strategyStats(p.plans[x],p.fixed)])) as Record<ExitPlan,StrategyStats>,modelChoices:p.choices};
}
export type ExitFold={testFrom:string;testTo:string;train:number;test:number;staticBest:ExitPlan;meanR:{fixed:number|null;staticBest:number|null;model:number|null}};
export type ExitReport={dev:{rows:number};postHoldoutRows:number;folds:ExitFold[];walkForward:ExitSummary;
 holdout:{from:string;to:string;train:number;rows:number;staticBest:ExitPlan|null;summary:ExitSummary|null};
 importance:{plan:ExitPlan;top:{feature:number;share:number}[]}[]};
/** Pure. Mirrors the Phase 4 walk-forward: folds before the locked holdout; the final selector is scored once on it. */
export function walkForwardExit(rows:ExitRow[],holdout:Holdout){
 const sorted=[...rows].sort((a,b)=>a.signalAt-b.signalAt),dev=sorted.filter(r=>r.signalAt<holdout.from),hold=sorted.filter(r=>r.signalAt>=holdout.from&&r.signalAt<holdout.to);
 const folds:ExitFold[]=[],oof=emptyPicks();
 if(dev.length){
  let start=Math.floor(dev[0].signalAt/D)*D+META.foldDays*D;
  while(start<holdout.from&&trainableBefore(dev,start).length<META.minTrain)start+=META.foldDays*D;
  for(let a=start;a<holdout.from;a+=META.foldDays*D){
   const b=Math.min(holdout.from,a+META.foldDays*D),train=trainableBefore(dev,a),test=dev.filter(r=>r.signalAt>=a&&r.signalAt<b);
   if(!test.length||train.length<META.minTrain)continue;
   const m=fitSelector(train),f=emptyPicks();score(m,test,f);
   for(const k of ['fixed','staticBest','model','oracle'] as const)oof[k].push(...f[k]);for(const p of EXIT_PLANS){oof.plans[p].push(...f.plans[p]);oof.choices[p]+=f.choices[p];}
   folds.push({testFrom:new Date(a).toISOString(),testTo:new Date(b).toISOString(),train:train.length,test:test.length,staticBest:m.staticBest,meanR:{fixed:r4(mean(f.fixed)),staticBest:r4(mean(f.staticBest)),model:r4(mean(f.model))}});
  }
 }
 const finalTrain=trainableBefore(dev,holdout.from),final=finalTrain.length>=META.minTrain?fitSelector(finalTrain):null;
 let holdSummary:ExitSummary|null=null;if(final&&hold.length){const h=emptyPicks();score(final,hold,h);holdSummary=summarise(h);}
 const importance=final?EXIT_PLANS.map(plan=>{const g=final.models[plan].gain,t=g.reduce((s,x)=>s+x,0);
  return {plan,top:g.map((v,feature)=>({feature,share:t>0?r4(v/t):0})).sort((x,y)=>y.share-x.share).slice(0,5)};}):[];
 const report:ExitReport={dev:{rows:dev.length},postHoldoutRows:sorted.filter(r=>r.signalAt>=holdout.to).length,folds,walkForward:summarise(oof),
  holdout:{from:new Date(holdout.from).toISOString(),to:new Date(holdout.to).toISOString(),train:finalTrain.length,rows:hold.length,staticBest:final?.staticBest??null,summary:holdSummary},importance};
 return {report,final};
}
