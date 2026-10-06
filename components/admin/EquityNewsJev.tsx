'use client';
import {useEffect,useState} from 'react';
import type {NewsLedger,NewsLedgerField} from '@/lib/admin/equityNewsJev';
import type {CalibrationSide} from '@/lib/admin/calibrationCore';
const fmt=(n:number|null)=>n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}%`;
const STATUS:Record<CalibrationSide['status'],string>={collecting:'text-slate-400',flat:'text-slate-300',directional:'text-sky-300',confirmed:'text-emerald-300',contradicted:'text-amber-300'};
function FieldTable({field}:{field:NewsLedgerField}){
 return <div className="overflow-auto">
  <h4 className="mt-2 text-sm font-semibold">{field.label} <span className="font-normal text-slate-400">· {field.id} · {field.ruleVersion} · {field.observations} rows</span></h4>
  <table className="w-full min-w-[820px] text-left text-sm"><thead><tr>{['Side','Rows','Mean next-day','Lift','SE','Half A lift (n)','Half B lift (n)','Status'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>
   {field.sides.map(s=><tr key={s.side} className="border-t border-slate-700">
    <td className="p-2">{s.side}{s.informational?<span className="text-slate-500"> · not graded</span>:null}</td>
    <td className="p-2">{s.n}{s.n<30?<span className="text-amber-300"> · thin</span>:null}</td>
    <td className="p-2">{fmt(s.mean)}</td>
    <td className={`p-2 ${s.lift==null||s.informational?'':s.lift>0?'text-emerald-300':'text-red-300'}`}>{fmt(s.lift)}</td>
    <td className="p-2">{s.se==null?'—':s.se.toFixed(2)}</td>
    <td className="p-2">{fmt(s.halfA.lift)} ({s.halfA.n})</td>
    <td className="p-2">{fmt(s.halfB.lift)} ({s.halfB.n})</td>
    <td className={`p-2 ${STATUS[s.status]}`}>{s.informational?'—':s.status}</td>
   </tr>)}
  </tbody></table>
 </div>;
}
export default function EquityNewsJev(){
 const [ledger,setLedger]=useState<NewsLedger|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState<''|'score'|'label'>(''),[last,setLast]=useState('');
 async function load(){const r=await fetch('/api/admin/equity-news-jev',{cache:'no-store'});const b=await r.json();if(!r.ok)throw Error(b.error);setLedger(b.ledger);setError('');}
 useEffect(()=>{load().catch(e=>setError(e.message||'Ledger unavailable'));},[]);
 async function run(action:'score'|'label'){
  setBusy(action);setError('');setLast('');
  try{const r=await fetch('/api/admin/equity-news-jev',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})});const b=await r.json();
   if(b.ledger)setLedger(b.ledger);
   if(!r.ok)throw Error(b.error);
   setLast(action==='score'?`Scored ${b.result.scored}, unavailable ${b.result.unavailable}${b.result.skipped?` (skipped: ${b.result.skipped})`:''}.`:`Labelled ${b.result.labelled}, waiting for the next bar ${b.result.waiting}, closed with no price series ${b.result.noBars}.`);
  }catch(e){setError(e instanceof Error?e.message:'Step failed');}finally{setBusy('');}
 }
 const s=ledger?.source,reasons=s?Object.entries(s.reasons).map(([k,v])=>`${k} ${v}`).join(', '):'';
 const stale=!!ledger&&Date.now()-Date.parse(ledger.checkedAt)>36*3600000;
 return <section aria-label="Equity news verification" className="space-y-3 rounded border border-slate-600 p-4">
  <h2 className="text-xl">News verification · Jev against next-day return · evidence only</h2>
  <p className="text-sm text-slate-300">Each stored catalyst headline is scored once by Jev from its text alone: about this company, price-material, direction, event class. The regex classifier&apos;s subtype is not shown to Jev, so the two are compared side by side below. Outcome is the close of the first trading day after the event day over the close of the last trading day before it, from the worker&apos;s daily bars; no provider call is made to label. Nothing here changes a classification, a packet, or a rule.</p>
  <div className="flex flex-wrap items-center gap-3">
   <button disabled={!!busy} onClick={()=>void run('score')} className="rounded bg-slate-700 px-3 py-2 disabled:opacity-50">{busy==='score'?'Scoring…':'Score new headlines'}</button>
   <button disabled={!!busy} onClick={()=>void run('label')} className="rounded bg-slate-700 px-3 py-2 disabled:opacity-50">{busy==='label'?'Labelling…':'Label outcomes from saved bars'}</button>
   {s&&<span className="text-xs text-slate-400">Source: catalyst_events + news_jev_stamps · computed {new Date(ledger!.checkedAt).toLocaleString()} · {s.stamped} stamped ({s.scored} scored, {s.unavailable} unavailable{reasons?`: ${reasons}`:''}) · {s.labelled} labelled · {s.waiting} waiting · {s.noBars} no bars · split at {s.splitAt??'—'}{stale?<span className="text-amber-300"> · STALE</span>:null}</span>}
  </div>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  {last&&<p className="text-xs text-slate-400">{last}</p>}
  {!ledger&&!error&&<p>Loading…</p>}
  {ledger&&<>
   <p className="text-sm">{ledger.note}</p>
   {ledger.fields.map(f=><FieldTable key={f.id} field={f}/>)}
  </>}
 </section>;
}
