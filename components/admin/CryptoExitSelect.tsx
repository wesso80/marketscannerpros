'use client';
import {useEffect,useState} from 'react';
type S={n:number;meanR:number|null;totalR:number;winRate:number|null;vsFixed:{meanDiff:number|null;se:number|null;t:number|null}};
type Summary={strategies:Record<'fixed-2r'|'static-best'|'model'|'oracle',S>;plans:Record<string,S>;modelChoices:Record<string,number>};
type Report={dev:{rows:number};postHoldoutRows:number;folds:{testFrom:string;testTo:string;train:number;test:number;staticBest:string;meanR:{fixed:number|null;staticBest:number|null;model:number|null}}[];
 walkForward:Summary;holdout:{from:string;to:string;train:number;rows:number;staticBest:string|null;summary:Summary|null};importance:{plan:string;top:{feature:string;share:number}[]}[];
 holdoutLooks:number;labelled:number;incomplete:number;datasetRunId:string};
type View={error?:string;config:{version:string;plans:string[];embargoDays:number;foldDays:number;minTrain:number;holdoutDays:number;featuresVersion:string;gbt:{trees:number;depth:number;minLeaf:number}};
 model:{modelId:string;trainedAt:string;version:string;report:Report}|null;holdoutLock:{from:string;to:string;lockedAt:string;looks:number}|null;
 live:{recent:{signalId:string;coin:string;signalAt:string;plan:string|null;expectedR:number|null;decision:string|null;fixedR:number|null;chosenR:number|null;resolved:boolean}[];resolved:number;chosenMinusFixedR:number|null}};
const rf=(n:number|null|undefined)=>n==null?'—':`${n>=0?'+':''}${n.toFixed(3)}R`;
const pc=(n:number|null|undefined)=>n==null?'—':`${(n*100).toFixed(0)}%`;
const day=(s:string|null|undefined)=>s?s.slice(0,10):'—';
const LABEL:Record<string,string>={'fixed-2r':'Always fixed 2R (live plan)','static-best':'Best single plan (picked on training data)','model':'Model selection','oracle':'Hindsight best (not achievable)'};
function Table({s}:{s:Summary}){
 return <table className="min-w-[720px] text-left text-sm"><thead><tr>{['Strategy','Signals','Mean R','Total R','Win rate','vs fixed (mean diff)','Std error','t'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody>
  {(['fixed-2r','static-best','model','oracle'] as const).map(k=>{const x=s.strategies[k];return <tr key={k} className={`border-t border-slate-800 ${k==='oracle'?'text-slate-400':''}`}><td className="p-1">{LABEL[k]}</td><td className="p-1">{x.n}</td><td className="p-1">{rf(x.meanR)}</td><td className="p-1">{rf(x.totalR)}</td><td className="p-1">{pc(x.winRate)}</td><td className={`p-1 ${k!=='oracle'&&x.vsFixed.meanDiff!=null?x.vsFixed.meanDiff>0?'text-emerald-300':x.vsFixed.meanDiff<0?'text-red-300':'':''}`}>{k==='fixed-2r'?'—':rf(x.vsFixed.meanDiff)}</td><td className="p-1">{k==='fixed-2r'?'—':x.vsFixed.se?.toFixed(3)??'—'}</td><td className="p-1">{k==='fixed-2r'?'—':x.vsFixed.t?.toFixed(2)??'—'}</td></tr>;})}
 </tbody></table>;
}
function Plans({s}:{s:Summary}){
 return <table className="min-w-[560px] text-left text-xs"><thead><tr>{['Plan (always used)','Mean R','vs fixed','t','Model chose it'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody>
  {Object.entries(s.plans).map(([p,x])=><tr key={p} className="border-t border-slate-800"><td className="p-1">{p}</td><td className="p-1">{rf(x.meanR)}</td><td className="p-1">{p==='fixed-2r'?'—':rf(x.vsFixed.meanDiff)}</td><td className="p-1">{p==='fixed-2r'?'—':x.vsFixed.t?.toFixed(2)??'—'}</td><td className="p-1">{s.modelChoices[p]??0}</td></tr>)}
 </tbody></table>;
}
export default function CryptoExitSelect({refreshVersion=0}:{refreshVersion?:number}){
 const [data,setData]=useState<View|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function call(train=false){
  setBusy(true);setError('');
  try{const r=await fetch('/api/admin/crypto-markets/exit-select',{method:train?'POST':'GET',cache:'no-store',...(train?{headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'train'})}:{})}),b=await r.json();
   if(b.config)setData(b);if(!r.ok)throw Error(b.error||'Exit selection unavailable');}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 useEffect(()=>{void call();},[refreshVersion]);
 const c=data?.config,m=data?.model,r=m?.report,lock=data?.holdoutLock,live=data?.live;
 return <section aria-label="Exit selection" className="space-y-3 rounded border border-teal-700 p-4">
  <h2 className="text-xl">Exit selection · SIMULATED · LOG ONLY</h2>
  <p className="text-sm">Chooses which exit plan to run for each confirmed setup, from features known at the signal close. Live choices are <b>recorded only</b>: every paper position keeps the live fixed 2R exits.</p>
  <details className="rounded border border-slate-700 p-3 text-sm"><summary className="font-semibold">Method</summary><ul className="list-disc space-y-1 pl-5 text-slate-300">
   <li><b>Plans:</b> {c?.plans.join(', ')}. One regression model per plan predicts that plan&apos;s net R ({c?.gbt.trees} trees, depth {c?.gbt.depth}, at least {c?.gbt.minLeaf} signals per leaf; training targets clipped at the 1st/99th percentile). The model picks the highest prediction.</li>
   <li><b>Compared with:</b> always the live fixed plan; the single plan with the best mean R on each window&apos;s training data; and the hindsight best per signal, an upper bound nobody can reach.</li>
   <li><b>Data:</b> the History replay dataset ({c?.featuresVersion}); only signals where every plan has a closed outcome. Same walk-forward ({c?.foldDays}-day windows, {c?.embargoDays}-day embargo, outcomes known before each window) and the same locked holdout window as the Shadow model, with its own look count.</li>
   <li><b>Reading it:</b> a mean difference vs fixed with |t| below about 2 is within noise. Plans that hold longer can look better in calm periods and worse in sharp reversals; check the per-window table before trusting a pooled number.</li>
  </ul></details>
  <div className="flex flex-wrap items-center gap-3"><button disabled={busy} onClick={()=>void call(true)} className="rounded bg-teal-800 px-3 py-2 disabled:opacity-50">{m?'Train again':'Train selector'}</button>{busy&&<span>Working… (up to a few minutes)</span>}</div>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  {lock&&<p className="text-sm">Holdout locked {day(lock.lockedAt)}: signals {day(lock.from)} → {day(lock.to)} · looked at {lock.looks} time{lock.looks===1?'':'s'}{lock.looks>3?<span className="text-amber-300"> · repeated looks: treat holdout results as optimistic</span>:null}</p>}
  {!m&&!busy&&<p className="text-sm text-slate-400">No selector trained yet. Complete the History replay first.</p>}
  {r&&<div className="space-y-3 text-sm">
   <p>{m!.version} trained {new Date(m!.trainedAt).toLocaleString()} on replay run {day(r.datasetRunId)} · {r.labelled.toLocaleString()} signals with every plan closed{r.incomplete?` · ${r.incomplete.toLocaleString()} excluded (a plan open at the data end or a data gap)`:''}</p>
   <h3 className="font-semibold">Walk-forward (out of sample, {r.folds.length} windows)</h3>
   <div className="overflow-auto"><Table s={r.walkForward}/></div>
   <details><summary>Every plan, and how often the model chose it</summary><div className="overflow-auto"><Plans s={r.walkForward}/></div></details>
   <details><summary>Per window</summary><div className="overflow-auto"><table className="min-w-[600px] text-left text-xs"><thead><tr>{['Test window','Train','Test','Best plan on training','Fixed','Best single','Model'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody>
    {r.folds.map(f=><tr key={f.testFrom} className="border-t border-slate-800"><td className="p-1">{day(f.testFrom)} → {day(f.testTo)}</td><td className="p-1">{f.train}</td><td className="p-1">{f.test}</td><td className="p-1">{f.staticBest}</td><td className="p-1">{rf(f.meanR.fixed)}</td><td className="p-1">{rf(f.meanR.staticBest)}</td><td className="p-1">{rf(f.meanR.model)}</td></tr>)}
   </tbody></table></div></details>
   <h3 className="font-semibold">Locked holdout ({day(r.holdout.from)} → {day(r.holdout.to)}; best single plan on training: {r.holdout.staticBest??'—'})</h3>
   {r.holdout.summary?<><div className="overflow-auto"><Table s={r.holdout.summary}/></div><details><summary>Every plan (holdout)</summary><div className="overflow-auto"><Plans s={r.holdout.summary}/></div></details></>:<p className="text-slate-400">No holdout signals in this dataset.</p>}
   <details><summary>What each plan&apos;s model leaned on</summary><ul className="pl-5 text-xs">{r.importance.map(x=><li key={x.plan}><b>{x.plan}:</b> {x.top.filter(t=>t.share>0).map(t=>`${t.feature} ${pc(t.share)}`).join(', ')||'no splits (predicts the training mean)'}</li>)}</ul></details>
  </div>}
  <h3 className="text-sm font-semibold">Live choices (log only)</h3>
  <p className="text-xs text-slate-400">Recorded by the shadow scoring step for new live signals. Outcomes come from the signal ledger&apos;s replay of skipped signals; taken signals are tracked in the paper ledger and its shadow plans. {live?.resolved?`Resolved: ${live.resolved} · chosen minus fixed: ${rf(live.chosenMinusFixedR)} per signal (small sample).`:'No resolved choices yet.'}</p>
  {!!live?.recent.length&&<div className="overflow-auto"><table className="min-w-[600px] text-left text-xs"><thead><tr>{['Signal','Coin','Chosen plan','Expected','Decision','Fixed outcome','Chosen outcome'].map(h=><th key={h} className="p-1">{h}</th>)}</tr></thead><tbody>
   {live.recent.map(x=><tr key={x.signalId} className="border-t border-slate-800"><td className="p-1">{new Date(x.signalAt).toLocaleString()}</td><td className="p-1">{x.coin}</td><td className="p-1">{x.plan??'—'}</td><td className="p-1">{rf(x.expectedR)}</td><td className="p-1">{x.decision??'—'}</td><td className="p-1">{x.resolved?rf(x.fixedR):x.decision==='TAKEN'?'See paper ledger':'Pending'}</td><td className="p-1">{x.resolved?rf(x.chosenR):'Pending'}</td></tr>)}
  </tbody></table></div>}
 </section>;
}
