'use client';
import {useEffect,useState} from 'react';
type M={n:number;positives:number;baseRate:number|null;brier:number|null;brierClimatology:number|null;brierSkill:number|null;logLoss:number|null;auc:number|null};
type Cal={from:number;to:number;n:number;meanPredicted:number|null;observed:number|null;avgR:number|null};
type Report={dev:{from:string|null;to:string|null;rows:number};postHoldoutRows:number;folds:{testFrom:string;testTo:string;train:number;test:number;trainBase:number;metrics:{logistic:M;gbt:M}}[];
 oof:{logistic:M;gbt:M;climatologyBase:number|null};calibration:{logistic:Cal[];gbt:Cal[]};
 holdout:{from:string;to:string;train:number;rows:number;metrics:{logistic:M;gbt:M}|null;calibration:{logistic:Cal[];gbt:Cal[]}|null};
 importance:{feature:string;gbtGain:number;lrCoef:number}[];holdoutLooks:number;labelled:number;datasetRunId:string};
type View={error?:string;config:{version:string;target:string;embargoDays:number;holdoutDays:number;foldDays:number;minTrain:number;gbt:{trees:number;depth:number;rate:number;minLeaf:number};featuresVersion:string;live:{perRun:number;lookbackHours:number}};
 model:{modelId:string;trainedAt:string;datasetRunId:string;version:string;report:Report}|null;
 holdoutLock:{from:string;to:string;lockedAt:string;looks:number}|null;
 live:{scored:number;unavailable:number;recent:{signal_id:string;coin:string;signal_at:string;scored_at:string;status:string;reason:string|null;probs:{logistic:number;gbt:number;stage:string}|null;decision:string|null;outcome_r:number|null;ledger_status:string|null}[]}};
const f=(n:number|null|undefined,dp=3)=>n==null?'—':n.toFixed(dp);
const pc=(n:number|null|undefined)=>n==null?'—':`${(n*100).toFixed(0)}%`;
const day=(s:string|null|undefined)=>s?s.slice(0,10):'—';
function MetricRow({label,m}:{label:string;m:M}){return <tr className="border-t border-slate-800"><td className="p-1">{label}</td><td className="p-1">{m.n}</td><td className="p-1">{pc(m.baseRate)}</td><td className="p-1">{f(m.brier)}</td><td className="p-1">{f(m.brierClimatology)}</td><td className={`p-1 ${m.brierSkill!=null&&m.brierSkill>0?'text-emerald-300':'text-amber-300'}`}>{f(m.brierSkill)}</td><td className="p-1">{f(m.logLoss)}</td><td className="p-1">{f(m.auc)}</td></tr>;}
const HEAD=['Model','Signals','Win rate','Brier','Brier (base rate)','Skill','Log loss','AUC'];
function CalTable({cal}:{cal:{logistic:Cal[];gbt:Cal[]}}){
 return <table className="min-w-[640px] text-left text-xs"><thead><tr>{['Predicted','Logistic n','Logistic observed','Logistic avg R','Trees n','Trees observed','Trees avg R'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody>
  {cal.gbt.map((b,k)=>{const l=cal.logistic[k];if(!b.n&&!l.n)return null;return <tr key={k} className="border-t border-slate-800"><td className="p-1">{pc(b.from)}–{pc(b.to)}</td><td className="p-1">{l.n}</td><td className="p-1">{pc(l.observed)}</td><td className="p-1">{f(l.avgR,2)}</td><td className="p-1">{b.n}</td><td className="p-1">{pc(b.observed)}</td><td className="p-1">{f(b.avgR,2)}</td></tr>;})}
 </tbody></table>;
}
export default function CryptoMetaModel({refreshVersion=0}:{refreshVersion?:number}){
 const [data,setData]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function call(train=false){
  setBusy(true);setError('');
  try{const r=await fetch('/api/admin/crypto-markets/meta-model',{method:train?'POST':'GET',cache:'no-store',...(train?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'train'})}:{})}),b=await r.json();
   if(b.config)setData(b);if(!r.ok)throw Error(b.error||'Shadow model unavailable');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 useEffect(()=>{void call();},[refreshVersion]);
 const c=data?.config,m=data?.model,r=m?.report,lock=data?.holdoutLock;
 return <section aria-label="Shadow model" className="space-y-3 rounded border border-violet-700 p-4">
  <h2 className="text-xl">Shadow model · SIMULATED · LOG ONLY</h2>
  <p className="text-sm">Estimates the chance that a confirmed setup&apos;s fixed 2R plan ends above 0R after costs, from features known at the signal close. Live scores are <b>recorded only</b>: they never change an entry, a size or an exit.</p>
  <details className="rounded border border-slate-700 p-3 text-sm"><summary className="font-semibold">Method</summary><ul className="list-disc space-y-1 pl-5 text-slate-300">
   <li><b>Target:</b> {c?.target}. Trained on the History replay dataset: confirmed setups with a real entry (taken or skipped); chase-limited and window-end rows are excluded.</li>
   <li><b>Models:</b> logistic regression (L2) and gradient-boosted trees ({c?.gbt.trees} trees, depth {c?.gbt.depth}, learning rate {c?.gbt.rate}, at least {c?.gbt.minLeaf} signals per leaf), both written in this codebase. Features: {c?.featuresVersion}; missing values are flagged, never filled from the future.</li>
   <li><b>Validation:</b> walk-forward in {c?.foldDays}-day test windows. Training rows must be signalled at least {c?.embargoDays} days before the window and have a known outcome before it (purge and embargo). At least {c?.minTrain} training signals per window.</li>
   <li><b>Locked holdout:</b> the last {c?.holdoutDays} days of the first dataset, fixed at the first training and never used for training. Every training scores it again; the number of looks is shown, because each look weakens it as an unbiased test.</li>
   <li><b>Reading the numbers:</b> Brier skill above 0 means better than always predicting the training win rate. AUC 0.5 is no ranking ability. Small samples are noisy; an edge must hold in the holdout, not only in walk-forward.</li>
  </ul></details>
  <div className="flex flex-wrap items-center gap-3">
   <button disabled={busy} onClick={()=>void call(true)} className="rounded bg-violet-800 px-3 py-2 disabled:opacity-50">{m?'Train again':'Train model'}</button>
   {busy&&<span>Working…</span>}
  </div>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  {lock&&<p className="text-sm">Holdout locked {day(lock.lockedAt)}: signals {day(lock.from)} → {day(lock.to)} · looked at {lock.looks} time{lock.looks===1?'':'s'}{lock.looks>3?<span className="text-amber-300"> · repeated looks: treat holdout results as optimistic</span>:null}</p>}
  {!m&&!busy&&<p className="text-sm text-slate-400">No model trained yet. Run the History replay to completion (including Simulate books), then train.</p>}
  {r&&<div className="space-y-3 text-sm">
   <p>Model {m!.version} trained {new Date(m!.trainedAt).toLocaleString()} on replay run {day(m!.datasetRunId)} · {r.labelled.toLocaleString()} labelled signals · development {day(r.dev.from)} → {day(r.dev.to)} ({r.dev.rows.toLocaleString()}){r.postHoldoutRows?` · ${r.postHoldoutRows} signals after the holdout not used`:''}</p>
   <h3 className="font-semibold">Walk-forward (out of sample, {r.folds.length} windows)</h3>
   <div className="overflow-auto"><table className="min-w-[640px] text-left"><thead><tr>{HEAD.map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody><MetricRow label="Logistic" m={r.oof.logistic}/><MetricRow label="Trees" m={r.oof.gbt}/></tbody></table></div>
   <details><summary>Calibration (walk-forward)</summary><div className="overflow-auto"><CalTable cal={r.calibration}/></div></details>
   <details><summary>Per window</summary><div className="overflow-auto"><table className="min-w-[640px] text-left text-xs"><thead><tr>{['Test window','Train','Test','Train win rate','Logistic Brier skill','Trees Brier skill','Logistic AUC','Trees AUC'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody>
    {r.folds.map(x=><tr key={x.testFrom} className="border-t border-slate-800"><td className="p-1">{day(x.testFrom)} → {day(x.testTo)}</td><td className="p-1">{x.train}</td><td className="p-1">{x.test}</td><td className="p-1">{pc(x.trainBase)}</td><td className="p-1">{f(x.metrics.logistic.brierSkill)}</td><td className="p-1">{f(x.metrics.gbt.brierSkill)}</td><td className="p-1">{f(x.metrics.logistic.auc)}</td><td className="p-1">{f(x.metrics.gbt.auc)}</td></tr>)}
   </tbody></table></div></details>
   <h3 className="font-semibold">Locked holdout ({day(r.holdout.from)} → {day(r.holdout.to)}, trained on {r.holdout.train.toLocaleString()} earlier signals)</h3>
   {r.holdout.metrics?<><div className="overflow-auto"><table className="min-w-[640px] text-left"><thead><tr>{HEAD.map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody><MetricRow label="Logistic" m={r.holdout.metrics.logistic}/><MetricRow label="Trees" m={r.holdout.metrics.gbt}/></tbody></table></div>
    {r.holdout.calibration&&<details><summary>Calibration (holdout)</summary><div className="overflow-auto"><CalTable cal={r.holdout.calibration}/></div></details>}</>
    :<p className="text-slate-400">No holdout signals in this dataset.</p>}
   <details><summary>Feature importance (final model)</summary><div className="overflow-auto"><table className="min-w-[480px] text-left text-xs"><thead><tr><th className="p-1">Feature</th><th className="p-1">Trees: share of split gain</th><th className="p-1">Logistic: standardised coefficient</th></tr></thead><tbody>
    {r.importance.slice(0,20).map(x=><tr key={x.feature} className="border-t border-slate-800"><td className="p-1">{x.feature}</td><td className="p-1">{pc(x.gbtGain)}</td><td className="p-1">{f(x.lrCoef)}</td></tr>)}
   </tbody></table><p className="text-slate-400">Importance shows what the model leaned on, not cause and effect.</p></div></details>
  </div>}
  <h3 className="text-sm font-semibold">Live scores (log only)</h3>
  <p className="text-xs text-slate-400">Up to {c?.live.perRun} new live signals per cron run (last {c?.live.lookbackHours}h), features recomputed from completed Coinbase candles. {data?.live.scored??0} scored · {data?.live.unavailable??0} unavailable. Outcomes appear when the signal ledger resolves a skipped signal.</p>
  {!!data?.live.recent.length&&<div className="overflow-auto"><table className="min-w-[640px] text-left text-xs"><thead><tr>{['Signal','Coin','Setup','Logistic','Trees','Decision','Fixed-plan outcome','Note'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody>
   {data.live.recent.map(s=><tr key={s.signal_id} className="border-t border-slate-800"><td className="p-1">{new Date(s.signal_at).toLocaleString()}</td><td className="p-1">{s.coin}</td><td className="p-1">{s.probs?.stage??'—'}</td><td className="p-1">{pc(s.probs?.logistic)}</td><td className="p-1">{pc(s.probs?.gbt)}</td><td className="p-1">{s.decision??'—'}</td><td className="p-1">{s.outcome_r!=null?`${s.outcome_r>=0?'+':''}${s.outcome_r.toFixed(2)}R`:s.decision==='TAKEN'?'See paper ledger':'Pending'}</td><td className="p-1">{s.status==='UNAVAILABLE'?s.reason:''}</td></tr>)}
  </tbody></table></div>}
 </section>;
}
