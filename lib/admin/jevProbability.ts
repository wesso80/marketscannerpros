/**
 * Probability scoring for stored Jev answers. Pure: no provider, no redis, no orders.
 * y = 1 when the graded outcome is strictly positive (paper/base/backtest R > 0, or forward 24h % > 0), else 0.
 * p is the probability already stored on the stamp. A high Brier means that probability is a poor forecast of a positive outcome;
 * the bucket table shows the relationship directly, including questions that point the other way.
 * Buckets are [0,0.2), [0.2,0.4), [0.4,0.6), [0.6,0.8), [0.8,1]. 1.0 sits in the last bucket.
 */
export const PROBABILITY_RULE='jev-probability-v1' as const;
export const PROBABILITY_BUCKETS=['0-0.2','0.2-0.4','0.4-0.6','0.6-0.8','0.8-1.0'] as const;
export type ProbabilityBucket=typeof PROBABILITY_BUCKETS[number];
export type ProbabilityOutcome='paperR'|'forward24h'|'baseR'|'backtestR';
const QUESTIONS:[string,string,string,string][]=[
 ['jev','chase','Jev chase','chase'],
 ['jev','flowAgrees','Jev flow agrees','flowAgrees'],
 ['jev','btcHeadwind','Jev btc headwind','btcHeadwind'],
 ['chart','cleanBase','Chart clean base','cleanBase'],
 ['chart','strongClose','Chart strong close','strongClose'],
 ['chart','volumeExpansion','Chart volume expansion','volumeExpansion'],
 ['chart','overheadSupply','Chart overhead supply','overheadSupply'],
 ['catalyst','listingNews','Catalyst listing news','listingNews'],
 ['catalyst','supplyEvent','Catalyst supply event','supplyEvent'],
 ['catalyst','exploitOrOutage','Catalyst exploit or outage','exploitOrOutage'],
 ['catalyst','regulatoryNegative','Catalyst regulatory negative','regulatoryNegative'],
 ['catalyst','narrativeOnly','Catalyst narrative only','narrativeOnly'],
];
export type StampBag={outcome:ProbabilityOutcome;value:number;jev?:Record<string,unknown>|null;chart?:Record<string,unknown>|null;catalyst?:Record<string,unknown>|null};
export type ProbabilityBucketRow={bucket:ProbabilityBucket;n:number;meanP:number|null;favorable:number|null;meanOutcome:number|null};
export type ProbabilityQuestion={id:string;label:string;module:string;outcome:ProbabilityOutcome;n:number;positives:number;baseRate:number|null;brier:number|null;brierBaseRate:number|null;logLoss:number|null;buckets:ProbabilityBucketRow[]};
export type ProbabilityReport={rule:typeof PROBABILITY_RULE;definition:string;questions:ProbabilityQuestion[]};
export const PROBABILITY_DEFINITION='For each stored probability p and graded outcome, y is 1 when that outcome is strictly positive (R > 0, or the 24h mark > 0%) and 0 otherwise. Brier is the mean of (p − y)². Log loss is the mean of −(y ln p + (1 − y) ln(1 − p)) with p clipped to [1e-6, 1−1e-6]. brierBaseRate is the Brier score of predicting the sample base rate every time. Buckets are [0,0.2), [0.2,0.4), [0.4,0.6), [0.6,0.8) and [0.8,1]. This does not change a rule.';
type Pair={p:number;y:0|1;value:number};
const clip=(p:number)=>Math.min(1-1e-6,Math.max(1e-6,p));
export function probabilityBucket(p:number):ProbabilityBucket|null{
 if(!(p>=0&&p<=1))return null;
 if(p<0.2)return '0-0.2';
 if(p<0.4)return '0.2-0.4';
 if(p<0.6)return '0.4-0.6';
 if(p<0.8)return '0.6-0.8';
 return '0.8-1.0';
}
export function brierScore(pairs:Array<{p:number;y:0|1}>):number|null{
 if(!pairs.length)return null;
 return pairs.reduce((s,r)=>s+(r.p-r.y)**2,0)/pairs.length;
}
export function logLossScore(pairs:Array<{p:number;y:0|1}>):number|null{
 if(!pairs.length)return null;
 return pairs.reduce((s,r)=>{const p=clip(r.p);return s-(r.y*Math.log(p)+(1-r.y)*Math.log(1-p));},0)/pairs.length;
}
export function bucketRows(pairs:Pair[]):ProbabilityBucketRow[]{
 return PROBABILITY_BUCKETS.map(bucket=>{
  const list=pairs.filter(r=>probabilityBucket(r.p)===bucket);
  const n=list.length;
  return {bucket,n,meanP:n?list.reduce((s,r)=>s+r.p,0)/n:null,favorable:n?list.filter(r=>r.y===1).length/n:null,meanOutcome:n?list.reduce((s,r)=>s+r.value,0)/n:null};
 });
}
function pairsFor(rows:StampBag[],module:string,key:string):Map<ProbabilityOutcome,Pair[]>{
 const out=new Map<ProbabilityOutcome,Pair[]>();
 for(const row of rows){
  if(typeof row.value!=='number'||!Number.isFinite(row.value))continue;
  const stamp=module==='jev'?row.jev:module==='chart'?row.chart:row.catalyst;
  if(!stamp||stamp.status!=='scored')continue;
  const p=stamp[key];
  if(typeof p!=='number'||!Number.isFinite(p)||p<0||p>1)continue;
  const list=out.get(row.outcome)??[];
  list.push({p,y:row.value>0?1:0,value:row.value});
  out.set(row.outcome,list);
 }
 return out;
}
/** One row per question per outcome that has at least one stored probability. Order is fixed. */
export function scoreJevQuestions(rows:StampBag[]):ProbabilityReport{
 const questions:ProbabilityQuestion[]=[];
 for(const [module,id,label,key] of QUESTIONS){
  const byOutcome=pairsFor(rows,module,key);
  for(const outcome of ['paperR','forward24h','baseR','backtestR'] as const){
   const pairs=byOutcome.get(outcome)??[];
   if(!pairs.length)continue;
   const positives=pairs.filter(r=>r.y===1).length;
   const baseRate=positives/pairs.length;
   const brierBase=brierScore(pairs.map(r=>({p:baseRate,y:r.y})));
   questions.push({id:`${module}.${id}`,label,module,outcome,n:pairs.length,positives,baseRate,brier:brierScore(pairs),brierBaseRate:brierBase,logLoss:logLossScore(pairs),buckets:bucketRows(pairs)});
  }
 }
 return {rule:PROBABILITY_RULE,definition:PROBABILITY_DEFINITION,questions};
}
