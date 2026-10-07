import type {FeatureValue} from './cryptoSignalFeatures';

/**
 * Shadow meta-labelling model (Phase 4, RESEARCH ONLY). Predicts whether a confirmed 4h signal's fixed-2R plan ends
 * with net R > 0, from point-in-time features (signal-features-v1). Two models: L2 logistic regression and small
 * gradient-boosted trees, both written here (no external ML code). Validation is walk-forward with purging and a
 * 7-day embargo; a locked 3-month holdout is scored once per training and the number of looks is reported. Live
 * scores are logged only and never change an entry, size or exit.
 */
export const META={
 version:'meta-v1',target:'Fixed 2R plan (live exits, 72h time stop) ends with net R > 0',
 embargoDays:7,holdoutDays:91,foldDays:91,minTrain:300,
 lr:{l2:1,iters:400,rate:.2},
 gbt:{trees:120,depth:3,rate:.05,minLeaf:30,bins:16,lambda:1},
 calibrationBins:10,
} as const;
const D=86400000;

// ---------------------------------------------------------------- encoding
export const NUMERIC=['relativeVolume','changePct','atrPct4h','stopDistanceAtr','stretchAtr','pastTriggerAtr','rsi14_4h','adx14_4h','diSpread14_4h',
 'distEma20dPct','distEma50dPct','distEma200dPct','return7dPct','return30dPct','rsVsBtc30dPct','mcapRank','daysSinceFirstHistory'] as const;
export const CATEGORICAL:Record<string,readonly (string|boolean)[]>={kind:['BREAKOUT','CONTINUATION'],btcTrend:['UP','DOWN','MIXED'],btcLongTrend:['BULL','BEAR','TRANSITION'],btcAbove200d:[true,false]};
/** Fixed column order: numeric (NaN when missing), a missing flag per numeric, one-hot categoricals (all 0 = missing), hour of day as sin/cos. */
export const FEATURE_NAMES:string[]=[...NUMERIC,...NUMERIC.map(n=>`${n}_missing`),...Object.entries(CATEGORICAL).flatMap(([k,vs])=>vs.map(v=>`${k}=${v}`)),'hourSin','hourCos'];
const NUM_N=NUMERIC.length;
export function encode(v:Record<string,FeatureValue>):number[]{
 const num=NUMERIC.map(n=>{const x=v[n];if(typeof x!=='number'||!Number.isFinite(x))return NaN;
  // Heavy-tailed counts on a log scale.
  return n==='mcapRank'||n==='daysSinceFirstHistory'?Math.log1p(Math.max(0,x)):x;});
 const hour=typeof v.hourUtc==='number'?v.hourUtc:NaN;
 return [...num,...num.map(x=>Number.isNaN(x)?1:0),...Object.entries(CATEGORICAL).flatMap(([k,vs])=>vs.map(c=>v[k]===c?1:0)),
  Number.isFinite(hour)?Math.sin(hour/24*2*Math.PI):0,Number.isFinite(hour)?Math.cos(hour/24*2*Math.PI):0];
}

// ---------------------------------------------------------------- logistic regression
export type LrModel={median:number[];mean:number[];sd:number[];w:number[];b:number};
const sigmoid=(z:number)=>1/(1+Math.exp(-Math.max(-35,Math.min(35,z))));
const medianOf=(a:number[])=>{const s=a.filter(Number.isFinite).sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:0;};
function lrRow(m:Pick<LrModel,'median'|'mean'|'sd'>,x:number[]){return x.map((v,j)=>{const u=Number.isFinite(v)?v:m.median[j];return Math.max(-5,Math.min(5,(u-m.mean[j])/m.sd[j]));});}
/** Imputes with train medians, standardises with train mean/sd (clipped at 5 sd), full-batch gradient descent with L2. */
export function fitLr(X:number[][],y:number[]):LrModel{
 const p=X[0]?.length??0,n=X.length,median=Array.from({length:p},(_,j)=>medianOf(X.map(r=>r[j])));
 const filled=X.map(r=>r.map((v,j)=>Number.isFinite(v)?v:median[j]));
 const mean=Array.from({length:p},(_,j)=>filled.reduce((s,r)=>s+r[j],0)/n);
 const sd=Array.from({length:p},(_,j)=>{const s=Math.sqrt(filled.reduce((a,r)=>a+(r[j]-mean[j])**2,0)/n);return s>1e-12?s:1;});
 const Z=X.map(r=>lrRow({median,mean,sd},r)),w=new Array(p).fill(0);
 const base=y.reduce((s,v)=>s+v,0)/n;let b=Math.log(Math.max(1e-6,base)/Math.max(1e-6,1-base));
 for(let it=0;it<META.lr.iters;it++){
  const gw=new Array(p).fill(0);let gb=0;
  for(let i=0;i<n;i++){let z=b;const zi=Z[i];for(let j=0;j<p;j++)z+=w[j]*zi[j];const e=sigmoid(z)-y[i];gb+=e;for(let j=0;j<p;j++)gw[j]+=e*zi[j];}
  for(let j=0;j<p;j++)w[j]-=META.lr.rate*(gw[j]/n+META.lr.l2*w[j]/n);
  b-=META.lr.rate*gb/n;
 }
 return {median,mean,sd,w,b};
}
export function predictLr(m:LrModel,x:number[]){const z=lrRow(m,x);let s=m.b;for(let j=0;j<z.length;j++)s+=m.w[j]*z[j];return sigmoid(s);}

// ---------------------------------------------------------------- gradient-boosted trees (binary log loss, histogram splits)
export type TreeNode={f:number;b:number;l:number;r:number}|{v:number};
export type GbtModel={edges:number[][];f0:number;trees:TreeNode[][];gain:number[]};
/** Bin 0 = missing; bins 1..k by train quantile edges. */
export function binOf(edges:number[],v:number){if(!Number.isFinite(v))return 0;let k=0;while(k<edges.length&&v>edges[k])k++;return k+1;}
export function fitGbt(X:number[][],y:number[]):GbtModel{
 const {trees:T,depth,rate,minLeaf,bins,lambda}=META.gbt,n=X.length,p=X[0]?.length??0;
 const edges=Array.from({length:p},(_,j)=>{const s=X.map(r=>r[j]).filter(Number.isFinite).sort((a,b)=>a-b),e:number[]=[];
  for(let k=1;k<bins;k++){const v=s[Math.floor(k*s.length/bins)];if(v!==undefined&&(!e.length||v>e.at(-1)!))e.push(v);}return e;});
 // Column-major bins (Uint8) and typed buffers: the split search is the hot loop.
 const nb=bins+1,cols=Array.from({length:p},(_,j)=>{const c=new Uint8Array(n);for(let i=0;i<n;i++)c[i]=binOf(edges[j],X[i][j]);return c;});
 const base=y.reduce((s,v)=>s+v,0)/n,f0=Math.log(Math.max(1e-6,base)/Math.max(1e-6,1-base));
 const F=new Float64Array(n).fill(f0),g=new Float64Array(n),h=new Float64Array(n),trees:TreeNode[][]=[],gain=new Array(p).fill(0);
 const gh=new Float64Array(nb),hh=new Float64Array(nb),cn=new Int32Array(nb);
 for(let t=0;t<T;t++){
  for(let i=0;i<n;i++){const q=sigmoid(F[i]);g[i]=q-y[i];h[i]=Math.max(1e-6,q*(1-q));}
  const nodes:TreeNode[]=[];
  const grow=(idx:Int32Array,d:number):number=>{
   let G=0,H=0;for(let k=0;k<idx.length;k++){G+=g[idx[k]];H+=h[idx[k]];}
   const at=nodes.length;nodes.push({v:-G/(H+lambda)*rate});
   if(d>=depth||idx.length<2*minLeaf)return at;
   let bestGain=1e-9,bf=-1,bb=-1;const parent=G*G/(H+lambda);
   for(let j=0;j<p;j++){
    gh.fill(0);hh.fill(0);cn.fill(0);const col=cols[j];
    for(let k=0;k<idx.length;k++){const i=idx[k],c=col[i];gh[c]+=g[i];hh[c]+=h[i];cn[c]++;}
    let gl=0,hl=0,cl=0;
    for(let k=0;k<nb-1;k++){gl+=gh[k];hl+=hh[k];cl+=cn[k];
     if(cl<minLeaf)continue;if(idx.length-cl<minLeaf)break;
     const gn=gl*gl/(hl+lambda)+(G-gl)**2/(H-hl+lambda)-parent;if(gn>bestGain){bestGain=gn;bf=j;bb=k;}}
   }
   if(bf<0)return at;
   gain[bf]+=bestGain;
   const col=cols[bf];let nl=0;for(let k=0;k<idx.length;k++)if(col[idx[k]]<=bb)nl++;
   const L=new Int32Array(nl),R=new Int32Array(idx.length-nl);let li=0,ri=0;
   for(let k=0;k<idx.length;k++){const i=idx[k];if(col[i]<=bb)L[li++]=i;else R[ri++]=i;}
   const l=grow(L,d+1),r=grow(R,d+1);nodes[at]={f:bf,b:bb,l,r};return at;
  };
  grow(Int32Array.from({length:n},(_,i)=>i),0);
  for(let i=0;i<n;i++){let k=0;for(;;){const nd=nodes[k];if('v' in nd){F[i]+=nd.v;break;}k=cols[nd.f][i]<=nd.b?nd.l:nd.r;}}
  trees.push(nodes);
 }
 return {edges,f0,trees,gain};
}
function leaf(nodes:TreeNode[],bins:number[]){let k=0;for(;;){const nd=nodes[k];if('v' in nd)return nd.v;k=bins[nd.f]<=nd.b?nd.l:nd.r;}}
export function predictGbt(m:GbtModel,x:number[]){const b=x.map((v,j)=>binOf(m.edges[j],v));let f=m.f0;for(const t of m.trees)f+=leaf(t,b);return sigmoid(f);}

// ---------------------------------------------------------------- metrics
export type Metrics={n:number;positives:number;baseRate:number|null;brier:number|null;brierClimatology:number|null;brierSkill:number|null;logLoss:number|null;auc:number|null};
export type CalibrationBin={from:number;to:number;n:number;meanPredicted:number|null;observed:number|null;avgR:number|null};
const r4=(x:number)=>Math.round(x*10000)/10000;
/** `trainBase` is the base rate the model could have known (training labels); climatology Brier uses it. */
export function metrics(p:number[],y:number[],trainBase:number):Metrics{
 const n=y.length;if(!n)return {n,positives:0,baseRate:null,brier:null,brierClimatology:null,brierSkill:null,logLoss:null,auc:null};
 const pos=y.reduce((s,v)=>s+v,0),brier=p.reduce((s,q,i)=>s+(q-y[i])**2,0)/n,clim=y.reduce((s,v)=>s+(trainBase-v)**2,0)/n;
 const ll=-p.reduce((s,q,i)=>{const c=Math.min(1-1e-9,Math.max(1e-9,q));return s+(y[i]?Math.log(c):Math.log(1-c));},0)/n;
 return {n,positives:pos,baseRate:r4(pos/n),brier:r4(brier),brierClimatology:r4(clim),brierSkill:clim>0?r4(1-brier/clim):null,logLoss:r4(ll),auc:auc(p,y)};
}
/** Rank AUC (ties averaged); null when one class is absent. */
export function auc(p:number[],y:number[]):number|null{
 const idx=p.map((v,i)=>[v,y[i]] as const).sort((a,b)=>a[0]-b[0]),pos=y.filter(v=>v===1).length,neg=y.length-pos;if(!pos||!neg)return null;
 let rankSum=0;for(let i=0;i<idx.length;){let j=i;while(j<idx.length&&idx[j][0]===idx[i][0])j++;const avg=(i+j+1)/2;for(let k=i;k<j;k++)if(idx[k][1]===1)rankSum+=avg;i=j;}
 return r4((rankSum-pos*(pos+1)/2)/(pos*neg));
}
export function calibration(p:number[],y:number[],r:number[]):CalibrationBin[]{
 const k=META.calibrationBins;return Array.from({length:k},(_,b)=>{
  const ids=p.map((_,i)=>i).filter(i=>Math.min(k-1,Math.floor(p[i]*k))===b),m=(a:number[])=>a.length?r4(a.reduce((s,x)=>s+x,0)/a.length):null;
  return {from:b/k,to:(b+1)/k,n:ids.length,meanPredicted:m(ids.map(i=>p[i])),observed:m(ids.map(i=>y[i])),avgR:m(ids.map(i=>r[i]))};});
}

// ---------------------------------------------------------------- walk-forward with purging, embargo and a locked holdout
export type MetaRow={id:string;signalAt:number;exitAt:number;y:0|1;r:number;x:number[]};
export type ModelName='logistic'|'gbt';
export type Fold={testFrom:string;testTo:string;train:number;test:number;trainBase:number;metrics:Record<ModelName,Metrics>};
/** Training rows for a test window starting at `testFrom`: signal at least the embargo before it AND outcome known before it. */
export const trainableBefore=(rows:MetaRow[],testFrom:number)=>rows.filter(r=>r.signalAt<testFrom-META.embargoDays*D&&r.exitAt<testFrom);
export function fitBoth(rows:MetaRow[]){const X=rows.map(r=>r.x),y=rows.map(r=>r.y);return {logistic:fitLr(X,y),gbt:fitGbt(X,y)};}
export function predictBoth(m:ReturnType<typeof fitBoth>,x:number[]):Record<ModelName,number>{return {logistic:predictLr(m.logistic,x),gbt:predictGbt(m.gbt,x)};}
export type Holdout={from:number;to:number};
export type WalkForwardReport={dev:{from:string|null;to:string|null;rows:number};postHoldoutRows:number;folds:Fold[];
 oof:Record<ModelName,Metrics>&{climatologyBase:number|null};calibration:Record<ModelName,CalibrationBin[]>;
 holdout:{from:string;to:string;train:number;rows:number;metrics:Record<ModelName,Metrics>|null;calibration:Record<ModelName,CalibrationBin[]>|null};
 importance:{feature:string;gbtGain:number;lrCoef:number}[]};
/**
 * Pure. Development rows are those before the holdout; rows after the locked holdout end are not used at all.
 * Folds: consecutive `foldDays` test windows once at least `minTrain` rows are trainable before the window.
 * The final model is trained on development rows trainable before the holdout and scored once on it.
 */
export function walkForward(rows:MetaRow[],holdout:Holdout){
 const sorted=[...rows].sort((a,b)=>a.signalAt-b.signalAt),dev=sorted.filter(r=>r.signalAt<holdout.from),hold=sorted.filter(r=>r.signalAt>=holdout.from&&r.signalAt<holdout.to);
 const folds:Fold[]=[],oofP:Record<ModelName,number[]>={logistic:[],gbt:[]},oofY:number[]=[],oofR:number[]=[],oofBase:number[]=[];
 if(dev.length){
  let start=Math.floor(dev[0].signalAt/D)*D+META.foldDays*D;
  while(start<holdout.from&&trainableBefore(dev,start).length<META.minTrain)start+=META.foldDays*D;
  for(let a=start;a<holdout.from;a+=META.foldDays*D){
   const b=Math.min(holdout.from,a+META.foldDays*D),train=trainableBefore(dev,a),test=dev.filter(r=>r.signalAt>=a&&r.signalAt<b);
   if(!test.length||train.length<META.minTrain)continue;
   const m=fitBoth(train),base=train.reduce((s,r)=>s+r.y,0)/train.length,pr={logistic:[] as number[],gbt:[] as number[]};
   for(const r of test){const q=predictBoth(m,r.x);pr.logistic.push(q.logistic);pr.gbt.push(q.gbt);}
   const y=test.map(r=>r.y);
   folds.push({testFrom:new Date(a).toISOString(),testTo:new Date(b).toISOString(),train:train.length,test:test.length,trainBase:r4(base),metrics:{logistic:metrics(pr.logistic,y,base),gbt:metrics(pr.gbt,y,base)}});
   oofP.logistic.push(...pr.logistic);oofP.gbt.push(...pr.gbt);oofY.push(...y);oofR.push(...test.map(r=>r.r));oofBase.push(...test.map(()=>base));
  }
 }
 // Pooled out-of-fold metrics; climatology uses each fold's own training base rate.
 const pooled=(p:number[])=>{const m=metrics(p,oofY,0),clim=oofY.length?oofY.reduce((s,v,i)=>s+(oofBase[i]-v)**2,0)/oofY.length:null;
  return {...m,brierClimatology:clim==null?null:r4(clim),brierSkill:clim&&m.brier!=null?r4(1-m.brier/clim):null};};
 const finalTrain=trainableBefore(dev,holdout.from),final=finalTrain.length>=META.minTrain?fitBoth(finalTrain):null;
 let holdMetrics:Record<ModelName,Metrics>|null=null,holdCal:Record<ModelName,CalibrationBin[]>|null=null;
 if(final&&hold.length){const base=finalTrain.reduce((s,r)=>s+r.y,0)/finalTrain.length,p={logistic:hold.map(r=>predictLr(final.logistic,r.x)),gbt:hold.map(r=>predictGbt(final.gbt,r.x))},y=hold.map(r=>r.y),rr=hold.map(r=>r.r);
  holdMetrics={logistic:metrics(p.logistic,y,base),gbt:metrics(p.gbt,y,base)};holdCal={logistic:calibration(p.logistic,y,rr),gbt:calibration(p.gbt,y,rr)};}
 const totalGain=final?final.gbt.gain.reduce((s,x)=>s+x,0):0;
 const importance=final?FEATURE_NAMES.map((f,j)=>({feature:f,gbtGain:totalGain>0?r4(final.gbt.gain[j]/totalGain):0,lrCoef:r4(final.logistic.w[j])})).sort((a,b)=>b.gbtGain-a.gbtGain||Math.abs(b.lrCoef)-Math.abs(a.lrCoef)):[];
 const report:WalkForwardReport={dev:{from:dev[0]?new Date(dev[0].signalAt).toISOString():null,to:dev.at(-1)?new Date(dev.at(-1)!.signalAt).toISOString():null,rows:dev.length},
  postHoldoutRows:sorted.filter(r=>r.signalAt>=holdout.to).length,folds,
  oof:{logistic:pooled(oofP.logistic),gbt:pooled(oofP.gbt),climatologyBase:oofBase.length?r4(oofBase.reduce((s,x)=>s+x,0)/oofBase.length):null},
  calibration:{logistic:calibration(oofP.logistic,oofY,oofR),gbt:calibration(oofP.gbt,oofY,oofR)},
  holdout:{from:new Date(holdout.from).toISOString(),to:new Date(holdout.to).toISOString(),train:finalTrain.length,rows:hold.length,metrics:holdMetrics,calibration:holdCal},importance};
 return {report,final};
}
/** The holdout is the last `holdoutDays` of signals, fixed the first time a model is trained and reused after. */
export function proposeHoldout(rows:{signalAt:number}[]):Holdout|null{
 if(!rows.length)return null;const last=rows.reduce((m,r)=>Math.max(m,r.signalAt),-Infinity),to=Math.floor(last/D)*D+D;return {from:to-META.holdoutDays*D,to};
}
