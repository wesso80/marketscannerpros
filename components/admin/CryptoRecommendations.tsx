'use client';
import {useEffect,useState} from 'react';
import type {Recommendation} from '@/lib/admin/cryptoRecommendations';
const empty={setup:'',evidenceCount:'',proposedRuleChange:'',file:''};
export default function CryptoRecommendations({refreshVersion=0}:{refreshVersion?:number}){
 const [rows,setRows]=useState<Recommendation[]|null>(null),[form,setForm]=useState(empty),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function send(body:Record<string,string>){
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/admin/crypto-markets/recommendations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const payload=await response.json();
   if(!response.ok)throw Error(payload.error||'Recommendations unavailable');
   setRows(payload.rows);
   if(body.action==='create')setForm(empty);
  }catch(reason){setError(reason instanceof Error?reason.message:'Recommendations unavailable');}
  finally{setBusy(false);}
 }
 useEffect(()=>{const controller=new AbortController();
  void fetch('/api/admin/crypto-markets/recommendations',{cache:'no-store',signal:controller.signal}).then(async response=>{const payload=await response.json();if(!response.ok)throw Error(payload.error);if(!controller.signal.aborted){setRows(payload.rows);setError('');}}).catch(reason=>{if(!controller.signal.aborted&&reason.name!=='AbortError')setError(reason.message||'Recommendations unavailable');});
  return ()=>controller.abort();
 },[refreshVersion]);
 return <section aria-label="Recommendations" className="space-y-3 rounded border border-slate-600 p-4">
  <h2 className="text-xl">Recommendations</h2>
  <p className="text-sm text-slate-300">Text only. A row records the setup, the evidence count, the proposed rule change, and the file it would touch. Unread, read, and accepted do not edit code. No job applies a playbook change.</p>
  {error&&<p role="alert" className="text-amber-300">{error}</p>}
  {!rows&&!error&&<p>Loading recommendations…</p>}
  {rows&&!rows.length&&<p role="status" className="text-slate-400">No recommendations yet. The calibration ledger files one when a side is confirmed (at most three a week); you can also add one by hand below.</p>}
  {!!rows?.length&&<div className="overflow-auto"><table className="w-full min-w-[860px] text-left text-sm"><thead><tr>{['Status','Setup','Evidence count','Proposed rule change','File it would touch',''].map(heading=><th className="p-2" key={heading||'action'}>{heading}</th>)}</tr></thead><tbody>{rows.map(row=><tr className="border-t border-slate-700" key={row.id}><td className="p-2">{row.status}</td><td className="p-2">{row.setup}</td><td className="p-2">{row.evidenceCount}</td><td className="p-2">{row.proposedRuleChange}</td><td className="p-2">{row.file}</td><td className="p-2">{row.status==='unread'&&<button disabled={busy} onClick={()=>void send({action:'status',id:row.id,status:'read'})} className="rounded border px-2 py-1">Mark read</button>}{row.status==='read'&&<button disabled={busy} onClick={()=>void send({action:'status',id:row.id,status:'accepted'})} className="rounded border px-2 py-1">Mark accepted</button>}{row.status==='accepted'&&<span className="text-slate-400">Accepted does not edit code.</span>}</td></tr>)}</tbody></table></div>}
  <details className="rounded border border-slate-700 p-3"><summary className="cursor-pointer text-sm">Add a recommendation by hand</summary>
  <form className="mt-2 grid gap-2 sm:grid-cols-2" onSubmit={event=>{event.preventDefault();void send({action:'create',...form});}}>
   <label className="text-sm">Setup<input aria-label="Setup" value={form.setup} onChange={event=>setForm(current=>({...current,setup:event.target.value}))} className="mt-1 w-full rounded border bg-slate-900 px-2 py-1" /></label>
   <label className="text-sm">Evidence count<input aria-label="Evidence count" value={form.evidenceCount} onChange={event=>setForm(current=>({...current,evidenceCount:event.target.value}))} className="mt-1 w-full rounded border bg-slate-900 px-2 py-1" /></label>
   <label className="text-sm sm:col-span-2">Proposed rule change<textarea aria-label="Proposed rule change" value={form.proposedRuleChange} onChange={event=>setForm(current=>({...current,proposedRuleChange:event.target.value}))} className="mt-1 w-full rounded border bg-slate-900 px-2 py-1" rows={3} /></label>
   <label className="text-sm sm:col-span-2">File it would touch<input aria-label="File it would touch" value={form.file} onChange={event=>setForm(current=>({...current,file:event.target.value}))} className="mt-1 w-full rounded border bg-slate-900 px-2 py-1" /></label>
   <button disabled={busy} className="w-fit rounded border px-3 py-2">Add recommendation</button>
  </form>
  </details>
 </section>;
}
