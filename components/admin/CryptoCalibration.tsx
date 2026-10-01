'use client';
import {useEffect,useState} from 'react';
import type {CalibrationField,CalibrationLedger,CalibrationSide} from '@/lib/admin/cryptoCalibration';
const fmt=(n:number|null,unit:'R'|'%')=>n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}${unit}`;
const STATUS:Record<CalibrationSide['status'],string>={collecting:'text-slate-400',flat:'text-slate-300',directional:'text-sky-300',confirmed:'text-emerald-300',contradicted:'text-amber-300'};
function FieldTable({field}:{field:CalibrationField}){
 return <div className="overflow-auto">
  <h4 className="mt-2 text-sm font-semibold">{field.label} <span className="font-normal text-slate-400">· {field.id} · {field.ruleVersion} · {field.observations} rows · {field.file}{field.sides.some(s=>!s.informational&&s.n<30)?' · sides under 30 rows in amber':''}</span></h4>
  <table className="w-full min-w-[820px] text-left text-sm"><thead><tr>{['Side','Rows','Mean','Lift','SE','Half A lift (n)','Half B lift (n)','Status'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>
   {field.sides.map(s=><tr key={s.side} className={`border-t border-slate-700 ${!s.informational&&s.n<30?'text-amber-200/80':''}`}>
    <td className="p-2">{s.side}{s.informational?<span className="text-slate-500"> · not graded</span>:null}</td>
    <td className="p-2">{s.n}</td>
    <td className="p-2">{fmt(s.mean,field.unit)}</td>
    <td className={`p-2 ${s.lift==null||s.informational?'':s.lift>0?'text-emerald-300':'text-red-300'}`}>{fmt(s.lift,field.unit)}</td>
    <td className="p-2">{s.se==null?'—':s.se.toFixed(2)}</td>
    <td className="p-2">{fmt(s.halfA.lift,field.unit)} ({s.halfA.n})</td>
    <td className="p-2">{fmt(s.halfB.lift,field.unit)} ({s.halfB.n})</td>
    <td className={`p-2 ${STATUS[s.status]}`}>{s.informational?'—':s.status}</td>
   </tr>)}
  </tbody></table>
 </div>;
}
const RANK:Record<CalibrationSide['status'],number>={confirmed:5,contradicted:4,directional:3,flat:2,collecting:1};
/** One line per field: how much is graded and the side with the most rows. Click to open the full table. */
function Overview({title,fields}:{title:string;fields:CalibrationField[]}){
 const [open,setOpen]=useState<Record<string,boolean>>({});
 const [showEmpty,setShowEmpty]=useState(false);
 const all=fields.map(f=>{
  const graded=f.sides.filter(s=>!s.informational);
  const lead=[...graded].sort((a,b)=>b.n-a.n)[0]??null;
  const status=graded.reduce<CalibrationSide['status']|null>((best,s)=>!best||RANK[s.status]>RANK[best]?s.status:best,null);
  return {f,graded,lead,status,gradedRows:graded.reduce((s,x)=>s+x.n,0)};
 });
 const anyGraded=all.some(r=>r.gradedRows>0);
 const empty=all.filter(r=>r.gradedRows===0).length;
 const rows=showEmpty?all:all.filter(r=>r.gradedRows>0);
 const thin=rows.some(r=>r.gradedRows>0&&r.gradedRows<30);
 return <div className="space-y-1 rounded border border-sky-800 p-3">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <h3 className="text-sm font-semibold">{title}</h3>
   {anyGraded&&!!empty&&<button type="button" aria-pressed={showEmpty} onClick={()=>setShowEmpty(v=>!v)} className="rounded border border-slate-600 px-2 py-0.5 text-xs text-slate-300">{showEmpty?`Hide ${empty} field${empty===1?'':'s'} with no graded rows`:`Show ${empty} field${empty===1?'':'s'} with no graded rows`}</button>}
  </div>
  {!anyGraded&&<p className="text-xs text-slate-400">No graded rows yet for this outcome. Fields appear here as soon as one side has a recorded value.</p>}
  {anyGraded&&thin&&<p className="text-xs text-slate-400">Fields under 30 graded rows are shown in amber; differences there are noise.</p>}
  {anyGraded&&<div className="overflow-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr>{['Field','Graded rows','Sides','Largest side','n','Lift','Status',''].map((h,i)=><th className="p-2" key={i}>{h}</th>)}</tr></thead><tbody>
   {rows.map(({f,graded,lead,status,gradedRows})=><FragmentRow key={f.id} f={f} graded={graded} lead={lead} status={status} gradedRows={gradedRows} open={!!open[f.id]} toggle={()=>setOpen(o=>({...o,[f.id]:!o[f.id]}))}/>)}
  </tbody></table></div>}
 </div>;
}
function FragmentRow({f,graded,lead,status,gradedRows,open,toggle}:{f:CalibrationField;graded:CalibrationSide[];lead:CalibrationSide|null;status:CalibrationSide['status']|null;gradedRows:number;open:boolean;toggle:()=>void}){
 return <>
  <tr className={`border-t border-slate-700 ${gradedRows>0&&gradedRows<30?'text-amber-200/80':''}`}>
   <td className="p-2">{f.label}<div className="text-xs text-slate-500">{f.id} · {f.ruleVersion}</div></td>
   <td className="p-2">{gradedRows}</td>
   <td className="p-2">{graded.length}</td>
   <td className="p-2">{lead?.side??'—'}</td>
   <td className="p-2">{lead?.n??'—'}</td>
   <td className={`p-2 ${lead?.lift==null?'':lead.lift>0?'text-emerald-300':'text-red-300'}`}>{lead?fmt(lead.lift,f.unit):'—'}</td>
   <td className={`p-2 ${status?STATUS[status]:''}`}>{status??'—'}</td>
   <td className="p-2"><button type="button" aria-expanded={open} onClick={toggle} className="rounded border border-slate-600 px-2 py-0.5 text-xs">{open?'Hide':'Sides'}</button></td>
  </tr>
  {open&&<tr className="border-t border-slate-800 bg-slate-900/40"><td colSpan={8} className="p-2"><FieldTable field={f}/></td></tr>}
 </>;
}
export default function CryptoCalibration({refreshVersion=0}:{refreshVersion?:number}){
 const [ledger,setLedger]=useState<CalibrationLedger|null>(null),[stale,setStale]=useState(false),[saved,setSaved]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState(false),[filed,setFiled]=useState<string[]|null>(null);
 async function load(){
  const r=await fetch('/api/admin/crypto-markets/calibration',{cache:'no-store'});const b=await r.json();
  if(!r.ok)throw Error(b.error);setLedger(b.ledger);setStale(!!b.stale);setSaved(!!b.saved);setError('');
 }
 useEffect(()=>{load().catch(e=>setError(e.message||'Saved calibration unavailable'));},[refreshVersion]);
 async function refresh(){
  setBusy(true);setError('');setFiled(null);
  try{const r=await fetch('/api/admin/crypto-markets/calibration',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'refresh'})});const b=await r.json();
   if(!r.ok){if(b.ledger)setLedger(b.ledger);throw Error(b.error);}
   setLedger(b.ledger);setStale(false);setSaved(true);setFiled(b.filedNow??[]);
  }catch(e){setError(e instanceof Error?e.message:'Calibration unavailable');}finally{setBusy(false);}
 }
 const paper=ledger?.fields.filter(f=>f.outcome==='paperR')??[],forward=ledger?.fields.filter(f=>f.outcome==='forward24h')??[],base=ledger?.fields.filter(f=>f.outcome==='baseR')??[];
 return <section aria-label="Calibration ledger" className="space-y-3 rounded border border-slate-600 p-4">
  <h2 className="text-xl">Calibration ledger · evidence only</h2>
  <p className="text-sm text-slate-300">Every recorded evidence field against the outcome already stored beside it: R on closed paper trades, and the 24h mark on saved forward rows. Lift is the side's mean minus the overall mean on the same rows. A side is <span className="text-emerald-300">confirmed</span> only when both time halves agree on the sign of the lift with at least 15 rows each and the lift clears 0.25R or 1%. Confirmed sides file one text recommendation (at most three a week); a person decides what to do with it. Nothing here changes a rule, opens a trade, or calls Jev.</p>
  <div className="flex flex-wrap items-center gap-3">
   <button disabled={busy} onClick={()=>void refresh()} className="rounded bg-slate-700 px-3 py-2 disabled:opacity-50">{busy?'Recomputing…':'Recompute from saved rows'}</button>
   {ledger&&<span className="text-xs text-slate-400">Computed {new Date(ledger.checkedAt).toLocaleString()} · sources: {ledger.source.closedTrades} closed trades ({ledger.source.withR} with R), {ledger.source.forwardRows} forward rows ({ledger.source.forwardFilled24h} with a 24h mark){ledger.source.baseTrades!=null?`, ${ledger.source.baseTrades} base-sleeve trades (${ledger.source.baseWithR??0} with R)`:''} · split at {ledger.source.splitAt.paper??'—'} / {ledger.source.splitAt.forward??'—'}{stale?<span className="text-amber-300"> · STALE (over 36h)</span>:null}</span>}
  </div>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  {filed&&<p className="text-xs text-slate-400">{filed.length?`Filed ${filed.length} recommendation${filed.length===1?'':'s'}: ${filed.join(', ')}. Review them in the Recommendations tab.`:'No new recommendation was due.'}</p>}
  {!ledger&&!error&&<p>{saved?'Loading saved calibration…':'No saved calibration yet. The daily cron writes one, or recompute now.'}</p>}
  {ledger&&<>
   <p className="text-sm">{ledger.note}</p>
   <Overview title="Paper ledger · outcome R per closed trade" fields={paper}/>
   <Overview title="Forward score · outcome 24h move after the signal" fields={forward}/>
   {!!base.length&&<Overview title="Base-breakout sleeve · outcome R per closed trade (separate ledger)" fields={base}/>}
  </>}
 </section>;
}
